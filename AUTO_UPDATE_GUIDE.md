# Auto Update Guide — JD Connect

This document covers everything about how automatic updates work in JD Connect, how the CI pipeline is structured, what files get produced, and the full history of what we tried and what actually worked.

---

## How Auto Updates Work

When a user has the JD Connect desktop app installed and opens it:

1. **Background Startup Check**: The app spawns a background thread immediately upon startup.
2. **Endpoint Query**: It queries the `latest.json` file hosted on GitHub Releases.
3. **Version Comparison**: It compares the version inside that file against the currently running app version.
4. **Dialog Notification**: If a newer version is available, a native dialog appears: 
   *"A new version (vX.X.X) of JD Connect is available. Would you like to download and install it now?"*
5. **Cryptographic Validation**: If the user clicks **Yes**, the app downloads the update archive and checks the signature against the embedded public key using the `.sig` file.
6. **Installation & Relaunch**: If validation passes, the update is installed silently, and the app automatically restarts.

No manual downloads or manual re-installations are needed.

---

## Understanding Cryptographic Signatures (`.sig` files)

Tauri enforces mandatory cryptographic verification for auto-updates. This is a critical security layer that protects users.

### What are `.sig` files?
A `.sig` file contains a **Minisign signature** generated using a private signing key. Minisign is a secure cryptographic tool used for signing files and verifying signatures. 

Every platform updater artifact must have a corresponding `.sig` file:
* `JD Connect_x.x.x_x64_en-US.msi` $\rightarrow$ `JD Connect_x.x.x_x64_en-US.msi.sig`
* `JD Connect_aarch64.app.tar.gz` $\rightarrow$ `JD Connect_aarch64.app.tar.gz.sig`

### Why are they used?
Without signatures, auto-updates are extremely vulnerable:
1. **Preventing MITM (Man-in-the-Middle) Attacks**: If an attacker intercepting the update checks (or compromising your release endpoint) substitutes your `.msi` file with a malicious executable, a signature check ensures it will not run.
2. **Origin Verification**: The signature proves that the update was built and packaged by the holder of the private signing key (`.tauri-signing-key`).
3. **Data Integrity**: The signature verifies that the downloaded installer has not been modified or corrupted during transit.

Tauri's updater plugin **strictly refuses** to install any update if the cryptographic signature is missing, cannot be parsed, or fails validation against the public key configured in the application.

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
| `latest.json` | The updater manifest — contains metadata, signature keys, and download links |

### First-Time Installation vs. Updates

* **`.dmg` and `.exe`**: Used for onboarding new users. They package the app into convenient platform installers.
* **`.app.tar.gz` and `.msi`**: Downloaded automatically by the updater. They represent the raw app bundle needed for hot-swapping the old version.
* **`latest.json`**: Checked on launch by the client app. Contains version details, changelogs, download links, and platform-specific signatures.

---

## One-Time Setup

### 1. Generate a signing key pair

Run this once in your project folder:

```cmd
bun tauri signer generate -w .tauri-signing-key
```

This produces:
* `.tauri-signing-key` — private key, **never commit this**
* `.tauri-signing-key.pub` — public key, goes in `tauri.conf.json`

### 2. Add the private key to `.gitignore`

Ensure `.tauri-signing-key` is added to your gitignore so it is never leaked.

### 3. Add the private key to GitHub Secrets

1. Go to your repo $\rightarrow$ **Settings** $\rightarrow$ **Secrets and variables** $\rightarrow$ **Actions**
2. Click **New repository secret**
3. Name: `TAURI_SIGNING_PRIVATE_KEY`
4. Value: Paste the entire contents of `.tauri-signing-key`

---

## Configuration

### `src-tauri/tauri.conf.json`

Ensure your bundle configurations match Tauri v2 specifications:

```json
"bundle": {
  "active": true,
  "targets": "all",
  "createUpdaterArtifacts": true,
  "icon": [...]
}
```

> **Warning**: Without `createUpdaterArtifacts: true`, Tauri will build release binaries but will skip generating the crucial `.sig` files.

Configure your updater endpoint and embedded public key:

```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/KashishKami/jd_connect/releases/latest/download/latest.json"
    ],
    "pubkey": "YOUR_PUBLIC_KEY_CONTENTS_HERE"
  }
}
```

*Note: In Tauri v2, setting `"dialog": true` inside `tauri.conf.json` does nothing because the core automatic dialog has been removed. Triggering must be done explicitly in code.*

---

## Code Implementation (Tauri v2)

Because Tauri v2 decouples the updater from the user interface, the check is implemented in the Rust backend on application startup.

### 1. Dependencies (`src-tauri/Cargo.toml`)

Add the required plugins to manage updater checks, message dialogs, and app restarts:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-updater = "2"
tauri-plugin-dialog = "2"
tauri-plugin-process = "2"
```

### 2. Capabilities (`src-tauri/capabilities/default.json`)

Declare the default permissions for the plugins:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "enables the default permissions",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "updater:default",
    "dialog:default",
    "process:default"
  ]
}
```

### 3. Application Setup (`src-tauri/src/lib.rs`)

Initialize the plugins and check for updates inside the `setup` hook:

```rust
use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_dialog::{MessageDialogKind, MessageDialogButtons};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_process::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Check for updates on startup (desktop only)
      #[cfg(desktop)]
      {
        let handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
          if let Ok(updater) = handle.updater() {
            match updater.check().await {
              Ok(Some(update)) => {
                let message = format!(
                  "A new version (v{}) of JD Connect is available. Would you like to download and install it now?",
                  update.version
                );

                let confirmed = handle.dialog()
                  .message(message)
                  .title("Update Available")
                  .kind(MessageDialogKind::Info)
                  .buttons(MessageDialogButtons::YesNo)
                  .blocking_show();

                if confirmed {
                  // Perform download and install
                  if let Err(e) = update.download_and_install(|_chunk_len, _total_len| {}, || {}).await {
                    handle.dialog()
                      .message(format!("Failed to install update: {}", e))
                      .title("Update Error")
                      .kind(MessageDialogKind::Error)
                      .buttons(MessageDialogButtons::Ok)
                      .blocking_show();
                  } else {
                    // Restart to apply
                    let _ = handle.restart();
                  }
                }
              }
              Ok(None) => {}
              Err(e) => {
                eprintln!("Failed to check for updates: {}", e);
              }
            }
          }
        });
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```

### 4. Dynamic Web Download Links (Portal Login Page)

Because the Tauri desktop wrapper loads your remote website in a webview, it's critical that the web portal's login page serves the actual, latest compiled release files for users who need to install the desktop client for the first time. 

Rather than committing static files like `public/JD_Connect.exe` to git and manually updating/committing them for every single release, the download links in the web application dynamically query the GitHub Release API on mount.

In [auth.tsx](file:///c:/Users/Administrator/Desktop/JD%20Connect/src/routes/auth.tsx), we handle this inside a React hook:

```typescript
const [downloadUrls, setDownloadUrls] = useState({
  win: "https://github.com/KashishKami/jd_connect/releases/latest",
  mac: "https://github.com/KashishKami/jd_connect/releases/latest",
});

useEffect(() => {
  fetch("https://api.github.com/repos/KashishKami/jd_connect/releases/latest")
    .then((res) => res.json())
    .then((data) => {
      if (data && data.assets) {
        // Find the direct download links for the built installer assets
        const winAsset = data.assets.find((asset: any) => asset.name.endsWith(".exe"));
        const macAsset = data.assets.find((asset: any) => asset.name.endsWith(".dmg"));
        setDownloadUrls({
          win: winAsset?.browser_download_url || "https://github.com/KashishKami/jd_connect/releases/latest",
          mac: macAsset?.browser_download_url || "https://github.com/KashishKami/jd_connect/releases/latest",
        });
      }
    })
    .catch((err) => {
      console.error("Failed to fetch latest release assets:", err);
    });
}, []);
```

In the JSX, the download anchors are bound directly:

```tsx
<a href={downloadUrls.win} target="_blank" rel="noopener noreferrer">
  Windows
</a>
<a href={downloadUrls.mac} target="_blank" rel="noopener noreferrer">
  macOS
</a>
```

This ensures:
* **Immediate Delivery**: Users downloading the installer on the login page always receive the latest release binary.
* **Fallback Safety**: If the GitHub API is rate-limited or fails, the link falls back to the latest releases page (`https://github.com/KashishKami/jd_connect/releases/latest`), where users can manually select their download.

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

1. **Bump the version** in `src-tauri/tauri.conf.json`.
2. **Commit and push** the change to GitHub.
3. **Tag the commit** matching the version (e.g. `v1.0.3`) and push the tag:
   ```cmd
   git tag v1.0.3
   git push origin v1.0.3
   ```
4. **CI/CD Build**: The GitHub Actions runner will compile the app for Windows and macOS, sign the binaries using your `TAURI_SIGNING_PRIVATE_KEY` secret, assemble the signatures, generate `latest.json`, and publish them directly to a draft release.

---

## Troubleshooting

* **"Public key does not match"**: Ensure that the public key contents in `tauri.conf.json` match `.tauri-signing-key.pub` exactly. If you generated a new signing key, you must update this value.
* **Update dialog does not show**:
  1. Confirm your app's compiled version is strictly lower than the version in the hosted `latest.json`.
  2. Verify that the client can fetch the release page URL over the network.
  3. Run the application with `RUST_LOG=debug` to inspect detailed updater log logs.
* **"Signature not found for the updater JSON. Skipping upload"**: `createUpdaterArtifacts: true` is missing from the `bundle` section in `tauri.conf.json`. Without it, Tauri never generates `.sig` files. Add it and rebuild.
* **"no assets match the file pattern" in the publish job**: The `.sig` files weren't in the release when the publish job ran. Make sure the explicit upload steps are present in both build jobs.
* **YAML syntax error in the workflow**: Do not use heredocs (`<< EOF`) or multiline scripts inside a `run:` block. Use `jq` with `--arg` flags instead, as the current workflow does.
* **Windows upload step fails with "find not found"**: Use `shell: pwsh` with `Get-ChildItem` on Windows jobs. The Unix `find` command does not exist on Windows runners.
* **Build failed, need to retry the same tag**:
  ```cmd
  git tag -d v1.0.2
  git push origin --delete v1.0.2
  git tag v1.0.2
  git push origin v1.0.2
  ```

---

## Checklist

* [ ] `bun tauri signer generate -w .tauri-signing-key`
* [ ] `.tauri-signing-key` added to `.gitignore`
* [ ] `TAURI_SIGNING_PRIVATE_KEY` added to GitHub Secrets
* [ ] `"createUpdaterArtifacts": true` in `bundle` section of `tauri.conf.json`
* [ ] `updater` plugin configured in `tauri.conf.json` with correct pubkey and endpoint URL
* [ ] `tauri-plugin-updater = "2"` in `Cargo.toml`
* [ ] `tauri-plugin-dialog = "2"` and `tauri-plugin-process = "2"` added to `Cargo.toml`
* [ ] Updater, dialog, and process plugins registered in `lib.rs`
* [ ] Three-job workflow in place (`build-windows`, `build-macos`, `publish-release`)
* [ ] To release: bump version $\rightarrow$ commit $\rightarrow$ `git tag vX.X.X` $\rightarrow$ `git push origin vX.X.X`
