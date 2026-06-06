pub mod app;
pub mod core;
pub(crate) mod utils;
pub mod validation;

use app::{commands, session};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    app_name: String,
    platform: String,
    version: String,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        app_name: env!("CARGO_PKG_NAME").to_string(),
        platform: std::env::consts::OS.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)]
    let builder = tauri::Builder::default().plugin(tauri_plugin_devtools::init());
    #[cfg(not(debug_assertions))]
    let builder = tauri::Builder::default();
    let _ = builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(session::SessionState::new())
        .invoke_handler(tauri::generate_handler![
            app_info,
            commands::load_dataset_cmd,
            commands::apply_filter_cmd,
            commands::run_selection_cmd,
            commands::run_ga_selection_cmd,
            commands::ga_send_abort,
            commands::has_dataset_cmd,
            commands::get_last_filter_result_cmd,
            commands::load_example_dataset_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
