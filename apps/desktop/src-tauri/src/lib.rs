use serde::Serialize;

mod core;
mod commands;
mod events;
mod error;
use crate::core::state::AppState;

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
    let _ = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            app_info,
            // new commands replacing the old workflow module
            commands::load_datasets,
            commands::apply_filters,
            commands::run_ops,
            commands::run_validation,
            commands::cancel_task,
            commands::get_pipeline_summary,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
