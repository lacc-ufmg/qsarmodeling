use ndarray::{Array1, Array2};
use serde::{Deserialize, Serialize};
use crate::utils::stats::*;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Stats {
    pub press: f64,
    pub r2: f64,
    pub rmsec: f64,
    pub rcal: f64,
    pub avg_rmcal: f64,
    pub delta_rmcal: f64,
    pub press_cv: f64,
    pub q2: f64,
    pub rmsecv: f64,
    pub rcv: f64,
    pub avg_rmcv: f64,
    pub delta_rmcv: f64,
    pub f_value: f64,
    pub nlv: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MultiStats {
    pub press_cal: Vec<f64>,
    pub r2_cal: Vec<f64>,
    pub rmsec: Vec<f64>,
    pub rcal: Vec<f64>,

    pub press_cv: Vec<f64>,
    pub q2: Vec<f64>,
    pub rmsecv: Vec<f64>,
    pub rcv: Vec<f64>,
}

pub fn calc_stats(
    y: &Array1<f64>,
    ycal: &Array2<f64>,
    ycv: &Array2<f64>,
    nlv: Option<usize>,
) -> Stats {
    let n = y.len();
    let nlv_max = ycal.ncols();

    // Select optimal LV (based on Q²)
    let selected_lv = if let Some(lv) = nlv {
        lv
    } else {
        let mut best_lv = 0;
        let mut best_q2 = f64::NEG_INFINITY;

        for i in 0..nlv_max {
            let col = ycv.column(i).to_owned();
            let q2 = r2(y, &col, None);
            if q2 > best_q2 {
                best_q2 = q2;
                best_lv = i;
            }
        }

        best_lv + 1
    };

    let idx = selected_lv - 1;

    let ycal_lv = ycal.column(idx).to_owned();
    let ycv_lv = ycv.column(idx).to_owned();

    // Core metrics (calibration)
    let press_cal = press(y, &ycal_lv);
    let r2_cal = r2(y, &ycal_lv, None);
    let rmsec = rmse(y, &ycal_lv);
    let rcal = pearson_r(y, &ycal_lv);

    // Core metrics (CV)
    let press_cv = press(y, &ycv_lv);
    let q2 = r2(y, &ycv_lv, None);
    let rmsecv = rmse(y, &ycv_lv);
    let rcv = pearson_r(y, &ycv_lv);

    // Scaling bounds (computed once)
    let (min_y, max_y) = min_max(y);

    // rm² metrics
    let (avg_rmcal, delta_rmcal) = rm2_metrics(y, &ycal_lv, min_y, max_y);
    let (avg_rmcv, delta_rmcv) = rm2_metrics(y, &ycv_lv, min_y, max_y);

    // F-statistic
    let f_value = if r2_cal < 1.0 && selected_lv > 0 {
        ((n - selected_lv - 1) as f64 * r2_cal)
            / (selected_lv as f64 * (1.0 - r2_cal))
    } else {
        0.0
    };

    Stats {
        press: press_cal,
        r2: r2_cal,
        rmsec,
        rcal,
        avg_rmcal,
        delta_rmcal,
        press_cv,
        q2,
        rmsecv,
        rcv,
        avg_rmcv,
        delta_rmcv,
        f_value,
        nlv: selected_lv,
    }
}

pub fn compute_all_lv_stats(
    y: &Array1<f64>,
    ycal: &Array2<f64>,
    ycv: &Array2<f64>,
) -> MultiStats {
    let n = y.len();
    let k = ycal.ncols();

    let mean_y = y.iter().sum::<f64>() / n as f64;
    let ssy_val = ssy(y, Some(mean_y));

    // Allocate outputs
    let mut press_cal = vec![0.0; k];
    let mut press_cv = vec![0.0; k];

    let mut sum_ycal = vec![0.0; k];
    let mut sum_ycv = vec![0.0; k];

    let mut sum_ycal2 = vec![0.0; k];
    let mut sum_ycv2 = vec![0.0; k];

    let mut cov_cal = vec![0.0; k];
    let mut cov_cv = vec![0.0; k];

    let mut var_y = 0.0;

    // -------- SINGLE PASS --------
    for i in 0..n {
        let yi = y[i];
        let dy = yi - mean_y;
        var_y += dy * dy;

        for j in 0..k {
            let yc = ycal[[i, j]];
            let yv = ycv[[i, j]];

            let dc = yi - yc;
            let dv = yi - yv;

            press_cal[j] += dc * dc;
            press_cv[j] += dv * dv;

            sum_ycal[j] += yc;
            sum_ycv[j] += yv;

            sum_ycal2[j] += yc * yc;
            sum_ycv2[j] += yv * yv;

            cov_cal[j] += dy * (yc);
            cov_cv[j] += dy * (yv);
        }
    }

    // -------- FINALIZE --------
    let mut r2_cal = vec![0.0; k];
    let mut q2 = vec![0.0; k];
    let mut rmsec = vec![0.0; k];
    let mut rmsecv = vec![0.0; k];
    let mut rcal = vec![0.0; k];
    let mut rcv = vec![0.0; k];

    for j in 0..k {
        let mean_ycal = sum_ycal[j] / n as f64;
        let mean_ycv = sum_ycv[j] / n as f64;

        let mut var_cal = 0.0;
        let mut var_cv = 0.0;

        // recompute variance cheaply
        for i in 0..n {
            let yc = ycal[[i, j]] - mean_ycal;
            let yv = ycv[[i, j]] - mean_ycv;
            var_cal += yc * yc;
            var_cv += yv * yv;
        }

        r2_cal[j] = 1.0 - press_cal[j] / ssy_val;
        q2[j] = 1.0 - press_cv[j] / ssy_val;

        rmsec[j] = (press_cal[j] / n as f64).sqrt();
        rmsecv[j] = (press_cv[j] / n as f64).sqrt();

        rcal[j] = if var_y > 0.0 && var_cal > 0.0 {
            cov_cal[j] / (var_y.sqrt() * var_cal.sqrt())
        } else {
            0.0
        };

        rcv[j] = if var_y > 0.0 && var_cv > 0.0 {
            cov_cv[j] / (var_y.sqrt() * var_cv.sqrt())
        } else {
            0.0
        };
    }

    MultiStats {
        press_cal,
        r2_cal,
        rmsec,
        rcal,
        press_cv,
        q2,
        rmsecv,
        rcv,
    }
}
