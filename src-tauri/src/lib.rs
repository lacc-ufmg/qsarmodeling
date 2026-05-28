pub mod core;
pub(crate) mod utils;
pub mod validation;

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
    let _ = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(core::session::SessionState::new())
        .invoke_handler(tauri::generate_handler![
            app_info,
            core::commands::load_dataset_cmd,
            core::commands::apply_filter_cmd,
            core::commands::run_selection_cmd,
            core::commands::has_dataset_cmd,
            core::commands::get_last_filter_result_cmd,
            core::commands::load_example_dataset_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
