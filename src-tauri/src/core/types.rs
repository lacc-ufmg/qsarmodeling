use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DatasetSource {
    Uploaded,
    Filtered,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetProfile {
    pub session_id: String,
    pub id: String,
    pub matrix_name: String,
    pub vector_name: String,
    pub rows: usize,
    pub descriptors: usize,
    pub source: DatasetSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterSettings {
    pub var_cut: f64,
    pub corr_cut: f64,
    pub autocorr_cut: f64,
    pub autoscale: bool,
    pub lj_transform: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionSettings {
    pub latent_vars_model: usize,
    pub latent_vars_ops: usize,
    pub vars_percentage: usize,
    pub min_vars_model: usize,
    pub max_vars_model: usize,
    pub population_size: usize,
    pub generations: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionResult {
    pub session_id: String,
    pub method: String,
    pub selected_descriptors: usize,
    pub latent_variables: usize,
    pub q2: f64,
    pub r2: f64,
    pub validation_passed: bool,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) struct FilterCacheKey {
    var_cut: u64,
    corr_cut: u64,
    autocorr_cut: u64,
    autoscale: bool,
    lj_transform: bool,
}

impl From<FilterSettings> for FilterCacheKey {
    fn from(settings: FilterSettings) -> Self {
        Self {
            var_cut: settings.var_cut.to_bits(),
            corr_cut: settings.corr_cut.to_bits(),
            autocorr_cut: settings.autocorr_cut.to_bits(),
            autoscale: settings.autoscale,
            lj_transform: settings.lj_transform,
        }
    }
}
