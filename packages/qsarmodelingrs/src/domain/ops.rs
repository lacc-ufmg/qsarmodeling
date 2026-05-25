use serde::{Deserialize, Serialize};
use ndarray::Array2;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpsConfig {
    /// Intervalo de variáveis a explorar.
    pub min_vars: usize,
    pub max_vars: usize,
    /// Número máximo de iterações internas por tamanho de subconjunto.
    pub max_iterations: usize,
}

/// Resultado para um tamanho específico de subconjunto.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpsStep {
    pub n_vars: usize,
    /// Índices no X *de entrada do OPS* (filtrado ou original).
    pub selected_indices: Vec<usize>,
    pub q2: f64,
    pub r2: f64,
    pub rmse_cv: f64,
}

#[derive(Debug, Clone)]
pub struct OpsResult {
    pub steps: Vec<OpsStep>,          // um por tamanho de subconjunto avaliado
    pub best_step_idx: usize,         // índice em `steps` com melhor Q²
    pub x_selected: Array2<f64>,      // submatriz final
    pub config: OpsConfig,
    /// Índices das colunas selecionadas **em relação ao X original**.
    pub original_indices: Vec<usize>,
}

impl OpsResult {
    pub fn best(&self) -> &OpsStep {
        &self.steps[self.best_step_idx]
    }
}
