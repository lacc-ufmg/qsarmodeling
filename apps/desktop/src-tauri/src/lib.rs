use serde::Serialize;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

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
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let sidecar_command = app.shell().sidecar("qsar-backend")
                .expect("failed to create `qsar-backend` sidecar configuration");

            let (mut rx, mut _child) = sidecar_command
                .spawn()
                .expect("Failed to spawn qsar-backend sidecar");

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
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
