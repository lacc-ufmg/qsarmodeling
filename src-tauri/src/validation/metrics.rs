use crate::core::pls;
use crate::utils::stats;
use ndarray::Array1;
use ndarray::Array2;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub(crate) struct ValidationMetrics {
    pub q2: f64,
    pub r2: f64,
    pub rmsec: f64,
    pub rmsecv: f64,
    pub mae: f64,
    pub rcal: f64,
    pub rcv: f64,
    pub f_stat: f64,
    pub avg_rm: f64,
    pub delta_rm: f64,
}

#[inline]
pub(crate) fn validation_metrics(
    y: &Array1<f64>,
    ycv: &Array1<f64>,
    ycal: &Array1<f64>,
    n: usize,
    lv_idx: usize,
    y_mean: f64,
    y_min: f64,
    y_max: f64,
) -> ValidationMetrics {
    let (q2, rmsecv) = prediction_metrics(y, ycv, Some(y_mean));
    let (r2, rmsec) = prediction_metrics(y, ycal, Some(y_mean));
    let mae = stats::mae(y, ycal);
    let rcal = stats::pearson_r(y, ycal);
    let rcv = stats::pearson_r(y, ycv);
    let f_stat = stats::f_stat(r2, n, lv_idx);
    let (avg_rm, delta_rm) = stats::rm2_metrics(y, ycal, y_min, y_max);

    ValidationMetrics {
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
    }
}

#[inline]
pub(crate) fn prediction_metrics(
    yreal: &Array1<f64>,
    ypred: &Array1<f64>,
    mean_y: Option<f64>,
) -> (f64, f64) {
    let ssy_val = stats::ssy(yreal, mean_y);
    if ssy_val == 0.0 {
        return (0.0, 0.0);
    }

    let press = stats::press(yreal, ypred);
    let q2 = 1.0 - (press / ssy_val);
    let rmse = (press / yreal.len() as f64).sqrt();

    (q2, rmse)
}

#[inline]
pub fn loo_q2_rmsecv(x: &Array2<f64>, y: &Array1<f64>, n_lv: usize) -> (f64, f64) {
    let n = x.nrows();
    let p = x.ncols();

    let mut x_tr = Array2::<f64>::zeros((n - 1, p));
    let mut y_tr = Array1::<f64>::zeros(n - 1);
    let mut press = 0.0_f64;

    for i in 0..n {
        let mut r = 0usize;
        for j in 0..n {
            if j != i {
                x_tr.row_mut(r).assign(&x.row(j));
                y_tr[r] = y[j];
                r += 1;
            }
        }

        let fit = pls::pls1_fit(&x_tr, &y_tr, n_lv);
        let y_hat = pls::pls1_predict_row(&fit, x.row(i));
        let err = y[i] - y_hat;
        press += err * err;
    }

    let ssy = stats::ssy(y, None);
    if ssy == 0.0 {
        return (0.0, 0.0);
    }

    let q2 = 1.0 - (press / ssy);
    let rmsecv = (press / n as f64).sqrt();

    (q2, rmsecv)
}
