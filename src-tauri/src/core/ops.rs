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

use ndarray::{s, Array1, Array2, Axis, Zip};
use serde::{Deserialize, Serialize};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

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
    let iv = pls1_fit(x, y, lv_ops).beta;

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

// ─────────────────────────────────────────────────────────────────────────────
// PLS1 – NIPALS
// ─────────────────────────────────────────────────────────────────────────────

struct PlsFit {
    /// Regression vector in the centered feature space: ŷ_c = Xc · β.
    beta: Array1<f64>,
    /// Column means of X (used to center new samples before prediction).
    x_mean: Array1<f64>,
    /// Mean of y (added back after the centered prediction).
    y_mean: f64,
}

fn pls1_fit(x: &Array2<f64>, y: &Array1<f64>, n_lv: usize) -> PlsFit {
    let x_mean = x.mean_axis(Axis(0)).unwrap();
    let y_mean = y.mean().unwrap_or(0.0);

    let xc = x - &x_mean.view().insert_axis(Axis(0));
    let yc = y - y_mean;

    PlsFit {
        beta: nipals_beta(&xc, &yc, n_lv),
        x_mean,
        y_mean,
    }
}

/// Predict a single row.  The row must have the same number of columns as the
/// training X used to produce `fit`.
#[inline]
fn pls1_predict_row(fit: &PlsFit, x_row: ndarray::ArrayView1<'_, f64>) -> f64 {
    let xc = &x_row - &fit.x_mean;
    xc.dot(&fit.beta) + fit.y_mean
}

/// NIPALS core loop on **pre-centered** data.
/// Returns β such that ŷ_c = Xc · β.
///
/// Only the components actually extracted (up to `n_lv`) are used to build β,
/// so an early termination due to numerical zero does not corrupt the result.
fn nipals_beta(xc: &Array2<f64>, yc: &Array1<f64>, n_lv: usize) -> Array1<f64> {
    let (_, p) = xc.dim();

    let mut xd = xc.to_owned();
    let mut yd = yc.to_owned();

    // W (p × n_lv) – weight vectors
    // P (p × n_lv) – X-loading vectors
    // q (n_lv)     – y-loading scalars
    let mut w_mat = Array2::<f64>::zeros((p, n_lv));
    let mut p_mat = Array2::<f64>::zeros((p, n_lv));
    let mut q_vec = Array1::<f64>::zeros(n_lv);
    let mut h_max = 0usize; // components successfully extracted

    for h in 0..n_lv {
        // w_h = X^T y / ‖X^T y‖  (direction of maximum X–y covariance)
        let xty: Array1<f64> = xd.t().dot(&yd);
        let norm = xty.dot(&xty).sqrt();
        if norm < 1e-14 {
            break; // no residual variance left to model
        }
        let w = xty / norm;

        // t_h = X w_h  (X-score)
        let t: Array1<f64> = xd.dot(&w);
        let tt = t.dot(&t);
        if tt < 1e-14 {
            break;
        }

        // p_h = X^T t / ‖t‖²,   q_h = y^T t / ‖t‖²  (loadings)
        let p_h: Array1<f64> = xd.t().dot(&t) / tt;
        let q_h: f64         = yd.dot(&t) / tt;

        // Deflate: X ← X − t p_h^T,   y ← y − q_h t
        Zip::from(xd.rows_mut()).and(&t).for_each(|mut row, &ti| {
            row.scaled_add(-ti, &p_h);
        });
        yd = yd - &(&t * q_h);

        w_mat.column_mut(h).assign(&w);
        p_mat.column_mut(h).assign(&p_h);
        q_vec[h] = q_h;
        h_max = h + 1;
    }

    if h_max == 0 {
        return Array1::zeros(p);
    }

    // Restrict matrices to the h_max components that were actually extracted.
    let w_h = w_mat.slice(s![.., ..h_max]).to_owned(); // p   × h_max
    let p_h = p_mat.slice(s![.., ..h_max]).to_owned(); // p   × h_max
    let q_h = q_vec.slice(s![..h_max]).to_owned();      // h_max

    // β = W (P^T W)^{-1} q   [Helland 1988 / de Jong 1993]
    let ptw: Array2<f64> = p_h.t().dot(&w_h); // h_max × h_max
    match mat_inv_gauss(ptw) {
        Some(ptw_inv) => w_h.dot(&ptw_inv).dot(&q_h),
        None => Array1::zeros(p), // degenerate model
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Leave-one-out cross-validation
// ─────────────────────────────────────────────────────────────────────────────

fn loo_rmsecv(x: &Array2<f64>, y: &Array1<f64>, n_lv: usize) -> f64 {
    let n = x.nrows();
    let p = x.ncols();

    // Pre-allocate training buffers; reused every fold to avoid allocation.
    let mut x_tr = Array2::<f64>::zeros((n - 1, p));
    let mut y_tr = Array1::<f64>::zeros(n - 1);
    let mut sse  = 0.0_f64;

    for i in 0..n {
        let mut r = 0usize;
        for j in 0..n {
            if j != i {
                x_tr.row_mut(r).assign(&x.row(j));
                y_tr[r] = y[j];
                r += 1;
            }
        }
        let fit   = pls1_fit(&x_tr, &y_tr, n_lv);
        let y_hat = pls1_predict_row(&fit, x.row(i));
        sse += (y[i] - y_hat).powi(2);
    }

    (sse / n as f64).sqrt()
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

fn select_columns(x: &Array2<f64>, cols: &[usize]) -> Array2<f64> {
    let n = x.nrows();
    let mut out = Array2::<f64>::zeros((n, cols.len()));
    for (new_j, &old_j) in cols.iter().enumerate() {
        out.column_mut(new_j).assign(&x.column(old_j));
    }
    out
}

/// Gauss-Jordan matrix inverse with partial column pivoting.
/// Returns `None` for (near-)singular matrices (|pivot| < 1 × 10⁻¹²).
fn mat_inv_gauss(a: Array2<f64>) -> Option<Array2<f64>> {
    let n = a.nrows();
    debug_assert_eq!(a.ncols(), n);

    // Build the augmented matrix [A | I_n].
    let mut aug = Array2::<f64>::zeros((n, 2 * n));
    aug.slice_mut(s![.., ..n]).assign(&a);
    for i in 0..n {
        aug[[i, n + i]] = 1.0;
    }

    for col in 0..n {
        // Partial pivoting: bring the largest |value| in this column to the diagonal.
        let pivot_row = (col..n)
            .max_by(|&r1, &r2| {
                aug[[r1, col]]
                    .abs()
                    .partial_cmp(&aug[[r2, col]].abs())
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .unwrap();

        if pivot_row != col {
            for j in 0..2 * n {
                let tmp            = aug[[col, j]];
                aug[[col, j]]      = aug[[pivot_row, j]];
                aug[[pivot_row, j]] = tmp;
            }
        }

        let pivot = aug[[col, col]];
        if pivot.abs() < 1e-12 {
            return None;
        }

        let inv_pivot = 1.0 / pivot;
        for j in 0..2 * n {
            aug[[col, j]] *= inv_pivot;
        }

        for row in 0..n {
            if row == col {
                continue;
            }
            let f = aug[[row, col]];
            if f.abs() < 1e-15 {
                continue;
            }
            for j in 0..2 * n {
                let d = aug[[col, j]] * f;
                aug[[row, j]] -= d;
            }
        }
    }

    Some(aug.slice(s![.., n..]).to_owned())
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;
    use ndarray::{Array1, Array2};

    const EPS: f64 = 1e-9;

    // =========================================================================
    // mat_inv_gauss
    // =========================================================================

    #[test]
    fn mat_inv_inverts_1x1() {
        let a = Array2::from_shape_vec((1, 1), vec![4.0]).unwrap();
        let inv = mat_inv_gauss(a).unwrap();
        assert!((inv[[0, 0]] - 0.25).abs() < EPS);
    }

    #[test]
    fn mat_inv_inverts_2x2_diagonal() {
        // [[2, 0], [0, 5]]  →  [[0.5, 0], [0, 0.2]]
        let a = Array2::from_shape_vec((2, 2), vec![2.0, 0.0, 0.0, 5.0]).unwrap();
        let inv = mat_inv_gauss(a).unwrap();
        assert!((inv[[0, 0]] - 0.5).abs() < EPS);
        assert!((inv[[1, 1]] - 0.2).abs() < EPS);
        assert!(inv[[0, 1]].abs() < EPS);
        assert!(inv[[1, 0]].abs() < EPS);
    }

    #[test]
    fn mat_inv_inverts_2x2_dense() {
        // [[3, 1], [2, 4]]  →  1/10 · [[4, -1], [-2, 3]]
        let a = Array2::from_shape_vec((2, 2), vec![3.0, 1.0, 2.0, 4.0]).unwrap();
        let inv = mat_inv_gauss(a).unwrap();
        assert!((inv[[0, 0]] -  0.4).abs() < EPS);
        assert!((inv[[0, 1]] - -0.1).abs() < EPS);
        assert!((inv[[1, 0]] - -0.2).abs() < EPS);
        assert!((inv[[1, 1]] -  0.3).abs() < EPS);
    }

    #[test]
    fn mat_inv_product_with_original_is_identity() {
        // 3 × 3 non-trivial dense matrix
        let a = Array2::from_shape_vec(
            (3, 3),
            vec![1.0, 2.0, 0.0, 3.0, 4.0, 1.0, 0.0, 1.0, 2.0],
        )
        .unwrap();
        let inv = mat_inv_gauss(a.clone()).unwrap();
        let prod = a.dot(&inv);

        for i in 0..3 {
            for j in 0..3 {
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!(
                    (prod[[i, j]] - expected).abs() < 1e-10,
                    "A·A⁻¹[{i},{j}] = {:.2e}, expected {expected}",
                    prod[[i, j]]
                );
            }
        }
    }

    #[test]
    fn mat_inv_returns_none_for_singular_matrix() {
        // rank-1 matrix: second row = 2 × first row
        let a = Array2::from_shape_vec((2, 2), vec![1.0, 2.0, 2.0, 4.0]).unwrap();
        assert!(mat_inv_gauss(a).is_none());
    }

    // =========================================================================
    // nipals_beta
    // =========================================================================

    // Single feature, perfect linear: y = 2 x (centered).
    //
    // Manual derivation (n=5):
    //   xc = [-2,-1,0,1,2],  yc = [-4,-2,0,2,4]
    //   w = X^Ty / ‖X^Ty‖ = 20/20 = 1
    //   t = xc,  tt = 10
    //   p = X^Tt/tt = 10/10 = 1,  q = y^Tt/tt = 20/10 = 2
    //   β = W(P^TW)^{-1}q = 1·1·2 = 2  ✓
    #[test]
    fn nipals_beta_single_feature_perfect_linear() {
        let xc = Array2::from_shape_vec((5, 1), vec![-2.0, -1.0, 0.0, 1.0, 2.0]).unwrap();
        let yc = Array1::from_vec(vec![-4.0, -2.0, 0.0, 2.0, 4.0]);

        let beta = nipals_beta(&xc, &yc, 1);

        assert_eq!(beta.len(), 1);
        assert!((beta[0] - 2.0).abs() < EPS, "β[0]={}", beta[0]);
    }

    // Three features: col0 is the signal, col1 and col2 are zero-correlated
    // noise (orthogonal to y in the centered space).
    //
    // Orthogonality proof (n=4, y=[1,2,3,4], y_c=[-1.5,-0.5,0.5,1.5]):
    //   col1 = [1,-2,1,0]: y_c·col1 = -1.5+1+0.5+0 = 0  ✓
    //   col2 = [0,1,-2,1]: y_c·col2 =  0 -0.5-1+1.5 = 0  ✓
    //
    // Therefore X^Ty = [5, 0, 0], w=[1,0,0], β=[1,0,0].
    #[test]
    fn nipals_beta_identifies_signal_among_orthogonal_noise() {
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
        let y    = Array1::from_vec(vec![1.0, 2.0, 3.0, 4.0]);
        let x_m  = x.mean_axis(Axis(0)).unwrap();
        let y_m  = y.mean().unwrap();
        let xc   = &x - &x_m.view().insert_axis(Axis(0));
        let yc   = &y - y_m;

        let beta = nipals_beta(&xc, &yc, 1);

        assert!(
            (beta[0] - 1.0).abs() < EPS,
            "β[0] should be 1.0, got {}", beta[0]
        );
        assert!(beta[1].abs() < EPS, "β[1] should be 0, got {}", beta[1]);
        assert!(beta[2].abs() < EPS, "β[2] should be 0, got {}", beta[2]);
    }

    // Requesting more LVs than the data can support should not corrupt β.
    // With a rank-1 X (only one non-zero IV direction), h_max=1 regardless
    // of n_lv; the result must equal the n_lv=1 case.
    #[test]
    fn nipals_beta_excess_lv_request_equals_rank1_result() {
        let xc = Array2::from_shape_vec((5, 1), vec![-2.0, -1.0, 0.0, 1.0, 2.0]).unwrap();
        let yc = Array1::from_vec(vec![-4.0, -2.0, 0.0, 2.0, 4.0]);

        let beta_1  = nipals_beta(&xc, &yc, 1);
        let beta_10 = nipals_beta(&xc, &yc, 10); // far more than rank(X)

        assert!(
            (beta_1[0] - beta_10[0]).abs() < EPS,
            "excessive n_lv changed β: {:.6} vs {:.6}", beta_1[0], beta_10[0]
        );
    }

    // =========================================================================
    // pls1_fit / pls1_predict_row
    // =========================================================================

    // y = 3 x → β = 3, x_mean = 3, y_mean = 9.
    // Each training row must be predicted exactly.
    #[test]
    fn pls1_fit_and_predict_perfect_linear_single_feature() {
        let x = Array2::from_shape_vec(
            (5, 1),
            vec![1.0, 2.0, 3.0, 4.0, 5.0],
        )
        .unwrap();
        let y = Array1::from_vec(vec![3.0, 6.0, 9.0, 12.0, 15.0]);

        let fit = pls1_fit(&x, &y, 1);

        assert!((fit.beta[0]  - 3.0).abs() < EPS, "β[0]={}", fit.beta[0]);
        assert!((fit.x_mean[0] - 3.0).abs() < EPS);
        assert!((fit.y_mean    - 9.0).abs() < EPS);

        for i in 0..5 {
            let y_hat = pls1_predict_row(&fit, x.row(i));
            assert!(
                (y_hat - y[i]).abs() < EPS,
                "row {i}: ŷ={y_hat:.6}, y={:.6}", y[i]
            );
        }
    }

    // =========================================================================
    // loo_rmsecv
    // =========================================================================

    // For y = 2x (perfect linear), every LOO fold fits exactly through the
    // training points → each held-out prediction is exact → RMSECV = 0.
    #[test]
    fn loo_rmsecv_zero_for_perfectly_linear_data() {
        let x = Array2::from_shape_vec(
            (6, 1),
            vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
        )
        .unwrap();
        let y = Array1::from_vec(vec![2.0, 4.0, 6.0, 8.0, 10.0, 12.0]);

        let rmsecv = loo_rmsecv(&x, &y, 1);
        assert!(rmsecv < 1e-9, "RMSECV={rmsecv:.2e}, expected ~0 for y=2x");
    }

    // For arbitrary data RMSECV must be non-negative and finite.
    #[test]
    fn loo_rmsecv_is_finite_and_non_negative() {
        let x = Array2::from_shape_vec(
            (5, 2),
            vec![
                1.0, 0.0,
                2.0, 1.0,
                3.0,-1.0,
                4.0, 0.5,
                5.0,-0.5,
            ],
        )
        .unwrap();
        let y = Array1::from_vec(vec![1.0, 3.0, 2.0, 4.0, 2.5]);

        let rmsecv = loo_rmsecv(&x, &y, 1);
        assert!(rmsecv >= 0.0);
        assert!(rmsecv.is_finite());
    }

    // =========================================================================
    // run_ops  (integration)
    // =========================================================================
    //
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
