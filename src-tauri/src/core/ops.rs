//! Ordered Predictors Selection (OPS) for PLS1-based feature selection.
//!
//! ## Algorithm
//!
//! **Phase 1 – ranking.**  Fit a global PLS1 model on the full feature matrix
//! with [`OpsConfig::latent_vars_ops`] components.  Rank features by
//! descending |β| (*informative vector*).
//!
//! **Phase 2 – selection.**  Starting at [`OpsConfig::min_vars_model`] and
//! stepping by ⌈n_features × [`OpsConfig::vars_percentage`]⌉, evaluate each
//! candidate sub-model (top-k ranked columns) by leave-one-out RMSECV with
//! [`OpsConfig::latent_vars_model`] PLS components.  Return the sub-model
//! with the lowest RMSECV.

use ndarray::{Array1, Array2};
use serde::{Deserialize, Serialize};
use super::pls;
use crate::utils::*;
use crate::validation::loo::loo_rmsecv;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpsConfig {
    /// PLS components for the global model that produces the informative vector.
    pub latent_vars_ops: usize,
    /// PLS components fixed for every candidate sub-model during selection.
    pub latent_vars_model: usize,
    /// Fraction of features added per iteration ∈ (0, 1].
    pub vars_percentage: f64,
    /// Minimum sub-model size; must be ≥ `latent_vars_model`.
    pub min_vars_model: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpsResult {
    /// Indices into the **input** X of the selected features, in rank order
    /// (most informative first).
    pub selected_indices: Vec<usize>,
    /// All input column indices sorted by descending |β| (full ranking).
    pub ranked_indices: Vec<usize>,
    /// `(n_vars, RMSECV)` for every candidate sub-model evaluated.
    pub evaluation_trace: Vec<(usize, f64)>,
    /// Leave-one-out RMSECV of the winning sub-model.
    pub best_rmsecv: f64,
}

impl OpsConfig {
    pub fn run(&self, x: &Array2<f64>, y: &Array1<f64>) -> OpsResult {
        run_ops(x, y, self)
    }
}

/// Run OPS on feature matrix `x` (columns = features) and target `y`.
/// `x` is expected to already be filtered and normalised by the preceding
/// pipeline stages.
pub fn run_ops(x: &Array2<f64>, y: &Array1<f64>, config: &OpsConfig) -> OpsResult {
    let (n, p) = x.dim();

    debug_assert!(n >= 3, "OPS requires ≥ 3 samples for LOO-CV");
    debug_assert_eq!(y.len(), n);
    debug_assert!(
        config.vars_percentage > 0.0 && config.vars_percentage <= 1.0,
        "vars_percentage must be in (0, 1]"
    );
    debug_assert!(config.latent_vars_model >= 1);

    // ── Phase 1: informative vector ──────────────────────────────────────────
    let lv_ops = config.latent_vars_ops.min(p).min(n - 1).max(1);
    let iv = pls::pls1_fit(x, y, lv_ops).beta;

    let mut ranked: Vec<usize> = (0..p).collect();
    ranked.sort_unstable_by(|&a, &b| {
        iv[b]
            .abs()
            .partial_cmp(&iv[a].abs())
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // ── Phase 2: candidate sub-model loop ────────────────────────────────────
    let lv_m  = config.latent_vars_model;
    let min_k = config.min_vars_model.max(lv_m).min(p);
    let step  = ((p as f64 * config.vars_percentage).ceil() as usize).max(1);

    let mut trace: Vec<(usize, f64)> = Vec::new();
    let mut best_rmsecv = f64::INFINITY;
    let mut best_k = min_k;

    let mut k = min_k;
    loop {
        let x_sub = select_columns(x, &ranked[..k]);

        // In each LOO fold training has n−1 rows; clamp LVs to stay valid.
        let lv = lv_m.min(k).min(n.saturating_sub(2)).max(1);
        let rmsecv = loo_rmsecv(&x_sub, y, lv);

        trace.push((k, rmsecv));
        if rmsecv < best_rmsecv {
            best_rmsecv = rmsecv;
            best_k = k;
        }

        if k >= p {
            break;
        }
        k = (k + step).min(p);
    }

    OpsResult {
        selected_indices: ranked[..best_k].to_vec(),
        ranked_indices: ranked,
        evaluation_trace: trace,
        best_rmsecv,
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use ndarray::{Array1, Array2};

    // Dataset (n=4, p=3):
    //   y      = [1, 2, 3, 4]
    //   col 0  = y              (perfect predictor)
    //   col 1  = [1,-2, 1, 0]  (zero correlation with y, see orthogonality proof above)
    //   col 2  = [0, 1,-2, 1]  (zero correlation with y)
    fn ops_test_dataset() -> (Array2<f64>, Array1<f64>) {
        let x = Array2::from_shape_vec(
            (4, 3),
            vec![
                1.0,  1.0,  0.0,
                2.0, -2.0,  1.0,
                3.0,  1.0, -2.0,
                4.0,  0.0,  1.0,
            ],
        )
        .unwrap();
        let y = Array1::from_vec(vec![1.0, 2.0, 3.0, 4.0]);
        (x, y)
    }

    fn ops_test_config() -> OpsConfig {
        OpsConfig {
            latent_vars_ops:   1,
            latent_vars_model: 1,
            vars_percentage:   0.5, // step = ⌈3 × 0.5⌉ = 2
            min_vars_model:    1,
        }
    }

    // col 0 has IV = 1, col 1 and col 2 have IV = 0, so col 0 must rank first.
    // The 1-variable sub-model (col 0 alone) achieves RMSECV ≈ 0.
    #[test]
    fn ops_ranks_sole_predictor_first_and_achieves_zero_rmsecv() {
        let (x, y) = ops_test_dataset();
        let result = run_ops(&x, &y, &ops_test_config());

        assert_eq!(
            result.ranked_indices[0], 0,
            "col 0 must be the top-ranked feature; ranking = {:?}",
            result.ranked_indices
        );
        assert!(
            result.selected_indices.contains(&0),
            "selected set {:?} must include col 0",
            result.selected_indices
        );
        assert!(
            result.best_rmsecv < 1e-9,
            "best RMSECV={:.2e}, expected ~0",
            result.best_rmsecv
        );
    }

    // Trace must be non-empty, n_vars strictly increasing, last entry = p.
    // With p=3, step=2, min_k=1: k evaluates at 1, then min(1+2,3)=3 → 2 entries.
    #[test]
    fn ops_trace_is_non_empty_strictly_increasing_ending_at_p() {
        let (x, y) = ops_test_dataset();
        let result = run_ops(&x, &y, &ops_test_config());

        assert!(!result.evaluation_trace.is_empty());

        let sizes: Vec<usize> = result.evaluation_trace.iter().map(|&(k, _)| k).collect();
        for w in sizes.windows(2) {
            assert!(w[0] < w[1], "n_vars must increase; trace sizes = {sizes:?}");
        }
        assert_eq!(
            result.evaluation_trace.last().unwrap().0,
            3,
            "last evaluated sub-model must use all 3 features"
        );

        for &(k, rmsecv) in &result.evaluation_trace {
            assert!(k >= 1 && k <= 3);
            assert!(rmsecv.is_finite() && rmsecv >= 0.0);
        }
    }

    // best_rmsecv must equal the minimum RMSECV across all trace entries.
    #[test]
    fn ops_best_rmsecv_matches_trace_minimum() {
        // Richer 6-sample dataset to exercise more of the trace.
        let x = Array2::from_shape_vec(
            (6, 4),
            vec![
                1.0, 0.5,  1.0, -1.0,
                2.0, 1.0, -2.0,  1.0,
                3.0, 1.5,  1.0, -1.0,
                4.0, 2.0, -2.0,  1.0,
                5.0, 2.5,  1.0, -1.0,
                6.0, 3.0, -2.0,  1.0,
            ],
        )
        .unwrap();
        let y = Array1::from_vec(vec![2.0, 4.0, 6.0, 8.0, 10.0, 12.0]);

        let config = OpsConfig {
            latent_vars_ops:   1,
            latent_vars_model: 1,
            vars_percentage:   0.25, // step = ⌈4 × 0.25⌉ = 1 → 4 trace entries
            min_vars_model:    1,
        };

        let result = run_ops(&x, &y, &config);

        let trace_min = result
            .evaluation_trace
            .iter()
            .map(|&(_, r)| r)
            .fold(f64::INFINITY, f64::min);

        assert!(
            (result.best_rmsecv - trace_min).abs() < 1e-12,
            "best_rmsecv={:.6} but trace minimum={:.6}",
            result.best_rmsecv, trace_min
        );
    }

    // selected_indices must be a prefix of ranked_indices of length best_k.
    #[test]
    fn ops_selected_indices_are_prefix_of_ranked_indices() {
        let (x, y) = ops_test_dataset();
        let result = run_ops(&x, &y, &ops_test_config());

        let best_k = result.selected_indices.len();
        assert_eq!(
            result.selected_indices,
            result.ranked_indices[..best_k],
            "selected_indices must be the first best_k entries of ranked_indices"
        );
    }
}
