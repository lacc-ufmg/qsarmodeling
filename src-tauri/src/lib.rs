use serde::Serialize;

mod workflow;

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
        .manage(workflow::WorkflowSessionStore::default())
        .invoke_handler(tauri::generate_handler![
            app_info,
            workflow::get_workflow_snapshot,
            workflow::update_filter_settings,
            workflow::update_selection_settings,
            workflow::update_validation_settings,
            workflow::load_dataset,
            workflow::run_descriptor_filters,
            workflow::run_variable_selection,
            workflow::run_validation_suite,
            workflow::run_full_pipeline,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
