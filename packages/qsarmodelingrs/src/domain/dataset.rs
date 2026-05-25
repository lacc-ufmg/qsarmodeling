use ndarray::{Array1, Array2};
use serde::Serialize;
use std::path::PathBuf;

/// Metadados do CSV; não carrega os valores em si.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetMeta {
    pub n_samples: usize,
    pub n_features: usize,
    /// Nomes das linhas (amostras), se presentes no CSV.
    pub row_labels: Option<Vec<String>>,
    /// Nomes das colunas (descritores), se presentes no CSV.
    pub col_labels: Option<Vec<String>>,
    pub x_path: PathBuf,
    pub y_path: PathBuf,
}

/// Dataset original, imutável após o carregamento.
/// É a fonte de verdade para reaplica de filtros (passo 7 do fluxo).
#[derive(Debug, Clone)]
pub struct RawDataset {
    pub x: Array2<f64>,   // [n_samples × n_features]  tipicamente 100×300 000
    pub y: Array1<f64>,   // [n_samples]
    pub meta: DatasetMeta,
}
