mod data_folder;

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_fs::FsExt;

/// Grants the fs plugin access to the custom data folder named by location.json, if any. Grants are not remembered across restarts.
fn grant_current_data_folder<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
  let path = app.path();
  let app_data = path.app_data_dir().map_err(|e| e.to_string())?;
  let home = path.home_dir().map_err(|e| e.to_string())?;
  let location = std::fs::read_to_string(app_data.join("location.json")).ok();
  let folder = data_folder::folder_to_grant(location.as_deref(), &home.to_string_lossy(), &app_data.to_string_lossy())?;
  if let Some(folder) = folder {
    app.fs_scope().allow_directory(folder, true).map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn grant_data_folder<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
  grant_current_data_folder(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_sql::Builder::default().build())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      // A failed grant must not stop the app; the data folder is then simply unreadable until the next start.
      if let Err(e) = grant_current_data_folder(app.handle()) {
        eprintln!("data folder grant failed: {e}");
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![grant_data_folder])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
