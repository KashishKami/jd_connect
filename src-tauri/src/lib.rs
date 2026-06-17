use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_dialog::{MessageDialogKind, MessageDialogButtons};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_notification::init())
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

