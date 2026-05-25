use serde::{Deserialize, Serialize};
use ndarray::{Array1, Array2};

use super::dataset::DatasetMeta;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterConfig {
    pub variance: f64,
    pub correlation: f64,
    pub autocorrelation: f64,
}

impl Default for FilterConfig {
    fn default() -> Self {
        Self {
            variance: 0.3,
            correlation: 0.25,
            autocorrelation: 0.95
        }
    }
}

/// Relatório de uma única etapa de filtragem.
/// `removed_indices` são índices *no vetor de entrada daquela etapa*,
/// permitindo rastrear a proveniência até o X original.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterStageReport {
    pub input_features: usize,
    pub removed: usize,
    pub retained: usize,
}

/// Relatório completo após as três etapas.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterReport {
    pub initial_features: usize,
    pub variance: Option<FilterStageReport>,
    pub correlation: Option<FilterStageReport>,
    pub autocorrelation: Option<FilterStageReport>,
    pub final_features: usize,
    /// Índices das colunas mantidas **em relação ao X original**.
    /// Essencial para exibir os nomes dos descritores na UI.
    pub retained_original_indices: Vec<usize>,
}

/// Dataset após filtragem. y é sempre uma referência/clone do RawDataset.
#[derive(Debug, Clone)]
pub struct FilteredDataset {
    pub x: Array2<f64>,
    pub y: Array1<f64>,
    /// Meta atualizada (n_features = final_features).
    pub meta: DatasetMeta,
    pub config: FilterConfig,
    pub report: FilterReport,
}

/// Trait implementado por cada filtro concreto.
/// Recebe o X atual e devolve (X_novo, relatório da etapa).
pub trait ColumnFilter: Send + Sync {
    fn apply(
        &self,
        x: &Array2<f64>,
        cancel: &tokio_util::sync::CancellationToken,
    ) -> Result<(Array2<f64>, FilterStageReport), crate::error::AppError>;
}

