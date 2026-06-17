# JD Connect

JD Connect is a modern desktop and web application built using **TanStack Start**, **Vite**, **TypeScript**, **Tailwind CSS**, and **Tauri v2** with a **Supabase** backend. 

This guide provides step-by-step instructions on setting up your environment, installing all dependencies (from Node.js to Bun and Rust), configuring environment variables, and running the application locally.

---

## Table of Contents
1. [Prerequisites](#1-prerequisites)
   - [Node.js](#nodejs)
   - [Bun](#bun)
   - [Rust & C++ Build Tools (For Desktop/Tauri Development)](#rust--c-build-tools-for-desktoptauri-development)
2. [Getting Started & Installation](#2-getting-started--installation)
   - [Step 1: Clone the Repository](#step-1-clone-the-repository)
   - [Step 2: Install Project Dependencies](#step-2-install-project-dependencies)
   - [Step 3: Setup Environment Variables](#step-3-setup-environment-variables)
3. [Running the Application](#3-running-the-application)
   - [Web Application Development](#web-application-development)
   - [Desktop App Development (Tauri)](#desktop-app-development-tauri)
4. [Building & Production](#4-building--production)
   - [Build Web App](#build-web-app)
   - [Build Desktop Installers](#build-desktop-installers)
5. [Additional Guides](#5-additional-guides)

---

## 1. Prerequisites

To run this application locally, you will need to install Node.js, Bun, and Rust (required if running or building the desktop application).

### Node.js
Download and install the latest **LTS (Long Term Support)** version of Node.js:
- **Download link:** [Node.js Official Downloads](https://nodejs.org/en/download/)
- **Verification:** Run the following command in your terminal to ensure it is installed:
  ```bash
  node --version
  npm --version
  ```

### Bun
Bun is the fast, all-in-one toolkits for running, building, testing, and debugging JavaScript and TypeScript. JD Connect is configured to run primarily with Bun.
- **Installation:**
  - **Windows (PowerShell):**
    ```powershell
    powershell -c "irm bun.sh/install.ps1 | iex"
    ```
  - **macOS / Linux:**
    ```bash
    curl -fsSL https://bun.sh/install | bash
    ```
- **Verification:** Close and reopen your terminal, then verify the installation:
  ```bash
  bun --version
  ```

### Rust & C++ Build Tools (For Desktop/Tauri Development)
Since JD Connect uses **Tauri v2** to run as a native desktop application, you must set up the Rust compiler and OS-specific C++ build dependencies.

#### Windows Setup:
1. **Microsoft C++ Build Tools:**
   - Download the installer from [Visual Studio Downloads](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
   - Run the installer and select **Desktop development with C++** workload.
   - Click install and wait for the download to finish.
2. **WebView2 Runtime:**
   - Usually pre-installed on Windows 10/11. If needed, download the WebView2 Evergreen Standalone Installer from [Microsoft Edge WebView2 Developer](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).
3. **Rust:**
   - Download and run the `rustup-init.exe` installer from [rustup.rs](https://rustup.rs).
   - Follow the default installation instructions (Option 1).
   - Restart your terminal.

#### macOS Setup:
1. **Xcode Command Line Tools:**
   - Open terminal and run:
     ```bash
     xcode-select --install
     ```
2. **Rust:**
   - Run the following command in your terminal:
     ```bash
     curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
     ```

#### Verification:
Verify Rust is properly installed:
```bash
rustc --version
cargo --version
```

---

## 2. Getting Started & Installation

### Step 1: Clone the Repository
Open your terminal and navigate to the directory where you want to store the project, then clone the repository:
```bash
git clone https://github.com/KashishKami/jd_connect.git
cd jd_connect
```
*(Or navigate directly to the workspace folder: `cd "C:\Users\Administrator\Desktop\JD Connect"`)*

### Step 2: Install Project Dependencies
JD Connect uses Bun as its package manager. Run the following command in the project root directory:
```bash
bun install
```
This command reads the `package.json` and installs all necessary React, TanStack, and Tauri development dependencies.

### Step 3: Setup Environment Variables
A `.env.example` file is included in the project root. You must copy it and create a `.env` file:

```bash
# On Windows PowerShell:
copy .env.example .env

# On macOS/Linux:
cp .env.example .env
```

Open the new `.env` file and fill in your **Supabase** credentials:
```env
SUPABASE_PROJECT_ID="your-supabase-project-id"
SUPABASE_PUBLISHABLE_KEY="your-supabase-anon-key"
SUPABASE_URL="https://your-supabase-project-id.supabase.co"
VITE_SUPABASE_PROJECT_ID="your-supabase-project-id"
VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-anon-key"
VITE_SUPABASE_URL="https://your-supabase-project-id.supabase.co"
```

---

## 3. Running the Application

### Web Application Development
To launch the Vite development server for the web application:
```bash
bun run dev
```
By default, the application will be available at: [http://localhost:5173](http://localhost:5173)

### Desktop App Development (Tauri)
To run the Tauri application locally in development mode (which loads a desktop window wrapper):
```bash
bun run tauri dev
```
*Note: The first launch will compile Rust dependencies and might take a few minutes.*

---

## 4. Building & Production

### Build Web App
To compile and build the production-ready static assets for the web application:
```bash
bun run build
```
The build artifacts will be generated in the `dist/` directory.

### Build Desktop Installers
To build the native production installers for your current operating system (e.g., `.exe` for Windows, `.app`/`.dmg` for macOS):
```bash
bun run tauri build
```
After the build is complete, you can find the packaged files under:
- **Windows (.exe / .msi):** `src-tauri/target/release/bundle/nsis/` or `src-tauri/target/release/bundle/msi/`
- **macOS (.dmg / .app):** `src-tauri/target/release/bundle/dmg/`

---

## 5. Additional Guides

For more advanced platform-specific configurations and details:
- **Desktop Application Guide:** Read [DESKTOP_APP_GUIDE.md](file:///c:/Users/Administrator/Desktop/JD%20Connect/DESKTOP_APP_GUIDE.md) for detailed explanations of Tauri live URL vs. local bundle modes and building macOS apps with GitHub Actions.
- **Auto-Update System:** Read [AUTO_UPDATE_GUIDE.md](file:///c:/Users/Administrator/Desktop/JD%20Connect/AUTO_UPDATE_GUIDE.md) for configuring automatic updates, signing keys, and automated GitHub Releases.
