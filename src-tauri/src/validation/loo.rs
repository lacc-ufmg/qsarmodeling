use ndarray::{Array1, Array2};
use crate::core::pls;

pub fn loo_rmsecv(x: &Array2<f64>, y: &Array1<f64>, n_lv: usize) -> f64 {
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
        let fit   = pls::pls1_fit(&x_tr, &y_tr, n_lv);
        let y_hat = pls::pls1_predict_row(&fit, x.row(i));
        sse += (y[i] - y_hat).powi(2);
    }

    (sse / n as f64).sqrt()
}


#[cfg(test)]
mod tests {
    use super::*;
    use ndarray::{Array1, Array2};

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
}
