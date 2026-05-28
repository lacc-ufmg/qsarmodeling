use ndarray::{Array1, Array2, s};
use crate::core::pls;
use crate::utils::stats;
use crate::validation::{validation_metrics, CVResult, CVConfig};
use rand::seq::SliceRandom;
use rand::SeedableRng;

/// Compute Leave-N-Out Cross-Validation with comprehensive metrics
///
/// # Arguments
/// * `x` - Feature matrix [n_samples × n_features]
/// * `y` - Target vector [n_samples]
/// * `n_leave_out` - Number of samples to leave out in each fold
/// * `config` - CV configuration (n_lv_max, n_repeats via n_folds, seed, etc.)
///
/// # Returns
/// CVResult with Q2, R2, RMSEC, RMSECV, MAE, rcal, rcv, F-stat, avgRm, deltaRm per LV
pub fn lno_cv(x: &Array2<f64>, y: &Array1<f64>, n_leave_out: usize, config: &CVConfig) -> CVResult {
    let n = x.nrows();
    let p = x.ncols();
    let n_lv_max = config.n_lv_max.min(n - n_leave_out);
    let n_repeats = config.n_folds; // Repurpose n_folds as n_repeats for LNO

    // Initialize RNG with optional seed
    let mut rng = match config.seed {
        Some(seed) => rand::rngs::StdRng::seed_from_u64(seed),
        None => rand::rngs::StdRng::seed_from_u64(rand::random())
    };

    // Pre-allocate matrices for aggregated CV and calibration predictions
    let mut ycv = Array2::<f64>::zeros((n, n_lv_max));
    let mut ycal = Array2::<f64>::zeros((n, n_lv_max));
    let mut fold_counts = vec![0usize; n]; // Track how many times each sample is in test set

    // Pre-allocate buffers for training data
    let mut x_tr = Array2::<f64>::zeros((n - n_leave_out, p));
    let mut y_tr = Array1::<f64>::zeros(n - n_leave_out);

    // Leave-N-Out: repeat for n_repeats iterations
    for _repeat in 0..n_repeats {
        // Create shuffled indices
        let mut indices: Vec<usize> = (0..n).collect();
        indices.shuffle(&mut rng);

        // Process non-overlapping chunks of size n_leave_out
        let num_chunks = (n + n_leave_out - 1) / n_leave_out; // ceil division

        for chunk_idx in 0..num_chunks {
            let test_start = chunk_idx * n_leave_out;
            let test_end = (test_start + n_leave_out).min(n);

            if test_start >= n {
                break;
            }

            let test_indices = &indices[test_start..test_end];
            let n_test = test_indices.len();

            // Build training set (all except test samples)
            let mut train_indices = Vec::with_capacity(n - n_test);
            for (i, idx) in indices.iter().enumerate() {
                if i < test_start || i >= test_end {
                    train_indices.push(*idx);
                }
            }

            let n_train = train_indices.len();
            if n_train == 0 {
                continue;
            }

            // Build training matrices
            for (i, &train_idx) in train_indices.iter().enumerate() {
                x_tr.row_mut(i).assign(&x.row(train_idx));
                y_tr[i] = y[train_idx];
            }

            // Fit PLS on training set for all LV values
            for lv in 1..=n_lv_max.min(n_train - 1) {
                let x_train = x_tr.slice(s![..n_train, ..]).to_owned();
                let y_train = y_tr.slice(s![..n_train]).to_owned();
                let fit = pls::pls1_fit(&x_train, &y_train, lv);

                // Predict test samples for this LV
                for &test_idx in test_indices.iter() {
                    let y_pred_cv = pls::pls1_predict_row(&fit, x.row(test_idx));
                    ycv[[test_idx, lv - 1]] += y_pred_cv;
                }
            }

            // Track fold counts
            for &test_idx in test_indices.iter() {
                fold_counts[test_idx] += 1;
            }
        }
    }

    // Average CV predictions by fold count
    for i in 0..n {
        if fold_counts[i] > 0 {
            let count = fold_counts[i] as f64;
            for lv in 0..n_lv_max {
                ycv[[i, lv]] /= count;
            }
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
        method: format!("Leave-{}-Out", n_leave_out),
    }
}



#[cfg(test)]
mod tests {
    use super::*;
    use ndarray::{Array1, Array2};

    #[test]
    fn lno_cv_all_samples_tested() {
        let x = Array2::from_shape_vec(
            (10, 2),
            vec![
                1.0, 0.5, 2.0, 1.0, 3.0, 1.5, 4.0, 2.0, 5.0, 2.5,
                6.0, 3.0, 7.0, 3.5, 8.0, 4.0, 9.0, 4.5, 10.0, 5.0,
            ],
        )
        .unwrap();
        let y = Array1::from_vec(vec![1.0, 2.1, 3.2, 3.9, 5.1, 5.9, 7.1, 8.0, 9.2, 10.1]);

        let config = CVConfig {
            n_lv_max: 1,
            n_folds: 2,
            enable_parallel: false,
            seed: Some(42),
        };

        let result = lno_cv(&x, &y, 2, &config);

        assert_eq!(result.method, "Leave-2-Out");
        assert_eq!(result.n_lv, 1);
        assert!(result.rmsecv[0].is_finite() && result.rmsecv[0] >= 0.0);
        assert!(result.q2[0].is_finite());
    }

    #[test]
    fn lno_cv_metrics_finite() {
        let x = Array2::from_shape_vec(
            (20, 3),
            (1..=60).map(|i| i as f64 / 10.0).collect(),
        )
        .unwrap();
        let y = Array1::from_vec((1..=20).map(|i| i as f64).collect());

        let config = CVConfig {
            n_lv_max: 2,
            n_folds: 3,
            enable_parallel: false,
            seed: Some(123),
        };

        let result = lno_cv(&x, &y, 5, &config);

        assert_eq!(result.q2.len(), 2);
        for lv in 0..2 {
            assert!(result.r2[lv].is_finite());
            assert!(result.q2[lv].is_finite());
            assert!(result.rmsecv[lv].is_finite() && result.rmsecv[lv] >= 0.0);
            assert!(result.rmsec[lv].is_finite() && result.rmsec[lv] >= 0.0);
            assert!(result.mae[lv].is_finite() && result.mae[lv] >= 0.0);
        }
    }
}
