# 🔄 JD Connect — Fix: App Not Loading / "Failed to Fetch" on Login

If JD Connect is showing a blank page, loading the wrong version, or saying **"Failed to fetch"** when you try to sign in, follow the steps below for your browser or app.

> **Why does this happen?**
> Your browser or device remembered the old server address for `jdconnect.in`. Even though the server has moved, your device keeps using the old address until it's told to forget it. This is called a **DNS cache** and it's completely normal — it just needs a one-time manual clear.

---

## 📋 Table of Contents

- [Google Chrome](#-google-chrome-windows--mac)
- [Microsoft Edge](#-microsoft-edge-windows--mac)
- [Mozilla Firefox](#-mozilla-firefox-windows--mac)
- [Safari (Mac)](#-safari-mac)
- [JD Connect Desktop App — Windows](#-jd-connect-desktop-app-windows)
- [JD Connect Desktop App — macOS](#-jd-connect-desktop-app-macos)
- ["Failed to Fetch" During Login](#-failed-to-fetch-during-login)
- [Still Not Working?](#-still-not-working)

---

## 🟡 Google Chrome (Windows & Mac)

**Step 1 — Clear Chrome's DNS cache:**

1. Open a **new Chrome tab**
2. In the address bar, type exactly:
   ```
   chrome://net-internals/#dns
   ```
   and press **Enter**
3. Click the **"Clear host cache"** button

**Step 2 — Flush socket connections:**

1. In the address bar, type:
   ```
   chrome://net-internals/#sockets
   ```
2. Click **"Flush socket pools"**

**Step 3 — Clear browsing cache:**

1. Press `Ctrl + Shift + Delete` (Windows) or `Cmd + Shift + Delete` (Mac)
2. Set **Time range** to **"All time"**
3. Check ✅ **Cached images and files**
4. Check ✅ **Cookies and other site data**
5. Click **"Clear data"**

**Step 4 — Fully close and reopen Chrome**

> Close all Chrome windows, wait 5 seconds, then reopen it and visit `jdconnect.in` again.

---

## 🔵 Microsoft Edge (Windows & Mac)

**Step 1 — Clear Edge's DNS cache:**

1. Open a **new Edge tab**
2. In the address bar, type exactly:
   ```
   edge://net-internals/#dns
   ```
   and press **Enter**
3. Click the **"Clear host cache"** button

**Step 2 — Flush socket connections:**

1. In the address bar, type:
   ```
   edge://net-internals/#sockets
   ```
2. Click **"Flush socket pools"**

**Step 3 — Clear browsing cache:**

1. Press `Ctrl + Shift + Delete` (Windows) or `Cmd + Shift + Delete` (Mac)
2. Set **Time range** to **"All time"**
3. Check ✅ **Cached images and files**
4. Check ✅ **Cookies and other site data**
5. Click **"Clear now"**

**Step 4 — Fully close and reopen Edge**

---

## 🟠 Mozilla Firefox (Windows & Mac)

Firefox doesn't have a built-in DNS cache page, but here's the easiest fix:

**Step 1 — Clear Firefox cache:**

1. Press `Ctrl + Shift + Delete` (Windows) or `Cmd + Shift + Delete` (Mac)
2. Set **Time range** to **"Everything"**
3. Check ✅ **Cache**
4. Check ✅ **Cookies**
5. Click **"OK"**

**Step 2 — Restart Firefox in a fresh session:**

1. Close **all** Firefox windows
2. Wait a few seconds, then reopen Firefox
3. Visit `jdconnect.in`

**Optional — Reset DNS via config (advanced):**

1. In the address bar type: `about:config` and press Enter
2. Accept the warning if asked
3. Search for: `network.dnsCacheExpiration`
4. Double-click it and set the value to **`0`**, then click OK
5. Reload the page
6. Set it back to **`60`** afterward

---

## 🍎 Safari (Mac)

**Step 1 — Enable the Developer menu (if not already enabled):**

1. Open **Safari → Settings** (or `Cmd + ,`)
2. Click the **Advanced** tab
3. Check ✅ **"Show features for web developers"**

**Step 2 — Empty the cache:**

1. In the top menu, click **Develop**
2. Click **"Empty Caches"**

**Step 3 — Clear website data:**

1. Go to **Safari → Settings → Privacy**
2. Click **"Manage Website Data…"**
3. Search for **jdconnect** in the search bar
4. Select it and click **"Remove"**, then **"Done"**

**Step 4 — Flush Mac system DNS:**

1. Open **Terminal** (search "Terminal" in Spotlight with `Cmd + Space`)
2. Paste this command and press Enter:
   ```bash
   sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
   ```
3. Enter your Mac password when asked (it won't show as you type — that's normal)

**Step 5 — Reopen Safari** and visit `jdconnect.in`

---

## 🖥️ JD Connect Desktop App — Windows

The desktop app on Windows uses the **Microsoft Edge engine (WebView2)** internally. It has its own cache separate from your regular Edge browser.

**Step 1 — Completely close the JD Connect app**

Make sure it's not running in the system tray (bottom-right taskbar). Right-click the icon and choose **Exit** if needed.

**Step 2 — Delete the app's WebView cache folder:**

1. Press `Windows + R` to open the Run dialog
2. Type the following and press Enter:
   ```
   %LOCALAPPDATA%\com.jdconnect.app\EBWebView
   ```
   > If that folder doesn't open, try:
   ```
   %APPDATA%\com.jdconnect.app
   ```
3. Select **all folders inside** and **delete** them (`Ctrl + A`, then `Delete`)

**Step 3 — Also flush Windows system DNS:**

1. Right-click the **Start** button → **Windows Terminal** (or **Command Prompt**)
2. Type and press Enter:
   ```
   ipconfig /flushdns
   ```
3. You should see: *"Successfully flushed the DNS Resolver Cache"*

**Step 4 — Restart the JD Connect app**

---

## 🍏 JD Connect Desktop App — macOS

The desktop app on macOS uses the system **WebKit** browser engine (same engine as Safari).

**Step 1 — Completely quit the JD Connect app**

Press `Cmd + Q` while the app is focused, or right-click the Dock icon → **Quit**.

**Step 2 — Delete the app's cache:**

1. Open **Finder**
2. Press `Cmd + Shift + G` to open "Go to Folder"
3. Type the following and press Enter:
   ```
   ~/Library/WebKit/com.jdconnect.app
   ```
4. Delete the entire folder (drag to Trash or press `Cmd + Delete`)
5. Also check and delete if it exists:
   ```
   ~/Library/Caches/com.jdconnect.app
   ```

**Step 3 — Flush Mac system DNS:**

1. Open **Terminal** (Spotlight → "Terminal")
2. Run:
   ```bash
   sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
   ```

**Step 4 — Reopen the JD Connect app**

---

## ❗ "Failed to Fetch" During Login

If you see a **"Failed to fetch"** error when trying to sign in — **don't panic!**

**This is usually temporary and caused by one of two things:**

1. **Your device is still connecting to the old server address** — The same DNS cache issue described above. Follow your browser/app steps above to fix it permanently.

2. **A brief network hiccup** — The connection timed out for a moment. This can happen right after the server was updated or restarted.

**Quick fix — try these in order:**

- ✅ **Click "Sign In" again** — it usually succeeds on the 2nd or 3rd try while DNS is settling
- ✅ **Refresh the page** (`F5` or `Cmd + R`) and try again
- ✅ **Open in Incognito / Private mode** — this always uses a fresh connection, bypassing all caches:
  - Chrome / Edge: `Ctrl + Shift + N` (Windows) or `Cmd + Shift + N` (Mac)
  - Firefox: `Ctrl + Shift + P` (Windows) or `Cmd + Shift + P` (Mac)
  - Safari: `Cmd + Shift + N`

Once you've followed the cache-clearing steps above, this error should stop appearing entirely.

---

## 🔧 Still Not Working?

If none of the steps above resolved the issue:

| Try this | Why it helps |
|----------|-------------|
| **Switch networks** — try mobile hotspot instead of Wi-Fi | Bypasses your router's DNS cache |
| **Wait up to 24 hours** | Your ISP's DNS can take time to update — this fixes itself |
| **Change DNS to Google `8.8.8.8`** in your network settings | Faster-updating public DNS skips the ISP cache |
| **Contact your IT team** (office networks) | Office routers/firewalls may need their own DNS flush |

---

*Guide last updated: July 2026 · JD Connect*
