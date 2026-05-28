pub mod kfold;
pub mod lno;
pub mod loo;
pub mod metrics;
pub mod yrand;

use metrics::*;
use serde::{Deserialize, Serialize};

/// Configuration for cross-validation runs
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CVConfig {
    /// Maximum number of latent variables to test
    pub n_lv_max: usize,
    /// Number of folds (K-Fold) or repeats (Leave-N-Out)
    pub n_folds: usize,
    /// Enable parallel computation for folds/repeats
    pub enable_parallel: bool,
    /// Optional random seed for reproducibility
    pub seed: Option<u64>,
}

/// Result of cross-validation run with all computed metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CVResult {
    /// Cross-validation Q² (coefficient of predictive power) per LV
    pub q2: Vec<f64>,
    /// Calibration R² per LV
    pub r2: Vec<f64>,
    /// Calibration RMSE per LV
    pub rmsec: Vec<f64>,
    /// Cross-validation RMSE per LV
    pub rmsecv: Vec<f64>,
    /// Mean Absolute Error per LV
    pub mae: Vec<f64>,
    /// Correlation coefficient for calibration per LV
    pub rcal: Vec<f64>,
    /// Correlation coefficient for CV per LV
    pub rcv: Vec<f64>,
    /// F-statistic per LV (model significance)
    pub f_stat: Vec<f64>,
    /// Average scaled R² metric (avgRm) per LV
    pub avg_rm: Vec<f64>,
    /// Delta scaled R² metric (deltaRm) per LV
    pub delta_rm: Vec<f64>,
    /// Number of latent variables tested
    pub n_lv: usize,
    /// Method name (e.g., "Leave-One-Out", "Leave-N-Out", "K-Fold")
    pub method: String,
}

/// Result of Y-randomization validation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YRandomizationResult {
    /// Q² vs R correlation intercept (lower is better, < 0.3 is valid)
    pub q2_intercept: f64,
    /// Q² vs R correlation slope
    pub q2_slope: f64,
    /// RMSECV vs R correlation intercept
    pub rmsecv_intercept: f64,
    /// RMSECV vs R correlation slope
    pub rmsecv_slope: f64,
    /// R² vs R correlation intercept
    pub r2_intercept: f64,
    /// R² vs R correlation slope
    pub r2_slope: f64,
    /// All R values computed (correlation with shuffled y)
    pub r_values: Vec<f64>,
    /// All Q² values (original + randomized)
    pub q2_values: Vec<f64>,
    /// All RMSECV values (original + randomized)
    pub rmsecv_values: Vec<f64>,
    /// All R² values (original + randomized)
    pub r2_values: Vec<f64>,
    /// Number of randomization iterations performed
    pub n_randomizations: usize,
    /// Pass/fail: intercept < 0.3 (typically valid threshold)
    pub passed: bool,
}
