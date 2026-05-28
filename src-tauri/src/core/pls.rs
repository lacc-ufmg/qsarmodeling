use ndarray::{Array1, Array2, Axis, Zip, s};
use crate::utils::mat_inv_gauss;

pub struct PlsFit {
    /// Regression vector in the centered feature space: ŷ_c = Xc · β.
    pub beta: Array1<f64>,
    /// Column means of X (used to center new samples before prediction).
    pub x_mean: Array1<f64>,
    /// Mean of y (added back after the centered prediction).
    pub y_mean: f64,
}

pub fn pls1_fit(x: &Array2<f64>, y: &Array1<f64>, n_lv: usize) -> PlsFit {
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
pub fn pls1_predict_row(fit: &PlsFit, x_row: ndarray::ArrayView1<'_, f64>) -> f64 {
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


#[cfg(test)]
mod tests {
    use super::*;
    use ndarray::{Array1, Array2};

    const EPS: f64 = 1e-9;

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
}
