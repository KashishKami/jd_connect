use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_dialog::{MessageDialogKind, MessageDialogButtons};
use tauri::Emitter;

#[derive(serde::Deserialize, serde::Serialize, Clone)]
struct NativeNotificationPayload {
  title: String,
  body: String,
  kind: String,
  target_id: String,
}

#[tauri::command]
fn send_native_notification(app: tauri::AppHandle, payload: NativeNotificationPayload) -> Result<(), String> {
  let payload_clone = payload.clone();
  std::thread::spawn(move || {
    let mut notification = notify_rust::Notification::new();
    notification
      .summary(&payload.title)
      .body(&payload.body)
      .sound_name("Default");

    #[cfg(target_os = "windows")]
    {
      if !cfg!(debug_assertions) {
        notification.app_id("in.jdconnect.desktop");
      }
    }

    #[cfg(target_os = "macos")]
    {
      if cfg!(debug_assertions) {
        let _ = notify_rust::set_application("com.apple.Terminal");
      } else {
        let _ = notify_rust::set_application("in.jdconnect.desktop");
      }
    }

    match notification.show() {
      Ok(handle) => {
        let _ = handle.wait_for_response(move |response: &notify_rust::NotificationResponse| {
          if matches!(response, notify_rust::NotificationResponse::Default) {
            let _ = app.emit("notification-clicked", payload_clone);
          }
        });
      }
      Err(e) => {
        eprintln!("Failed to show notification: {}", e);
      }
    }
  });

  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_notification::init())
    .invoke_handler(tauri::generate_handler![send_native_notification])
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

