use serde::Serialize;
use tauri::{ipc::Channel, State};
use crate::{
    domain::{filter::{FilterConfig, FilterReport}, ops::OpsConfig, validation::{ValidationConfig, ValidationResults}},
    error::AppError,
    events::{FilterEvent, OpsEvent, ValidationEvent},
    state::{AppState, PipelineStage},
};

// DTO devolvido ao frontend após carga dos CSVs.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedDatasetDto {
    pub n_samples: usize,
    pub n_features: usize,
    pub has_row_labels: bool,
    pub has_col_labels: bool,
}

// Resumo serializável do pipeline para hidratação inicial da UI.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineSummaryDto {
    pub stage: PipelineStage,
    pub raw_features: Option<usize>,
    pub filtered_features: Option<usize>,
    pub filter_report: Option<FilterReport>,
    pub ops_best_n_vars: Option<usize>,
    pub ops_best_q2: Option<f64>,
    pub validation: Option<ValidationResults>,
}

#[tauri::command]
pub async fn load_datasets(
    state: State<'_, AppState>,
    x_path: String,
    y_path: String,
) -> Result<LoadedDatasetDto, AppError> { todo!() }

#[tauri::command]
pub async fn apply_filters(
    state: State<'_, AppState>,
    config: FilterConfig,
    channel: Channel<FilterEvent>,
) -> Result<(), AppError> { todo!() }

#[tauri::command]
pub async fn run_ops(
    state: State<'_, AppState>,
    config: OpsConfig,
    channel: Channel<OpsEvent>,
) -> Result<(), AppError> { todo!() }

#[tauri::command]
pub async fn run_validation(
    state: State<'_, AppState>,
    config: ValidationConfig,
    channel: Channel<ValidationEvent>,
) -> Result<(), AppError> { todo!() }

#[tauri::command]
pub async fn cancel_task(
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.task.lock().await.cancel();
    Ok(())
}

#[tauri::command]
pub async fn get_pipeline_summary(
    state: State<'_, AppState>,
) -> Result<PipelineSummaryDto, AppError> { todo!() }
