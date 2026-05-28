use ndarray::{Array1};


#[inline]
pub fn min_max(y: &Array1<f64>) -> (f64, f64) {
    let mut min = f64::INFINITY;
    let mut max = f64::NEG_INFINITY;

    for &v in y {
        if v < min { min = v; }
        if v > max { max = v; }
    }

    (min, max)
}

/// Compute scaled rm² metrics (no allocation version)
#[inline]
pub fn rm2_metrics(y: &Array1<f64>, yhat: &Array1<f64>, min: f64, max: f64) -> (f64, f64) {
    let range = max - min;
    if range == 0.0 {
        return (0.0, 0.0);
    }

    let mut sum_y_yhat = 0.0;
    let mut sum_yhat2 = 0.0;
    let mut sum_y2 = 0.0;

    let n = y.len() as f64;

    // First pass: scaled + correlation terms
    for (&yr, &yp) in y.iter().zip(yhat.iter()) {
        let sy = (yr - min) / range;
        let sp = (yp - min) / range;

        sum_y_yhat += sy * sp;
        sum_yhat2 += sp * sp;
        sum_y2 += sy * sy;
    }

    let k = if sum_yhat2 != 0.0 { sum_y_yhat / sum_yhat2 } else { 0.0 };
    let k1 = if sum_y2 != 0.0 { sum_y_yhat / sum_y2 } else { 0.0 };

    // Second pass: R² variants
    let mut ss_res_0 = 0.0;
    let mut ss_tot_y = 0.0;

    let mut ss_res_1 = 0.0;
    let mut ss_tot_yhat = 0.0;

    let mean_y = y.iter().copied().sum::<f64>() / n;
    let mean_yhat = yhat.iter().copied().sum::<f64>() / n;

    for (&yr, &yp) in y.iter().zip(yhat.iter()) {
        let sy = (yr - min) / range;
        let sp = (yp - min) / range;

        let yr0 = k * sp;
        let y1r0 = k1 * sy;

        let dy = sy - yr0;
        ss_res_0 += dy * dy;

        let dy_mean = sy - mean_y;
        ss_tot_y += dy_mean * dy_mean;

        let dp = sp - y1r0;
        ss_res_1 += dp * dp;

        let dp_mean = sp - mean_yhat;
        ss_tot_yhat += dp_mean * dp_mean;
    }

    let r02 = if ss_tot_y != 0.0 { 1.0 - ss_res_0 / ss_tot_y } else { 0.0 };
    let r102 = if ss_tot_yhat != 0.0 { 1.0 - ss_res_1 / ss_tot_yhat } else { 0.0 };

    let r = pearson_r(y, yhat);
    let r2 = r * r;

    let rm2 = r2 * (1.0 - (r2 - r02).abs().sqrt());
    let rm12 = r2 * (1.0 - (r2 - r102).abs().sqrt());

    let avg = (rm2 + rm12) * 0.5;
    let delta = (rm2 - rm12).abs();

    (avg, delta)
}

/// Total Sum of Squares (SSY)
#[inline]
pub fn ssy(y: &Array1<f64>, mean_y: Option<f64>) -> f64 {
    let mean = mean_y.unwrap_or_else(|| {
        let sum: f64 = y.iter().copied().sum();
        sum / y.len() as f64
    });

    y.iter()
        .map(|&yi| {
            let d = yi - mean;
            d * d
        })
        .sum()
}

/// PRESS = Σ (y_real - y_pred)^2
#[inline]
pub fn press(yreal: &Array1<f64>, ypred: &Array1<f64>) -> f64 {
    debug_assert_eq!(yreal.len(), ypred.len());

    yreal.iter()
        .zip(ypred.iter())
        .map(|(&yr, &yp)| {
            let d = yr - yp;
            d * d
        })
        .sum()
}

/// R² = 1 - PRESS / SSY
#[inline]
pub fn r2(yreal: &Array1<f64>, ypred: &Array1<f64>, mean_y: Option<f64>) -> f64 {
    let ssy_val = ssy(yreal, mean_y);
    if ssy_val == 0.0 {
        return 0.0; // or NaN depending on your convention
    }

    1.0 - (press(yreal, ypred) / ssy_val)
}

/// MAE = mean(|y_real - y_pred|)
#[inline]
pub fn mae(yreal: &Array1<f64>, ypred: &Array1<f64>) -> f64 {
    debug_assert_eq!(yreal.len(), ypred.len());

    let n = yreal.len() as f64;

    yreal.iter()
        .zip(ypred.iter())
        .map(|(&yr, &yp)| (yr - yp).abs())
        .sum::<f64>()
        / n
}

/// RMSE = sqrt(PRESS / n)
#[inline]
pub fn rmse(yreal: &Array1<f64>, ypred: &Array1<f64>) -> f64 {
    let n = yreal.len() as f64;
    (press(yreal, ypred) / n).sqrt()
}

/// Pearson correlation coefficient (R)
#[inline]
pub fn pearson_r(yreal: &Array1<f64>, ypred: &Array1<f64>) -> f64 {
    debug_assert_eq!(yreal.len(), ypred.len());

    let n = yreal.len() as f64;

    // Means
    let mean_y = yreal.iter().copied().sum::<f64>() / n;
    let mean_p = ypred.iter().copied().sum::<f64>() / n;

    // Compute covariance and variances in one pass
    let mut cov = 0.0;
    let mut var_y = 0.0;
    let mut var_p = 0.0;

    for (&yr, &yp) in yreal.iter().zip(ypred.iter()) {
        let dy = yr - mean_y;
        let dp = yp - mean_p;

        cov += dy * dp;
        var_y += dy * dy;
        var_p += dp * dp;
    }

    if var_y == 0.0 || var_p == 0.0 {
        return 0.0; // or NaN
    }

    cov / (var_y.sqrt() * var_p.sqrt())
}

/// F-statistic for regression: F = (n - nLV - 1) * R² / (nLV * (1 - R²))
#[inline]
pub fn f_stat(r2: f64, n: usize, n_lv: usize) -> f64 {
    if n_lv == 0 || n <= n_lv + 1 || r2 >= 1.0 {
        return 0.0;
    }
    let numerator = (n as f64 - n_lv as f64 - 1.0) * r2;
    let denominator = n_lv as f64 * (1.0 - r2);
    if denominator == 0.0 {
        0.0
    } else {
        numerator / denominator
    }
}

/// Simple Ordinary Least Squares (OLS) linear regression: y ~ a + b*x
/// Returns (intercept, slope)
///
/// # Arguments
/// * `x` - Predictor variable
/// * `y` - Response variable
///
/// # Returns
/// (intercept, slope) tuple
#[inline]
pub fn linear_regression(x: &Array1<f64>, y: &Array1<f64>) -> (f64, f64) {
    debug_assert_eq!(x.len(), y.len());

    let n = x.len() as f64;
    let mean_x = x.iter().copied().sum::<f64>() / n;
    let mean_y = y.iter().copied().sum::<f64>() / n;

    let mut ss_xy = 0.0; // covariance
    let mut ss_xx = 0.0; // variance of x

    for (&xi, &yi) in x.iter().zip(y.iter()) {
        let dx = xi - mean_x;
        let dy = yi - mean_y;
        ss_xy += dx * dy;
        ss_xx += dx * dx;
    }

    if ss_xx == 0.0 {
        // No variance in x → undefined slope
        return (mean_y, 0.0);
    }

    let slope = ss_xy / ss_xx;
    let intercept = mean_y - slope * mean_x;

    (intercept, slope)
}
