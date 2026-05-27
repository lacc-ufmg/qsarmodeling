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
