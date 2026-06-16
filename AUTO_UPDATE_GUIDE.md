# Auto Update Guide — JD Connect

This document covers everything about how automatic updates work in JD Connect, how the CI pipeline is structured, what files get produced, and the full history of what we tried and what actually worked.

---

## How Auto Updates Work

When a user has JD Connect installed and opens it:

1. The app silently checks a `latest.json` file hosted on GitHub Releases
2. It compares the version in that file against the version currently installed
3. If the remote version is newer, a dialog appears: *"A new version is available. Install now?"*
4. The user clicks yes — the update downloads, verifies its signature, installs, and the app relaunches

No manual download. No reinstall. It just works.

---

## What Files Get Produced in Each Release

Every release produces these files:

| File | Purpose |
|------|---------|
| `JD Connect_x.x.x_aarch64.dmg` | macOS — **first time install only** |
| `JD Connect_x.x.x_x64-setup.exe` | Windows — **first time install only** |
| `JD Connect_x.x.x_x64_en-US.msi` | Windows — **used by the auto updater** |
| `JD Connect_aarch64.app.tar.gz` | macOS — **used by the auto updater** |
| `JD Connect_aarch64.app.tar.gz.sig` | macOS updater signature |
| `JD Connect_x.x.x_x64_en-US.msi.sig` | Windows updater signature |
| `latest.json` | The updater manifest — installed apps check this file |

### First time vs. updates

- **`.dmg` and `.exe`** are for users installing the app for the very first time. Share these when onboarding someone new.
- **`.app.tar.gz` and `.msi`** are what the auto updater downloads silently after the first install. You never need to share these manually.
- **`latest.json`** is the file every installed copy of the app checks on launch. It contains the version number, download URLs, and cryptographic signatures for both platforms.

Once a user has the app installed, the `.dmg` and `.exe` are never used again.

---

## One-Time Setup

### 1. Generate a signing key pair

Run this once in your project folder:

```cmd
bun tauri signer generate -w .tauri-signing-key
```

This produces:
- `.tauri-signing-key` — private key, **never commit this**
- `.tauri-signing-key.pub` — public key, goes in `tauri.conf.json`

### 2. Add the private key to `.gitignore`

```
.tauri-signing-key
```

### 3. Add the private key to GitHub Secrets

1. Go to your repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `TAURI_SIGNING_PRIVATE_KEY`
4. Value: paste the entire contents of `.tauri-signing-key`

> If you did not set a password when generating the key, do not add a `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secret. GitHub Secrets don't accept blank values. The workflow already handles this by passing `""` directly in the `env` block.

---

## Configuration

### `src-tauri/tauri.conf.json`

Two things must be present:

**1. `createUpdaterArtifacts: true` in the `bundle` section**

```json
"bundle": {
  "active": true,
  "targets": "all",
  "createUpdaterArtifacts": true,
  "icon": [...]
}
```

Without this, Tauri will not generate `.sig` files at all — even if the signing key is correctly configured. The build succeeds, the `.dmg` and `.exe` get produced, but the updater artifacts are silently skipped. This was the root cause of the "Signature not found" error we hit.

**2. The `updater` plugin section**

```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/KashishKami/jd_connect/releases/latest/download/latest.json"
    ],
    "dialog": true,
    "pubkey": "YOUR_PUBLIC_KEY_CONTENTS_HERE"
  }
}
```

The `pubkey` value is the full contents of your `.tauri-signing-key.pub` file.

### `src-tauri/Cargo.toml`

Make sure `tauri-plugin-updater` is in `[dependencies]`:

```toml
tauri-plugin-updater = "2"
```

> In Tauri v2, do **not** add `features = ["updater"]` to the `tauri` line. That causes a build error. The plugin is separate.

### `src-tauri/src/lib.rs`

Register the updater plugin:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```

---

## The GitHub Actions Workflow

### Why the workflow is structured the way it is

The naive approach — two parallel jobs both calling `tauri-action` with `includeUpdaterJson: true` — fails with:

```
Signature not found for the updater JSON. Skipping upload...
```

Both jobs run in parallel and each tries to generate `latest.json` as soon as it finishes. But `latest.json` needs signatures from both platforms. Whichever job finishes first only has one signature, so `tauri-action` skips the JSON entirely.

The fix is a three-job structure:
1. `build-windows` — builds, signs, uploads `.sig` files to a draft release
2. `build-macos` — same, in parallel
3. `publish-release` — runs only after both complete, downloads the `.sig` files, builds `latest.json` manually using `jq`, publishes the release

The third job does **not** rebuild anything. It just reads the already-uploaded `.sig` files and writes the JSON. No Rust, no Bun, no Linux GTK dependency issues.

### Why we don't use `tauri-action` in the third job

`tauri-action` always does a full Rust compile — there's no "skip build" option. Running it on `ubuntu-latest` to just generate JSON would also require installing GTK/GLib system libraries (`libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, etc.) and would produce a Linux build artifact instead of the macOS one you actually want. Using `jq` directly avoids all of that.

### Why we explicitly upload `.sig` files

When `includeUpdaterJson: false`, `tauri-action` does not upload `.sig` files to the release. They stay local on the runner and are lost when the job ends. Each build job has an explicit upload step to push those files to the draft release before the runner shuts down.

### The value of the debug step

Before knowing the exact filenames Tauri produces, we added a debug step to list everything in the bundle output directory. This revealed:
- On macOS: `JD Connect.app.tar.gz.sig`
- On Windows: `JD Connect_1.0.1_x64_en-US.msi.sig` and `JD Connect_1.0.1_x64-setup.exe.sig`

It also revealed that before adding `createUpdaterArtifacts: true`, there were **zero** `.sig` files in the output — which is how we identified the missing config as the root cause. Keep these debug steps in. They're instant and invaluable when something breaks.

### The final working workflow

```yaml
name: Build and Release Desktop Apps

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

permissions:
  contents: write

jobs:

  build-windows:
    name: Build Windows (.exe)
    runs-on: windows-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: x86_64-pc-windows-msvc

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ""
        with:
          tauriScript: bun tauri
          tagName: ${{ github.ref_name }}
          releaseName: "JD Connect ${{ github.ref_name }}"
          releaseBody: "See the release notes for this version."
          releaseDraft: true
          prerelease: false
          includeUpdaterJson: false

      - name: List bundle output (debug)
        shell: pwsh
        run: Get-ChildItem -Path "src-tauri/target/release/bundle" -Recurse | Select-Object FullName

      - name: Upload .sig files to release
        shell: pwsh
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          $TAG = "${{ github.ref_name }}"
          $REPO = "${{ github.repository }}"
          Get-ChildItem -Path "src-tauri/target/release/bundle" -Recurse -Filter "*.sig" | ForEach-Object {
            Write-Host "Uploading $($_.FullName)"
            gh release upload $TAG $_.FullName --repo $REPO --clobber
          }

  build-macos:
    name: Build macOS (.dmg)
    runs-on: macos-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ""
        with:
          tauriScript: bun tauri
          tagName: ${{ github.ref_name }}
          releaseName: "JD Connect ${{ github.ref_name }}"
          releaseBody: "See the release notes for this version."
          releaseDraft: true
          prerelease: false
          includeUpdaterJson: false

      - name: List bundle output (debug)
        run: find src-tauri/target/release/bundle -type f

      - name: Upload .sig files to release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          TAG=${{ github.ref_name }}
          find src-tauri/target/release/bundle -name "*.sig" | while read sigfile; do
            echo "Uploading $sigfile"
            gh release upload "$TAG" "$sigfile" --repo ${{ github.repository }} --clobber
          done

  publish-release:
    name: Publish Release & Generate Updater JSON
    runs-on: ubuntu-latest
    needs: [build-windows, build-macos]

    steps:
      - name: Fetch release assets and build latest.json
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAG: ${{ github.ref_name }}
          REPO: ${{ github.repository }}
        run: |
          VERSION="${TAG#v}"
          PUB_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
          BASE_URL="https://github.com/${REPO}/releases/download/${TAG}"

          mkdir -p ./sigs
          gh release download "$TAG" --repo "$REPO" --pattern "*.sig" --dir ./sigs

          echo "Downloaded .sig files:"
          ls ./sigs/

          MACOS_SIG_FILE=$(find ./sigs -name "*.app.tar.gz.sig" | head -1)
          WIN_SIG_FILE=$(find ./sigs -name "*.msi.sig" | head -1)

          echo "macOS sig: $MACOS_SIG_FILE"
          echo "Windows sig: $WIN_SIG_FILE"

          MACOS_SIG=$(cat "$MACOS_SIG_FILE")
          WIN_SIG=$(cat "$WIN_SIG_FILE")

          MACOS_ASSET=$(gh release view "$TAG" --repo "$REPO" --json assets \
            --jq '.assets[] | select(.name | endswith(".app.tar.gz")) | .name' | head -1)
          WIN_ASSET=$(gh release view "$TAG" --repo "$REPO" --json assets \
            --jq '.assets[] | select(.name | endswith(".msi")) | .name' | head -1)

          echo "macOS asset: $MACOS_ASSET"
          echo "Windows asset: $WIN_ASSET"

          MACOS_ASSET_ENC="${MACOS_ASSET// /%20}"
          WIN_ASSET_ENC="${WIN_ASSET// /%20}"

          jq -n \
            --arg version "$VERSION" \
            --arg pub_date "$PUB_DATE" \
            --arg macos_sig "$MACOS_SIG" \
            --arg macos_url "$BASE_URL/$MACOS_ASSET_ENC" \
            --arg win_sig "$WIN_SIG" \
            --arg win_url "$BASE_URL/$WIN_ASSET_ENC" \
            '{
              version: $version,
              notes: "See the release notes for this version.",
              pub_date: $pub_date,
              platforms: {
                "darwin-aarch64": { signature: $macos_sig, url: $macos_url },
                "windows-x86_64": { signature: $win_sig, url: $win_url }
              }
            }' > latest.json

          echo "Generated latest.json:"
          cat latest.json

          gh release upload "$TAG" ./latest.json --repo "$REPO" --clobber
          gh release edit "$TAG" --repo "$REPO" --draft=false
```

---

## Releasing a New Version

### Step 1 — Bump the version in `tauri.conf.json`

```json
"version": "1.0.2"
```

Versioning convention:
- `1.0.x` — bug fixes
- `1.x.0` — new features
- `x.0.0` — breaking changes

### Step 2 — Commit and push

```cmd
git add src-tauri/tauri.conf.json
git commit -m "Bump version to 1.0.2"
git push
```

### Step 3 — Tag and push

```cmd
git tag v1.0.2
git push origin v1.0.2
```

This triggers the workflow automatically. Both build jobs run in parallel, then the publish job runs after both finish. The release goes live with all artifacts and `latest.json` correctly populated.

### Step 4 — Users get the update

Next time any installed copy of the app opens, it checks `latest.json`. If the installed version is older, the user sees the update prompt and can install with one click.

---

## Troubleshooting

**"Signature not found for the updater JSON. Skipping upload"**
`createUpdaterArtifacts: true` is missing from the `bundle` section in `tauri.conf.json`. Without it, Tauri never generates `.sig` files. Add it and rebuild.

**"no assets match the file pattern" in the publish job**
The `.sig` files weren't in the release when the publish job ran. Make sure the explicit upload steps are present in both build jobs — `tauri-action` with `includeUpdaterJson: false` does not upload `.sig` files on its own.

**YAML syntax error in the workflow**
Do not use heredocs (`<< EOF`) or multiline `python3 -c "..."` inside a `run:` block — YAML parsers choke on them. Use `jq` with `--arg` flags instead, as the current workflow does.

**Windows upload step fails with "find not found"**
Use `shell: pwsh` with `Get-ChildItem` on Windows jobs. The Unix `find` command does not exist on Windows runners.

**Build failed, need to retry the same tag**

```cmd
git tag -d v1.0.2
git push origin --delete v1.0.2
git tag v1.0.2
git push origin v1.0.2
```

**"Public key does not match" at update time**
The `pubkey` in `tauri.conf.json` must exactly match your `.tauri-signing-key.pub`. If you ever regenerate the key pair, update the pubkey in the config and re-release.

---

## Checklist

- [ ] `bun tauri signer generate -w .tauri-signing-key`
- [ ] `.tauri-signing-key` added to `.gitignore`
- [ ] `TAURI_SIGNING_PRIVATE_KEY` added to GitHub Secrets
- [ ] `"createUpdaterArtifacts": true` in `bundle` section of `tauri.conf.json`
- [ ] `updater` plugin configured in `tauri.conf.json` with correct pubkey and endpoint URL
- [ ] `tauri-plugin-updater = "2"` in `Cargo.toml`
- [ ] Updater plugin registered in `lib.rs`
- [ ] Three-job workflow in place (`build-windows`, `build-macos`, `publish-release`)
- [ ] To release: bump version → commit → `git tag vX.X.X` → `git push origin vX.X.X`

---

*Tauri updater docs: [https://tauri.app/plugin/updater/](https://tauri.app/plugin/updater/)*
