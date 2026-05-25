use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "method", rename_all = "camelCase")]
pub enum CrossValidationMethod {
    LeaveOneOut,
    KFold { k: usize },
    Bootstrap { n_iterations: usize, test_fraction: f64 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationConfig {
    pub cv_method: CrossValidationMethod,
    pub shuffle: bool,
    pub random_seed: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResults {
    pub q2: f64,
    pub r2: f64,
    pub rmse_cv: f64,
    pub rmse_train: f64,
    /// Vetores alinhados com as amostras.
    pub y_predicted_cv: Vec<f64>,
    pub y_actual: Vec<f64>,
    pub config: ValidationConfig,
}
