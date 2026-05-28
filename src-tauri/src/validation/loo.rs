use ndarray::{Array1, Array2};
use crate::core::pls;
use crate::utils::stats;
use crate::validation::{validation_metrics, CVResult, CVConfig};

/// Compute Leave-One-Out Cross-Validation with comprehensive metrics
///
/// # Arguments
/// * `x` - Feature matrix [n_samples × n_features]
/// * `y` - Target vector [n_samples]
/// * `config` - CV configuration (n_lv_max, seed, etc.)
///
/// # Returns
/// CVResult with Q2, R2, RMSEC, RMSECV, MAE, rcal, rcv, F-stat, avgRm, deltaRm per LV
pub fn loo_cv(x: &Array2<f64>, y: &Array1<f64>, config: &CVConfig) -> CVResult {
    let n = x.nrows();
    let p = x.ncols();
    let n_lv_max = config.n_lv_max.min(n - 1);

    // Pre-allocate matrices for CV and calibration predictions
    let mut ycv = Array2::<f64>::zeros((n, n_lv_max));   // CV predictions: n × n_lv_max
    let mut ycal = Array2::<f64>::zeros((n, n_lv_max));  // Calibration predictions: n × n_lv_max

    // Pre-allocate buffers for training data (reused in each fold)
    let mut x_tr = Array2::<f64>::zeros((n - 1, p));
    let mut y_tr = Array1::<f64>::zeros(n - 1);

    // Leave-One-Out: iterate through each sample
    for i in 0..n {
        // Build training set (all except sample i)
        let mut r = 0usize;
        for j in 0..n {
            if j != i {
                x_tr.row_mut(r).assign(&x.row(j));
                y_tr[r] = y[j];
                r += 1;
            }
        }

        // Fit PLS on training set for all LV values up to n_lv_max
        for lv in 1..=n_lv_max {
            let fit = pls::pls1_fit(&x_tr, &y_tr, lv);
            // Predict held-out sample for this LV
            let y_pred_cv = pls::pls1_predict_row(&fit, x.row(i));
            ycv[[i, lv - 1]] = y_pred_cv;
        }
    }

    // Fit calibration model on full data for all LV values
    for lv in 1..=n_lv_max {
        let fit = pls::pls1_fit(&x, &y, lv);
        // Predict all training samples for this LV
        for i in 0..n {
            let y_pred_cal = pls::pls1_predict_row(&fit, x.row(i));
            ycal[[i, lv - 1]] = y_pred_cal;
        }
    }

    // Calculate metrics for each LV
    let mut q2 = Vec::with_capacity(n_lv_max);
    let mut r2 = Vec::with_capacity(n_lv_max);
    let mut rmsec = Vec::with_capacity(n_lv_max);
    let mut rmsecv = Vec::with_capacity(n_lv_max);
    let mut mae = Vec::with_capacity(n_lv_max);
    let mut rcal = Vec::with_capacity(n_lv_max);
    let mut rcv = Vec::with_capacity(n_lv_max);
    let mut f_stat = Vec::with_capacity(n_lv_max);
    let mut avg_rm = Vec::with_capacity(n_lv_max);
    let mut delta_rm = Vec::with_capacity(n_lv_max);

    let y_mean = y.iter().copied().sum::<f64>() / n as f64;
    let (y_min, y_max) = stats::min_max(y);

    for lv in 0..n_lv_max {
        let ycv_col = ycv.column(lv).to_owned();
        let ycal_col = ycal.column(lv).to_owned();
        let metrics = validation_metrics(y, &ycv_col, &ycal_col, n, lv + 1, y_mean, y_min, y_max);

        q2.push(metrics.q2);
        r2.push(metrics.r2);
        rmsec.push(metrics.rmsec);
        rmsecv.push(metrics.rmsecv);
        mae.push(metrics.mae);
        rcal.push(metrics.rcal);
        rcv.push(metrics.rcv);
        f_stat.push(metrics.f_stat);
        avg_rm.push(metrics.avg_rm);
        delta_rm.push(metrics.delta_rm);
    }

    CVResult {
        q2,
        r2,
        rmsec,
        rmsecv,
        mae,
        rcal,
        rcv,
        f_stat,
        avg_rm,
        delta_rm,
        n_lv: n_lv_max,
        method: "Leave-One-Out".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ndarray::{Array1, Array2};

    // For y = 2x (perfect linear), every LOO fold fits exactly through the
    // training points → each held-out prediction is exact → Q² = 1 and RMSECV = 0.
    #[test]
    fn loo_q2_rmsecv_zero_for_perfectly_linear_data() {
        let x = Array2::from_shape_vec(
            (6, 1),
            vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
        )
        .unwrap();
        let y = Array1::from_vec(vec![2.0, 4.0, 6.0, 8.0, 10.0, 12.0]);

        let (q2, rmsecv) = crate::validation::loo_q2_rmsecv(&x, &y, 1);
        assert!(q2 > 0.99, "Q²={q2:.2e}, expected ~1 for y=2x");
        assert!(rmsecv < 1e-9, "RMSECV={rmsecv:.2e}, expected ~0 for y=2x");
    }

    // For arbitrary data RMSECV must be non-negative and finite.
    #[test]
    fn loo_q2_rmsecv_is_finite_and_non_negative() {
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

        let (q2, rmsecv) = crate::validation::loo_q2_rmsecv(&x, &y, 1);
        assert!(q2.is_finite());
        assert!(rmsecv >= 0.0);
        assert!(rmsecv.is_finite());
    }

    // Test new comprehensive LOO_CV function
    #[test]
    fn loo_cv_perfect_linear_all_metrics() {
        let x = Array2::from_shape_vec(
            (6, 1),
            vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
        )
        .unwrap();
        let y = Array1::from_vec(vec![2.0, 4.0, 6.0, 8.0, 10.0, 12.0]);

        let config = CVConfig {
            n_lv_max: 1,
            n_folds: 6,
            enable_parallel: false,
            seed: None,
        };

        let result = loo_cv(&x, &y, &config);

        // For perfect linear data, Q² and R² should be near 1.0, RMSECV near 0
        assert_eq!(result.method, "Leave-One-Out");
        assert_eq!(result.n_lv, 1);
        assert!(result.q2[0] > 0.99, "Q² = {}", result.q2[0]);
        assert!(result.r2[0] > 0.99, "R² = {}", result.r2[0]);
        assert!(result.rmsecv[0] < 1e-8, "RMSECV = {}", result.rmsecv[0]);
        assert!(result.rmsec[0] < 1e-8, "RMSEC = {}", result.rmsec[0]);
        assert!(result.rcal[0] > 0.99, "rcal = {}", result.rcal[0]);
        assert!(result.rcv[0] > 0.99, "rcv = {}", result.rcv[0]);
        assert!(result.mae[0] < 1e-8, "MAE = {}", result.mae[0]);
    }

    // Test that all metrics are finite and in reasonable ranges
    #[test]
    fn loo_cv_metrics_finite_and_bounded() {
        let x = Array2::from_shape_vec(
            (10, 3),
            vec![
                1.0, 0.5, 0.1,
                2.0, 1.0, 0.2,
                3.0, 1.5, 0.3,
                4.0, 2.0, 0.4,
                5.0, 2.5, 0.5,
                6.0, 3.0, 0.6,
                7.0, 3.5, 0.7,
                8.0, 4.0, 0.8,
                9.0, 4.5, 0.9,
                10.0, 5.0, 1.0,
            ],
        )
        .unwrap();
        let y = Array1::from_vec(vec![1.0, 2.1, 3.2, 3.9, 5.1, 5.9, 7.1, 8.0, 9.2, 10.1]);

        let config = CVConfig {
            n_lv_max: 2,
            n_folds: 10,
            enable_parallel: false,
            seed: None,
        };

        let result = loo_cv(&x, &y, &config);

        assert_eq!(result.q2.len(), 2);
        assert_eq!(result.r2.len(), 2);
        assert_eq!(result.rmsecv.len(), 2);
        assert_eq!(result.rmsec.len(), 2);
        assert_eq!(result.mae.len(), 2);
        assert_eq!(result.rcal.len(), 2);
        assert_eq!(result.rcv.len(), 2);
        assert_eq!(result.f_stat.len(), 2);
        assert_eq!(result.avg_rm.len(), 2);
        assert_eq!(result.delta_rm.len(), 2);

        for lv in 0..2 {
            // R² should be <= 1.0 and >= -inf (but typically >= 0 for good models)
            assert!(result.r2[lv].is_finite());
            assert!(result.q2[lv].is_finite());
            assert!(result.rmsecv[lv].is_finite() && result.rmsecv[lv] >= 0.0);
            assert!(result.rmsec[lv].is_finite() && result.rmsec[lv] >= 0.0);
            assert!(result.mae[lv].is_finite() && result.mae[lv] >= 0.0);
            assert!(result.rcal[lv].is_finite());
            assert!(result.rcv[lv].is_finite());
            assert!(result.f_stat[lv].is_finite() && result.f_stat[lv] >= 0.0);
            assert!(result.avg_rm[lv].is_finite());
            assert!(result.delta_rm[lv].is_finite() && result.delta_rm[lv] >= 0.0);
        }
    }
}
