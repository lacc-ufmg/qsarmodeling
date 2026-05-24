use serde::Serialize;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

mod workflow;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    app_name: String,
    platform: String,
    version: String,
}

struct SidecarState {
    child_pid: Mutex<Option<u32>>,
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
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .manage(SidecarState {
            child_pid: Mutex::new(None),
        })
        .manage(workflow::WorkflowSessionStore::default())
        .setup(|app| {
            let sidecar_command = app
                .shell()
                .sidecar("qsar-backend")
                .expect("failed to create `qsar-backend` sidecar configuration");

            let (mut rx, child) = sidecar_command
                .spawn()
                .expect("Failed to spawn qsar-backend sidecar");

            // Store the child process ID in app state
            if let Ok(mut state) = app.state::<SidecarState>().child_pid.lock() {
                *state = Some(child.pid());
            }

            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    if let CommandEvent::Stdout(line) = event {
                        if let Ok(val) = String::from_utf8(line) {
                            println!("[backend] {}", val.trim());
                        }
                    } else if let CommandEvent::Stderr(line) = event {
                        if let Ok(val) = String::from_utf8(line) {
                            eprintln!("[backend err] {}", val.trim());
                        }
                    } else if let CommandEvent::Terminated(payload) = event {
                        println!("[backend] Process terminated with {:?}", payload.code);
                        break;
                    }
                }
            });

            Ok(())
        })
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
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                // Kill the sidecar process when the app exits
                if let Ok(mut state) = app_handle.state::<SidecarState>().child_pid.lock() {
                    if let Some(child_pid) = state.take() {
                        #[cfg(unix)]
                        {
                            let _ = std::process::Command::new("kill")
                                .arg(child_pid.to_string())
                                .output();
                        }
                        #[cfg(windows)]
                        {
                            let _ = std::process::Command::new("taskkill")
                                .args(["/PID", &child_pid.to_string(), "/F"])
                                .output();
                        }
                    }
                }
            }
        });
}
