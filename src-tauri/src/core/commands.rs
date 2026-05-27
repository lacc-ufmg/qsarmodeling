use std::path::Path;

use tauri::State;

use crate::core::loader::DatasetMetadata;

use super::session::SessionState;
use super::filter::{FilterConfig, FilterResult};

#[tauri::command]
pub async fn load_dataset_cmd(
    state: State<'_, SessionState>,
    x_path: String,
    y_path: String,
) -> Result<DatasetMetadata, String> {
    state.load_dataset(Path::new(&x_path), Path::new(&y_path))
}

#[tauri::command]
pub async fn apply_filter_cmd(
    state: State<'_, SessionState>,
    config: FilterConfig,
) -> Result<FilterResult, String> {
    state.apply_filter(config)
}

#[tauri::command]
pub fn has_dataset_cmd(state: State<SessionState>) -> bool {
    state.has_dataset()
}

#[tauri::command]
pub fn get_last_filter_result_cmd(
    state: State<SessionState>,
) -> Option<FilterResult> {
    state.get_last_result()
}
