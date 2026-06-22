# Session Fixes — 2026-06-18

## Overview

Three issues were investigated and resolved during this session:

1. Communication page unread badge not updating in real-time
2. OS notifications showing "Windows PowerShell" as sender instead of "JD Connect"
3. (Bonus) `tauri.conf.json` pointing to remote URL (documented observation)

---

## Issue 1: Real-Time Unread Count on Communication Page

### Asked

> "Why Communication page is not instantly showing me the number of unread messages as soon as a new message comes in. It's only showing me such when I opened it."

### Investigation

The Communication page uses `useCommUnread()` (`src/components/useCommUnread.ts`) which:
- Creates a React Query with key `["comm-unread", empId]`
- Polls every 60 seconds (`refetchInterval: 60_000`)
- Has a Supabase Realtime subscription to `INSERT` on `messages` that calls `qc.invalidateQueries(...)` on new messages

The user confirmed they DO get:
- In-app floating popups (from `ChatNotifier`)
- Notification bell badge updates (from `HeaderActions` / `ChatNotifier`)

But NOT the Communication page badges or sidebar badge.

#### Root Causes Found

**1. `ChatNotifier` never invalidated `["comm-unread"]`**
`ChatNotifier.tsx` already received every new message (confirmed by popup working) and invalidated `["notifications"]`, `["conversations"]`, `["channels"]`, etc. — but never `["comm-unread"]`. Since `useCommUnread`'s own subscription may have been silently failing, the unread count query had no reliable trigger to refetch.

**2. `useCommUnread` subscription had no error handling**
`.subscribe()` was called without a status callback. If the subscription failed for any reason (network, permissions, channel collision), it would fail silently and never invalidate the query.

**3. `useCommUnread` used `Math.random()` in channel name**
The channel name was `comm-unread-watch-${empId}-${Math.random()}`. This was intentionally unique per call, but unnecessary and inconsistent with the deterministic naming in `ChatNotifier` and `HeaderActions`.

**4. Bug in `.or()` filter**
When both `convIds` and `chanIds` existed, the `.or()` filter used `convIds` for both sides:
```typescript
q.or(`conversation_id.in.(${convIds.join(",")}),channel_id.in.(${convIds.join(",")})`);
//                                                                  ^^^^^^^ bug: should be chanIds
```
This caused channel messages to be filtered out of the unread count query entirely when both conversations and channels existed.

### Resolution

**File: `src/components/ChatNotifier.tsx`**
- Added `void qc.invalidateQueries({ queryKey: ["comm-unread"] })` (line 160, after `["notifications"]` invalidation).
- This is the **primary fix**: `ChatNotifier`'s subscription is confirmed working (popup appears), so it now reliably triggers the unread count query to refetch on every incoming message.

**File: `src/components/useCommUnread.ts`**
- Fixed the `.or()` filter: `channel_id.in.(${chanIds.join(",")})` (was `convIds`).
- Added a `subscribe((status) => { ... })` callback that logs `CHANNEL_ERROR` if the subscription fails.
- Kept `Math.random()` in the channel name (reverted the deterministic name) because `useCommUnread` is used by TWO components simultaneously (`AppSidebar` + `CommunicationShell`), and both would collide on a fixed channel name.

---

## Issue 2: OS Notification Sender Shows "Windows PowerShell" Instead of "JD Connect"

### Asked

> "Why we are getting notifications with the Windows powershell as the sender? Can't we make the notification to be from this Application JD Connect?"

### Investigation

The `showSystemNotification` function in `ChatNotifier.tsx` was using `new window.Notification()` (the Web Notification API) to show notifications. In a Tauri WebView2:

- `new window.Notification()` creates a notification through WebView2's host process
- When the app loads from a remote URL (which it does — `https://jdconnect.in`), Windows attributes the notification to whatever launched the process (PowerShell)
- The notification never uses the Tauri app's identity

I inspected the `@tauri-apps/plugin-notification` v2.3.3 source code:

**JS side** (`node_modules/.../dist-js/index.js`):
```javascript
function sendNotification(options) {
    new window.Notification(options.title, options); // Just a Web API wrapper!
}
```
The old `loadTauriNotification()` dynamically imported this plugin and called `sendNotification`, which was functionally identical to the Web API path.

**Rust side** (`desktop.rs` — `show()` method):
```rust
let mut notification = notify_rust::Notification::new();
notification.summary(&title);
notification.body(&body);
notification.auto_icon();
// On Windows, sets AppUserModelID to the app's identifier
// (e.g., "in.jdconnect.desktop") — BUT only in production builds
```

The plugin's **Rust `notify` command** (`commands.rs:34`) creates a **true native OS notification** via `notify-rust`, setting the app identity to `in.jdconnect.desktop`. This command was registered in the plugin but **never exposed as a JS function** — only accessible via raw `invoke('plugin:notification|notify', ...)`.

Additionally, the old code had a **structural bug**: if running in Tauri and `loadTauriNotification()` failed (returned `null`), the function did `if (!tauri) return;` and **exited immediately** without falling through to the Web API. Since the dynamic import of the plugin module fails (the app loads from a remote URL where `node_modules` isn't available), **no notification was ever shown** in the Tauri desktop app.

### Resolution

**File: `src/components/ChatNotifier.tsx`**

Replaced the entire `showSystemNotification` function:

**Before (pseudocode):**
```
if isTauri:
  try:
    plugin = await import("@tauri-apps/plugin-notification")
    if !plugin: return        // EARLY RETURN — notification silently lost
    check permission via plugin
    plugin.sendNotification()  // Same as new window.Notification() anyway
  catch: log error
else if Notification.permission === "granted":
  new Notification()           // Web path — never reached in Tauri
```

**After (pseudocode):**
```
if isTauri:
  try:
    invoke("plugin:notification|notify", { options: { title, body } })
    // Goes through Rust → notify-rust → native OS notification with app_id = "in.jdconnect.desktop"
    return
  catch: log error, fall through

// Fallback: Web Notification API
new Notification(title, { body })  // With onclick navigation handler
```

Changes made:

1. Removed the `loadTauriNotification()` dynamic import function entirely (unused wrapper).
2. In Tauri mode, dynamically imports `@tauri-apps/api/core` and calls `invoke('plugin:notification|notify', ...)` — this sends a true native OS notification through the Rust layer with the app's identifier.
3. On failure (import fails, invoke fails), falls through to the Web Notification API.
4. Both paths now attach `notification.onclick` for click-to-navigate.
5. Simplified the mount-time permission request — Tauri desktop auto-grants permission (`desktop.rs:62`), so no check needed.

**Important caveat:** The Rust `show()` method (`desktop.rs:199-205`) intentionally skips setting `app_id` when the executable runs from `target/debug/` or `target/release/` directories. In **production builds** (installed app), it correctly sets `app_id = "in.jdconnect.desktop"` and the notification will show **"JD Connect"**. During `bun run tauri dev`, it may still show the parent process name.

---

## Issue 3: Native Notification Click-to-Navigate

### Asked

> "Notification click-to-navigate not working" (from session plan — native Tauri notifications show correct sender "JD Connect" but cannot attach `onclick` handler)

### Investigation

The `init-iife.js` in `tauri-plugin-notification` 2.3.3 overrides `window.Notification` in the WebView context so that `new Notification()` always calls `invoke("plugin:notification|notify", ...)` — never the Web Notification API. This means:

1. In Tauri mode, `new Notification()` creates a native OS notification through the Rust `notify-rust` layer.
2. The Web API `notification.onclick` is **never called** because the native path doesn't run the JS callback.
3. The plugin's Rust `show()` method (`desktop.rs:216-218`) calls `notification.show()` but **discards the `NotificationHandle`** with `let _ =`, so no click events are ever received.

The `notify-rust` crate (v4.18.0) provides a `NotificationHandle` with `wait_for_response()` that blocks until the user interacts with the notification. On Windows, this fires:
- `NotificationResponse::Default` — user clicked the notification body
- `NotificationResponse::Action(String)` — user clicked an action button
- `NotificationResponse::Closed(CloseReason)` — notification was dismissed

### Resolution — Custom Rust Command

**File: `src-tauri/Cargo.toml`**
- Added `notify-rust = "4.18.0"` as a direct dependency.

**File: `src-tauri/src/lib.rs`**
- Added `NativeNotificationPayload` struct with `title`, `body`, `kind`, `target_id` fields.
- Added `send_native_notification` Tauri command that:
  1. Creates a `notify_rust::Notification` with title and body.
  2. On Windows, sets `app_id("in.jdconnect.desktop")` unconditionally (unlike the plugin which skips in dev mode).
  3. On macOS, calls `set_application()` with the production bundle ID (or `com.apple.Terminal` in dev).
  4. Shows the notification and captures the `NotificationHandle`.
  5. Spawns a `std::thread` that calls `handle.wait_for_response()` and emits a `"notification-clicked"` Tauri event when the user clicks the notification body.
- Registered the command with `.invoke_handler(tauri::generate_handler![send_native_notification])`.

**File: `src/components/ChatNotifier.tsx`**
- Replaced the `invoke("plugin:notification|notify", ...)` call with `invoke("send_native_notification", { payload: { title, body, kind, target_id } })` to pass navigation context.
- Added a new `useEffect` that listens for the `"notification-clicked"` Tauri event (via `@tauri-apps/api/event`) and navigates to the appropriate conversation or channel route.
- The listener is set up only when `__TAURI_INTERNALS__` is present, with proper cleanup on unmount.

### Why This Works

1. The custom command keeps the `NotificationHandle` alive and blocks on user interaction.
2. On Windows body-click, `notify-rust` returns `NotificationResponse::Default`.
3. The spawned thread detects this and emits a Tauri event to the frontend.
4. The frontend receives the event and calls `navigate()` to the correct route.
5. The Web Notification API fallback path is preserved for when Tauri is unavailable.

### Dev-Mode Caveat

In `src-tauri/target/debug/`, the Windows toast notification may still show "PowerShell" as the sender because the **plugin's** original `desktop.rs` skips setting `app_id` in debug paths. However, our **custom** `send_native_notification` command always sets `app_id` unconditionally, so notifications sent through it should appear as "JD Connect" even in dev mode.

---

## Bonus Observation: Remote URL in tauri.conf.json

### Found

The Tauri configuration in `src-tauri/tauri.conf.json` has:

```json
"build": {
    "frontendDist": "https://jdconnect.in",
    "devUrl": "https://jdconnect.in",
    "beforeDevCommand": "bun run dev",
    "beforeBuildCommand": "bun run build"
}
```

Both `frontendDist` and `devUrl` point to a remote production URL instead of a local build directory. This means:

- **`bun run tauri dev`** loads `https://jdconnect.in` in the WebView, ignoring the local Vite dev server started by `beforeDevCommand`
- **Local code changes are NOT reflected** in the Tauri desktop app during development
- The dynamic imports of `@tauri-apps/plugin-notification` and `@tauri-apps/api/core` fail because those modules aren't served by the remote URL
- The Tauri app effectively acts as a thin web wrapper rather than a true desktop app

This was **not fixed** during this session as it was outside the scope of the requested issues, but it affects both the reliability of notifications and the development workflow.

### Recommended Fix

```json
"build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "bun run dev",
    "beforeBuildCommand": "bun run build"
}
```

This would point Tauri to the local Vite dev server during development and the local built files in production, making dynamic imports work and ensuring local code changes appear in the desktop app.

---

## Summary of Files Changed

| File | Changes |
|---|---|
| `src/components/ChatNotifier.tsx` | Removed `loadTauriNotification()`; replaced Tauri notification path with `invoke('send_native_notification', ...)` for clickable native OS notifications; added `["comm-unread"]` invalidation; added graceful fallback chain; simplified permission handling; added Tauri event listener for `"notification-clicked"` to navigate on click |
| `src/components/useCommUnread.ts` | Fixed `.or()` filter bug (`convIds` → `chanIds`); added error handling to `.subscribe()` |
| `src-tauri/Cargo.toml` | Added `notify-rust = "4.18.0"` dependency |
| `src-tauri/src/lib.rs` | Added `send_native_notification` command with `wait_for_response()` click handling; always sets `app_id` even in dev mode; registered command handler |
