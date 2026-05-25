use serde::Serialize;
use tauri::{ipc::Channel, State};
use crate::core::{
    domain::{
        filter::{FilterConfig, FilterReport, FilteredDataset},
        ops::{OpsConfig, OpsResult, OpsStep},
        validation::{ValidationConfig, ValidationResults},
        dataset::{RawDataset, DatasetMeta},
    },
    state::{AppState, PipelineStage},
};
use crate::error::AppError;
use crate::events::{FilterEvent, OpsEvent, ValidationEvent};
use ndarray::{Array1, Array2};
use std::path::PathBuf;

use csv;

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
) -> Result<LoadedDatasetDto, AppError> {
    let matrix_path = PathBuf::from(&x_path);
    let vector_path = PathBuf::from(&y_path);

    if !matrix_path.exists() {
        return Err(AppError::Io { message: format!("Matrix file not found: {}", matrix_path.display()) });
    }
    if !vector_path.exists() {
        return Err(AppError::Io { message: format!("Vector file not found: {}", vector_path.display()) });
    }

    let mut rdr = csv::ReaderBuilder::new().has_headers(false).from_path(&matrix_path)
        .map_err(|e| AppError::CsvParse { message: e.to_string() })?;

    let mut rows: Vec<Vec<f64>> = Vec::new();
    for (i, result) in rdr.records().enumerate() {
        let record = result.map_err(|e| AppError::CsvParse { message: e.to_string() })?;
        let mut row: Vec<f64> = Vec::with_capacity(record.len());
        for (j, field) in record.iter().enumerate() {
            let v = field.parse::<f64>().map_err(|_| AppError::CsvParse { message: format!("Non-numeric value at row {}, col {}: {}", i + 1, j + 1, field) })?;
            row.push(v);
        }
        rows.push(row);
    }

    let n_samples = rows.len();
    let n_features = if n_samples > 0 { rows[0].len() } else { 0 };
    for (i, row) in rows.iter().enumerate() {
        if row.len() != n_features {
            return Err(AppError::CsvParse { message: format!("Inconsistent columns at row {}", i + 1) });
        }
    }

    let flat: Vec<f64> = rows.into_iter().flatten().collect();
    let x = Array2::from_shape_vec((n_samples, n_features), flat)
        .map_err(|e| AppError::Computation { message: e.to_string() })?;

    let mut rdr_y = csv::ReaderBuilder::new().has_headers(false).from_path(&vector_path)
        .map_err(|e| AppError::CsvParse { message: e.to_string() })?;
    let mut yvec: Vec<f64> = Vec::new();
    for (i, result) in rdr_y.records().enumerate() {
        let record = result.map_err(|e| AppError::CsvParse { message: e.to_string() })?;
        if record.len() == 0 { continue; }
        let field = record.get(0).unwrap();
        let v = field.parse::<f64>().map_err(|_| AppError::CsvParse { message: format!("Non-numeric value in vector at row {}: {}", i + 1, field) })?;
        yvec.push(v);
    }

    if yvec.len() != n_samples {
        return Err(AppError::DimensionMismatch { x_samples: n_samples, y_samples: yvec.len() });
    }

    let y = Array1::from(yvec);

    let meta = DatasetMeta {
        n_samples,
        n_features,
        row_labels: None,
        col_labels: None,
        x_path: matrix_path.clone(),
        y_path: vector_path.clone(),
    };

    let raw = RawDataset { x: x.clone(), y: y.clone(), meta: meta.clone() };

    {
        let mut pipeline = state.pipeline.lock().await;
        pipeline.raw = Some(raw);
        pipeline.invalidate_from_filter();
    }

    Ok(LoadedDatasetDto { n_samples, n_features, has_row_labels: false, has_col_labels: false })
}

#[tauri::command]
pub async fn apply_filters(
    state: State<'_, AppState>,
    config: FilterConfig,
    channel: Channel<FilterEvent>,
) -> Result<(), AppError> {
    let _token = { let mut t = state.task.lock().await; t.begin() };

    let mut pipeline = state.pipeline.lock().await;
    let raw = pipeline.raw.as_ref().ok_or(AppError::InsufficientPipeline { required: "loaded".into() })?;

    // No-op filter for now: keep original dataset and create a trivial report
    let report = FilterReport {
        initial_features: raw.meta.n_features,
        variance: None,
        correlation: None,
        autocorrelation: None,
        final_features: raw.meta.n_features,
        retained_original_indices: (0..raw.meta.n_features).collect(),
    };

    let filtered = FilteredDataset {
        x: raw.x.clone(),
        y: raw.y.clone(),
        meta: DatasetMeta {
            n_samples: raw.meta.n_samples,
            n_features: raw.meta.n_features,
            row_labels: raw.meta.row_labels.clone(),
            col_labels: raw.meta.col_labels.clone(),
            x_path: raw.meta.x_path.clone(),
            y_path: raw.meta.y_path.clone(),
        },
        config: config.clone(),
        report: report.clone(),
    };

    pipeline.filtered = Some(filtered);
    pipeline.invalidate_from_filter();

    channel.send(FilterEvent::Completed { report }).map_err(|e| AppError::Computation { message: e.to_string() })?;
    Ok(())
}

#[tauri::command]
pub async fn run_ops(
    state: State<'_, AppState>,
    config: OpsConfig,
    channel: Channel<OpsEvent>,
) -> Result<(), AppError> {
    let _token = { let mut t = state.task.lock().await; t.begin() };

    let mut pipeline = state.pipeline.lock().await;
    let x_opt = pipeline.ops_input_x().ok_or(AppError::InsufficientPipeline { required: "loaded".into() })?;
    let x = x_opt.clone();
    let n_samples = x.nrows();
    let n_features = x.ncols();

    let chosen = std::cmp::min(config.min_vars, n_features);
    let selected_indices: Vec<usize> = (0..chosen).collect();

    // build x_selected
    let mut flat: Vec<f64> = Vec::with_capacity(n_samples * chosen);
    for r in 0..n_samples {
        for &c in &selected_indices {
            flat.push(x[[r, c]]);
        }
    }
    let x_selected = Array2::from_shape_vec((n_samples, chosen), flat)
        .map_err(|e| AppError::Computation { message: e.to_string() })?;

    let step = OpsStep {
        n_vars: chosen,
        selected_indices: selected_indices.clone(),
        q2: 0.0,
        r2: 0.0,
        rmse_cv: 0.0,
    };

    let ops_res = OpsResult {
        steps: vec![step.clone()],
        best_step_idx: 0,
        x_selected: x_selected.clone(),
        config: config.clone(),
        original_indices: selected_indices.clone(),
    };

    pipeline.ops_result = Some(ops_res);
    pipeline.invalidate_from_ops();

    channel.send(OpsEvent::Completed { best_n_vars: chosen, best_q2: 0.0 }).map_err(|e| AppError::Computation { message: e.to_string() })?;
    Ok(())
}

#[tauri::command]
pub async fn run_validation(
    state: State<'_, AppState>,
    config: ValidationConfig,
    channel: Channel<ValidationEvent>,
) -> Result<(), AppError> {
    let _token = { let mut t = state.task.lock().await; t.begin() };

    let mut pipeline = state.pipeline.lock().await;
    let raw = pipeline.raw.as_ref().ok_or(AppError::InsufficientPipeline { required: "loaded".into() })?;
    let y_len = raw.meta.n_samples;

    let results = ValidationResults {
        q2: 0.0,
        r2: 0.0,
        rmse_cv: 0.0,
        rmse_train: 0.0,
        y_predicted_cv: vec![0.0; y_len],
        y_actual: raw.y.to_vec(),
        config: config.clone(),
    };

    pipeline.validation_results = Some(results.clone());

    channel.send(ValidationEvent::Completed { results: results.clone() }).map_err(|e| AppError::Computation { message: e.to_string() })?;
    Ok(())
}

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
) -> Result<PipelineSummaryDto, AppError> {
    let pipeline = state.pipeline.lock().await;
    let stage = pipeline.stage();
    let raw_features = pipeline.raw.as_ref().map(|r| r.meta.n_features);
    let filtered_features = pipeline.filtered.as_ref().map(|f| f.meta.n_features);
    let filter_report = pipeline.filtered.as_ref().map(|f| f.report.clone());
    let (ops_best_n_vars, ops_best_q2) = pipeline.ops_result.as_ref().map(|o| {
        let best = &o.steps[o.best_step_idx];
        (Some(best.n_vars), Some(best.q2))
    }).unwrap_or((None, None));
    let validation = pipeline.validation_results.clone();

    Ok(PipelineSummaryDto {
        stage,
        raw_features,
        filtered_features,
        filter_report,
        ops_best_n_vars,
        ops_best_q2,
        validation,
    })
}





