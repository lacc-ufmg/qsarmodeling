use serde::{Deserialize, Serialize};
use std::path::Path;

use tauri::path::BaseDirectory;
use tauri::Manager;
use tauri::State;

use super::loader::DatasetMetadata;
use super::ops::{OpsConfig, OpsResult};

use super::filter::{FilterConfig, FilterResult};
use super::session::SessionState;

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
pub async fn run_selection_cmd(
    state: State<'_, SessionState>,
    settings: OpsConfig,
) -> Result<OpsResult, String> {
    state.run_ops(settings)
}

#[tauri::command]
pub fn has_dataset_cmd(state: State<SessionState>) -> bool {
    state.has_dataset()
}

#[tauri::command]
pub fn get_last_filter_result_cmd(state: State<SessionState>) -> Option<FilterResult> {
    state.get_last_result()
}

#[derive(Debug, Serialize, Deserialize)]
pub enum ExampleDataset {
    Dream,
    Carbox,
    CarboxBig,
}

#[tauri::command]
pub async fn load_example_dataset_cmd(
    handle: tauri::AppHandle,
    state: State<'_, SessionState>,
    dataset: ExampleDataset,
) -> Result<DatasetMetadata, String> {
    let (x_path_rel, y_path_rel) = match dataset {
        ExampleDataset::Dream => ("examples/data/dream/X.csv", "examples/data/dream/y.csv"),
        ExampleDataset::Carbox => ("examples/data/carbox/X.csv", "examples/data/carbox/y.csv"),
        ExampleDataset::CarboxBig => (
            "examples/data/carbox/X_big.csv",
            "examples/data/carbox/y.csv",
        ),
    };
    let x_path = handle
        .path()
        .resolve(x_path_rel, BaseDirectory::Resource)
        .expect("Fail to load X path");
    let y_path = handle
        .path()
        .resolve(y_path_rel, BaseDirectory::Resource)
        .expect("Fail to load Y path");
    state.load_dataset(x_path.as_path(), y_path.as_path())
}
