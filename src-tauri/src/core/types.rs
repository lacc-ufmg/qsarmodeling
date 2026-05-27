use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionSettings {
    pub latent_vars_ops: usize,
    pub latent_vars_model: usize,
    pub vars_percentage: f64,
    pub min_vars_model: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionResult {
    pub method: String,
    pub selected_descriptors: usize,
    pub latent_variables: usize,
    pub q2: f64,
    pub r2: f64,
    pub validation_passed: bool,
}
