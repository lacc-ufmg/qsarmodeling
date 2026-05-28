use ndarray::{Array1, Array2, s};
use crate::core::pls;
use crate::utils::stats;
use crate::validation::{validation_metrics, CVResult, CVConfig};
use rand::seq::SliceRandom;
use rand::SeedableRng;

/// Compute K-Fold Cross-Validation with comprehensive metrics
///
/// # Arguments
/// * `x` - Feature matrix [n_samples × n_features]
/// * `y` - Target vector [n_samples]
/// * `config` - CV configuration (n_lv_max, n_folds, seed, etc.)
/// * `shuffle` - Whether to shuffle data before creating folds
///
/// # Returns
/// CVResult with Q2, R2, RMSEC, RMSECV, MAE, rcal, rcv, F-stat, avgRm, deltaRm per LV
pub fn kfold_cv(x: &Array2<f64>, y: &Array1<f64>, config: &CVConfig, shuffle: bool) -> CVResult {
    let n = x.nrows();
    let p = x.ncols();
    let k = config.n_folds.max(2).min(n); // Clamp k to reasonable range
    let n_lv_max = config.n_lv_max.min(n - 1);

    // Initialize RNG with optional seed
    let mut rng = match config.seed {
        Some(seed) => rand::rngs::StdRng::seed_from_u64(seed),
        None => rand::rngs::StdRng::seed_from_u64(rand::random())
    };

    // Create fold indices
    let mut indices: Vec<usize> = (0..n).collect();
    if shuffle {
        indices.shuffle(&mut rng);
    }

    // Pre-allocate matrices for CV and calibration predictions
    let mut ycv = Array2::<f64>::zeros((n, n_lv_max));
    let mut ycal = Array2::<f64>::zeros((n, n_lv_max));

    // Pre-allocate buffers for training data
    let max_train_size = n - (n / k);
    let mut x_tr = Array2::<f64>::zeros((max_train_size, p));
    let mut y_tr = Array1::<f64>::zeros(max_train_size);

    let fold_size = n / k;
    let remainder = n % k;

    // K-Fold: iterate through each fold
    for fold_idx in 0..k {
        // Determine test set boundaries
        let test_start = fold_idx * fold_size + fold_idx.min(remainder);
        let test_size = if fold_idx < remainder {
            fold_size + 1
        } else {
            fold_size
        };
        let test_end = test_start + test_size;

        if test_start >= n {
            break;
        }

        let test_indices = &indices[test_start..test_end];
        let n_test = test_indices.len();
        let n_train = n - n_test;

        // Build training set (all except fold_idx)
        let mut train_count = 0;
        for (i, &idx) in indices.iter().enumerate() {
            if i < test_start || i >= test_end {
                x_tr.row_mut(train_count).assign(&x.row(idx));
                y_tr[train_count] = y[idx];
                train_count += 1;
            }
        }

        // Fit PLS on training set for all LV values
        for lv in 1..=n_lv_max.min(n_train - 1) {
            let x_train = x_tr.slice(s![..n_train, ..]).to_owned();
            let y_train = y_tr.slice(s![..n_train]).to_owned();
            let fit = pls::pls1_fit(&x_train, &y_train, lv);

            // Predict test samples for this LV
            for &test_idx in test_indices.iter() {
                let y_pred_cv = pls::pls1_predict_row(&fit, x.row(test_idx));
                ycv[[test_idx, lv - 1]] = y_pred_cv;
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
        method: format!("{}-Fold", k),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ndarray::{Array1, Array2};

    #[test]
    fn kfold_cv_2fold_basic() {
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

        let result = kfold_cv(&x, &y, &config, false);

        assert_eq!(result.method, "2-Fold");
        assert_eq!(result.n_lv, 1);
        assert!(result.rmsecv[0].is_finite() && result.rmsecv[0] >= 0.0);
        assert!(result.q2[0].is_finite());
    }

    #[test]
    fn kfold_cv_5fold_all_metrics() {
        let x = Array2::from_shape_vec(
            (50, 3),
            (1..=150).map(|i| i as f64 / 10.0).collect(),
        )
        .unwrap();
        let y = Array1::from_vec((1..=50).map(|i| i as f64).collect());

        let config = CVConfig {
            n_lv_max: 2,
            n_folds: 5,
            enable_parallel: false,
            seed: Some(123),
        };

        let result = kfold_cv(&x, &y, &config, true);

        assert_eq!(result.q2.len(), 2);
        assert_eq!(result.method, "5-Fold");

        for lv in 0..2 {
            assert!(result.r2[lv].is_finite());
            assert!(result.q2[lv].is_finite());
            assert!(result.rmsecv[lv].is_finite() && result.rmsecv[lv] >= 0.0);
            assert!(result.rmsec[lv].is_finite() && result.rmsec[lv] >= 0.0);
            assert!(result.mae[lv].is_finite() && result.mae[lv] >= 0.0);
            assert!(result.f_stat[lv].is_finite() && result.f_stat[lv] >= 0.0);
        }
    }
}
