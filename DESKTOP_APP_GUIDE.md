# How to Build a Desktop App (.exe & .dmg) from a Web App using Tauri

This guide walks you through converting any web application into a native desktop app for **Windows (.exe)** and **macOS (.dmg)** using [Tauri](https://tauri.app). It is written for complete beginners — no prior experience with Rust or native app development required.

---

## What is Tauri?

Tauri is a framework that wraps your existing web app (HTML/CSS/JS/React/etc.) inside a native desktop window. It uses your operating system's built-in browser engine instead of bundling one, making the final app very lightweight.

- Windows app → `.exe` installer
- macOS app → `.dmg` disk image

Your web app code stays **exactly the same**. Tauri just puts a native frame around it.

---

## Two Modes: Live URL vs. Local Bundle

Before starting, decide which mode suits your app. **Pick one — you do not need both.**

### Mode A — Wrap a Live URL

Tauri creates a native window that loads your deployed app URL every time it opens. Think of it as a branded desktop browser tab — your code is **not** bundled inside the exe. It is always fetched live from the internet.

- ✅ Updates automatically — if you change your app on Lovable, users see the new version next time they open the desktop app. No rebuild, no redistribution.
- ✅ Simple setup — just point Tauri at your URL
- ✅ Smaller exe file size
- ❌ Requires internet to work (the app shows nothing if offline)

### Mode B — Bundle Source Code Locally

Tauri compiles your local source code into a `dist/` folder and packs that **snapshot** into the exe. The app carries its own frozen copy of the code.

- ✅ Works without internet (except any backend/API calls like Supabase, which still need internet)
- ❌ Does NOT update automatically — if you change your code on Lovable or anywhere else, those changes are invisible to users until you rebuild the exe and send them the new file
- ❌ More setup work
- ❌ You must keep your local code in sync with your deployed version manually

### Which one should you use?

**The honest answer:** For most hosted web apps, Mode A and Mode B feel identical to the end user. Both open a window and show your app. The difference is entirely in how updates work and whether it functions offline.

**Choose Mode A if:**
- Your app is accessible via any public URL — Lovable, Vercel, Netlify, Railway, a VPS, AWS, or any web server
- Your app uses a backend or API (like Supabase) that requires internet anyway
- You want updates to reach users automatically without redistributing the exe

**Choose Mode B if:**
- Your app has no deployment URL — it only exists on your local machine
- You need the app to work with zero internet access (and your backend also works offline)

> **For any publicly hosted web app: use Mode A.** If your app lives at a URL you can open in a browser, Mode A is the right choice. Since most web apps rely on a backend (like Supabase, Firebase, or any API) that requires internet anyway, Mode B offers no real offline benefit — it only adds a maintenance burden where you must rebuild and redistribute the exe every time your app changes. Mode A keeps everything in sync automatically.

---

## Prerequisites

You need the following installed on your machine before starting.

### 1. Node.js
Download from [https://nodejs.org](https://nodejs.org) — install the LTS version.

Verify it works:
```bash
node --version
npm --version
```

### 2. Rust
Tauri is built with Rust. Install it from [https://rustup.rs](https://rustup.rs).

On Windows, run the installer from that page. On macOS/Linux, run:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Verify:
```bash
rustc --version
cargo --version
```

> **Note:** After installing Rust on Windows, restart your terminal before continuing.

### 3. Windows-specific: WebView2
On Windows 10/11, WebView2 is usually already installed. If not, download it from:
[https://developer.microsoft.com/en-us/microsoft-edge/webview2/](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

### 4. Your package manager (npm, bun, yarn, etc.)
This guide uses `npm` in examples. Replace with `bun`, `yarn`, or `pnpm` if your project uses those.

---

## Part 1: Setting Up Tauri in Your Project

### Step 1 — Open your project folder in the terminal

```bash
cd path/to/your/project
```

Example:
```bash
cd "C:\Users\Administrator\Desktop\JD Connect"
```

### Step 2 — Install the Tauri CLI

```bash
npm install --save-dev @tauri-apps/cli
```

Or with Bun:
```bash
bun add -D @tauri-apps/cli
```

### Step 3 — Initialize Tauri

Run the Tauri init command:

```bash
npx tauri init
```

Or with Bun:
```bash
bun tauri init
```

It will ask you a series of questions. Here's what to enter:

| Question | What to enter |
|---|---|
| What is your app name? | Your app's name, e.g. `JD Connect` |
| What should the window title be? | Same as above or a friendlier title |
| Where are your web assets located? | `../dist` (for bundled mode) or leave default |
| What is the URL of your dev server? | `http://localhost:5173` (Vite default) |
| What is your frontend dev command? | `npm run dev` (or `bun run dev`) |
| What is your frontend build command? | `npm run build` (or `bun run build`) |

> If you are wrapping a **live URL** (like a Lovable-hosted app), you will change the URL in the next step — just fill in the defaults for now.

After this, a `src-tauri/` folder is created in your project. This contains all the Tauri configuration.

### Step 4 — Configure your app (tauri.conf.json)

Open `src-tauri/tauri.conf.json`. This is the main config file.

**Use only the section that matches the mode you chose above.**

---

#### Mode A — Wrapping a live URL (for Lovable-hosted apps)

Find the `"build"` section and set both `"devUrl"` and `"frontendDist"` to your deployed app URL:

```json
"build": {
  "devUrl": "https://your-app.lovable.app",
  "frontendDist": "https://your-app.lovable.app"
}
```

Replace `https://your-app.lovable.app` with your actual URL. That's all — Tauri will load your live site inside the native window. Your local `dist/` folder is not involved at all.

---

#### Mode B — Bundling local source code

Leave `"frontendDist"` pointing to `"../dist"` (the default Tauri sets). When you run `npx tauri build`, Tauri will first run your frontend build command (e.g. `npm run build`) which outputs files into `dist/`, then bundle those files into the exe.

```json
"build": {
  "devUrl": "http://localhost:5173",
  "frontendDist": "../dist"
}
```

---

> **Still unsure which to pick?** If your app has a public URL you can open in a browser right now — use Mode A. It is simpler and works great for Lovable apps.

#### Set your app identifier (required):

Find `"identifier"` and set a unique reverse-domain string. The format is your domain written backwards — TLD first, then domain name, then your app or product name.

```json
"identifier": "com.yourname.appname"
```

Examples:

| Your domain | Identifier to use |
|---|---|
| `myapp.com` | `com.myapp.desktop` |
| `jdconnect.in` | `in.jdconnect.desktop` |
| `tools.mysite.io` | `io.mysite.tools` |
| No domain | `com.yourname.appname` (just make it unique) |

This identifier is used internally by the OS to store app data and identify your app. It is never shown to users — it just needs to be unique and follow the reverse-domain format.

#### Set window size (optional):

```json
"windows": [
  {
    "title": "JD Connect",
    "width": 1280,
    "height": 800,
    "resizable": true,
    "fullscreen": false
  }
]
```

### Step 5 — Add an app icon (optional but recommended)

Place a `1024x1024` PNG image in your project root, then run:

```bash
npx tauri icon app-icon.png
```

Or with Bun:
```bash
bun tauri icon app-icon.png
```

If your image has a different filename, replace `app-icon.png` with the actual filename:
```bash
bun tauri icon mylogo.png
```

> The image must be a PNG and at least 1024x1024 pixels. To resize or convert for free, use [https://squoosh.app](https://squoosh.app). If you skip this step, Tauri uses a default placeholder icon — the build still works fine.

This auto-generates all required icon sizes for Windows, macOS, and Linux and places them in `src-tauri/icons/`.

> **If you get "could not determine executable to run"** — it means the Tauri CLI is not installed yet. Run `bun add -D @tauri-apps/cli` first, then retry.

---

## Part 2: Running and Building the App

### Test it locally first

Start the Tauri dev window (works only if wrapping local source):

```bash
npx tauri dev
```

This opens a native window running your app. If you are wrapping a live URL, it will load your deployed site in the window.

### Build the Windows .exe

From your Windows machine, run:

```bash
npx tauri build
```

When it finishes, your installer will be at:

```
src-tauri/target/release/bundle/msi/        ← .msi installer
src-tauri/target/release/bundle/nsis/       ← .exe installer
```

The `.exe` (NSIS) is the standard one to share with Windows users.

> The first build takes several minutes because Rust compiles everything from scratch. Subsequent builds are much faster.

---

## Part 3: Building the macOS .dmg with GitHub Actions

You **cannot** build a `.dmg` on Windows. macOS enforces this at the OS level. The solution is to use **GitHub Actions** — a free cloud service that runs your build on a real macOS machine and gives you the `.dmg` as a downloadable file.

### Step 1 — Create a GitHub account

Go to [https://github.com](https://github.com) and sign up for a free account if you don't have one.

### Step 2 — Create a new repository

1. Click the **+** icon in the top-right → **New repository**
2. Give it a name (e.g. `jd-connect-app`)
3. Set it to **Private** if your code is sensitive
4. Click **Create repository**

### Step 3 — Push your project to GitHub

In your project folder, run these commands one by one:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your actual GitHub username and repo name.

> If git is not installed, download it from [https://git-scm.com](https://git-scm.com).

### Step 4 — Create the GitHub Actions workflow file

In your project, create this folder and file:

```
.github/workflows/build-desktop.yml
```

Paste the following content into it:

```yaml
name: Build Desktop Apps

on:
  push:
    branches:
      - main
  workflow_dispatch: # Allows manual trigger from GitHub UI

jobs:

  build-windows:
    name: Build Windows (.exe)
    runs-on: windows-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install dependencies
        run: npm install

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        with:
          tauriScript: npx tauri

      - name: Upload Windows installer
        uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: src-tauri/target/release/bundle/nsis/*.exe

  build-macos:
    name: Build macOS (.dmg)
    runs-on: macos-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install dependencies
        run: npm install

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        with:
          tauriScript: npx tauri

      - name: Upload macOS disk image
        uses: actions/upload-artifact@v4
        with:
          name: macos-dmg
          path: src-tauri/target/release/bundle/dmg/*.dmg
```

> If your project uses **Bun**, replace `npm install` with `bun install` and add a Bun setup step before it:
> ```yaml
> - name: Setup Bun
>   uses: oven-sh/setup-bun@v2
> ```

### Step 5 — Commit and push the workflow file

```bash
git add .github/workflows/build-desktop.yml
git commit -m "Add GitHub Actions desktop build workflow"
git push
```

### Step 6 — Watch the build run

1. Go to your GitHub repository in the browser
2. Click the **Actions** tab at the top
3. You will see your workflow running — click it to watch the logs live
4. When it finishes (green checkmark), click the workflow run
5. Scroll down to the **Artifacts** section
6. Download `windows-installer` (your `.exe`) and `macos-dmg` (your `.dmg`)

The build takes about 10–20 minutes the first time.

---

## Part 4: Using the Built Files

### Windows (.exe)
- Double-click the downloaded `.exe` to install the app like any normal Windows program
- It will appear in your Start Menu and can be uninstalled from Add/Remove Programs

### macOS (.dmg)
- Double-click the `.dmg` to mount it
- Drag the app icon into the **Applications** folder
- Eject the disk image
- Open the app from Applications or Spotlight

> On macOS, if you see "app can't be opened because it's from an unidentified developer", right-click the app → Open → Open anyway. This is because the app is not signed with an Apple Developer certificate ($99/year). For personal use this is fine.

---

## Troubleshooting Common Issues

**`cargo` or `rustc` not found after installing Rust**
Restart your terminal. On Windows, close and reopen CMD or PowerShell.

**Build fails with "Error: failed to get cargo metadata"**
Make sure you are running the build command from your project root, not inside `src-tauri/`.

**GitHub Actions build fails on "npm install"**
Check that your `package.json` is in the project root and was committed to GitHub.

**macOS app shows "damaged and can't be opened"**

This happens because macOS automatically stamps any file downloaded from the internet with an invisible tag called `com.apple.quarantine`. This is macOS's security system (Gatekeeper) saying "this file came from the internet, I don't trust it." When the app is not signed with an Apple Developer certificate, Gatekeeper blocks it entirely.

The fix is to strip that quarantine tag using the `xattr` command:

```bash
xattr -cr "/Applications/YourApp.app"
```

What each part does:
- `xattr` — the tool for managing file extended attributes (invisible metadata macOS attaches to files)
- `-c` — clear all extended attributes from the file
- `-r` — recursive, applies to all files inside the `.app` bundle not just the top level
- `/Applications/YourApp.app` — the target app

Replace `YourApp` with your actual app name. If the name has spaces, keep the quotes:
```bash
xattr -cr "/Applications/JD Connect.app"
```

After running this, open the app normally — Gatekeeper will no longer block it.

> This issue only affects unsigned apps. Apps signed with an Apple Developer certificate ($99/year) never trigger this because Apple's signature tells Gatekeeper the app is trusted. For personal or internal use, the `xattr` fix is perfectly fine.

**Window shows blank/white screen when wrapping a live URL**
Make sure the URL in `tauri.conf.json` is correct and publicly accessible. Test it in a regular browser first.

---

## Reusing This for Any Other Project

This entire setup is reusable for any web app. The only things you change per project are:

1. The `"devUrl"` / `"frontendDist"` URL (or local build config) in `tauri.conf.json`
2. The `"identifier"` field (must be unique per app)
3. The `"title"` and window size
4. Your app icon

Everything else — the GitHub Actions workflow, the Rust/Node setup steps — stays the same.

---

## Summary Checklist

- [ ] Install Node.js
- [ ] Install Rust via rustup.rs
- [ ] Run `npm install --save-dev @tauri-apps/cli`
- [ ] Run `npx tauri init` and answer the prompts
- [ ] Edit `src-tauri/tauri.conf.json` with your URL/identifier/window settings
- [ ] Run `npx tauri build` to produce a local `.exe` (Windows only)
- [ ] Create a GitHub repo and push your code
- [ ] Add `.github/workflows/build-desktop.yml` with the workflow above
- [ ] Push and wait for GitHub Actions to finish
- [ ] Download `.exe` and `.dmg` artifacts from the Actions tab

---

## Part 5: Automatic In-App Updates

Once your app is distributed to users, you can push updates that they receive automatically — without needing to manually download and reinstall.

This is useful whenever you:
- Change the app icon
- Update window settings in `tauri.conf.json`
- Add new Tauri features or plugins
- Release a new bundled version (Mode B)

> For **Mode A** (live URL), your web app content already updates automatically via Lovable. But you still need this for any changes to the Tauri shell itself.

The full step-by-step setup is in **`AUTO_UPDATE_GUIDE.md`** in this project. Here is a quick summary of how it works:

1. You generate a signing key pair once — this proves updates come from you
2. You add the updater plugin and configure an endpoint URL in `tauri.conf.json`
3. GitHub Actions signs your builds and publishes a `latest.json` file to GitHub Releases automatically
4. When users open the app, it checks that URL — if a newer version exists, it shows a dialog: *"Update available. Install now?"*
5. To release an update: bump the version number in `tauri.conf.json` → commit → push a version tag like `v1.0.1`

See `AUTO_UPDATE_GUIDE.md` for the complete walkthrough including code samples and troubleshooting.

---

*Guide written for Tauri v2. For the latest Tauri documentation visit [https://tauri.app/docs](https://tauri.app/docs)*
