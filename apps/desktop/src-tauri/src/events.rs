use crate::core::domain::{
    filter::{FilterReport, FilterStageReport},
    ops::OpsStep,
    validation::ValidationResults,
};
use serde::Serialize;

/// Nome da etapa de filtragem em curso, para a UI saber qual barra avançar.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FilterStageName { Variance, Correlation, Autocorrelation }

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FilterEvent {
    StageStarted  { stage: FilterStageName, total: usize },
    StageProgress { stage: FilterStageName, processed: usize, total: usize },
    StageCompleted{ stage: FilterStageName, report: FilterStageReport },
    Completed     { report: FilterReport },
    Cancelled,
    Error         { message: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum OpsEvent {
    Started      { min_vars: usize, max_vars: usize },
    StepCompleted{ step: OpsStep, progress_pct: f32 },
    Completed    { best_n_vars: usize, best_q2: f64 },
    Cancelled,
    Error        { message: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ValidationEvent {
    Started       { total_folds: usize },
    FoldCompleted { fold: usize, total_folds: usize },
    Completed     { results: ValidationResults },
    Cancelled,
    Error         { message: String },
}
