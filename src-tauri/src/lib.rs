mod data_folder;

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_fs::FsExt;

/// Grants the fs plugin access to the custom data folder named by location.json, if any. Grants are not remembered across restarts.
fn grant_current_data_folder<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
  let path = app.path();
  let app_data = path.app_data_dir().map_err(|e| e.to_string())?;
  let home = path.home_dir().map_err(|e| e.to_string())?;
  let location = std::fs::read_to_string(app_data.join("location.json")).ok();
  let has_db = location.as_deref().and_then(data_folder::parse_data_dir).is_some_and(|d| data_folder::has_regular_db(std::path::Path::new(&d)));
  let folder = data_folder::folder_to_grant(location.as_deref(), &home.to_string_lossy(), &app_data.to_string_lossy(), has_db)?;
  if let Some(folder) = folder {
    app.fs_scope().allow_directory(folder, true).map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn grant_data_folder<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
  grant_current_data_folder(&app)
}

/// The Night Dock icon (macOS only); the bundle icon is always Light.
#[cfg(target_os = "macos")]
const NIGHT_PNG: &[u8] = include_bytes!("../icons/night/icon.png");

/// Sets the Dock icon: Night, or the bundle icon for Light. Must run on the main thread; elsewhere it does nothing.
#[cfg(target_os = "macos")]
fn apply_icon(night: bool) {
  use objc2::{AllocAnyThread, MainThreadMarker};
  use objc2_app_kit::{NSApplication, NSImage};
  use objc2_foundation::NSData;

  let Some(mtm) = MainThreadMarker::new() else { return };
  let app = NSApplication::sharedApplication(mtm);
  if night {
    let data = NSData::with_bytes(NIGHT_PNG);
    let Some(image) = NSImage::initWithData(NSImage::alloc(), &data) else { return };
    unsafe { app.setApplicationIconImage(Some(&image)) };
  } else {
    unsafe { app.setApplicationIconImage(None) };
  }
}

#[cfg(not(target_os = "macos"))]
fn apply_icon(_night: bool) {}

const ICON_FILE: &str = "app_icon.txt";

/// The icon choice saved by `set_app_icon`; missing or unreadable means Light.
fn stored_night<R: Runtime>(app: &AppHandle<R>) -> bool {
  app.path().app_config_dir().ok().and_then(|dir| std::fs::read_to_string(dir.join(ICON_FILE)).ok()).is_some_and(|text| text.trim() == "night")
}

#[tauri::command]
fn set_app_icon<R: Runtime>(app: AppHandle<R>, night: bool) -> Result<(), String> {
  let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  std::fs::write(dir.join(ICON_FILE), if night { "night" } else { "light" }).map_err(|e| e.to_string())?;
  app.run_on_main_thread(move || apply_icon(night)).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_sql::Builder::default().build())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_http::init())
    .setup(|app| {
      // A failed grant must not stop the app; the data folder is then simply unreadable until the next start.
      if let Err(e) = grant_current_data_folder(app.handle()) {
        eprintln!("data folder grant failed: {e}");
      }
      if stored_night(app.handle()) {
        apply_icon(true);
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![grant_data_folder, set_app_icon])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      // Tauri sets its own icon on Ready in dev, so the stored Night icon is applied after it.
      if let tauri::RunEvent::Ready = event {
        if stored_night(app) {
          apply_icon(true);
        }
      }
    });
}
