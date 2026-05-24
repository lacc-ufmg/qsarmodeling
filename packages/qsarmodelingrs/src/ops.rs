use polars::prelude::*;
use crate::error::{QsarError, Result};
use crate::types::{SelectionSettings, SelectionResult};

fn dataframe_to_matrix_rows(frame: &DataFrame) -> Result<Vec<Vec<f64>>> {
    let height = frame.height();
    let mut rows: Vec<Vec<f64>> = vec![Vec::with_capacity(frame.width()); height];
    for col in frame.columns() {
        let series = col;
        let casted = series.cast(&DataType::Float64)?;
        let chunked = casted.f64()?;
        for (i, v) in chunked.into_no_null_iter().enumerate() {
            rows[i].push(v);
        }
    }
    Ok(rows)
}

fn autoscale_rows(rows: &mut [Vec<f64>]) {
    let n = rows.len();
    if n == 0 { return; }
    let m = rows[0].len();
    // compute means and stds for each column
    let mut means = vec![0.0; m];
    let mut stds = vec![0.0; m];
    for j in 0..m {
        let mut sum = 0.0;
        for i in 0..n { sum += rows[i][j]; }
        means[j] = sum / n as f64;
        let mut ss = 0.0;
        for i in 0..n { let d = rows[i][j] - means[j]; ss += d*d; }
        stds[j] = (ss / (n as f64 - 1.0)).sqrt();
        if stds[j] == 0.0 { stds[j] = 1.0; }
    }
    for i in 0..n {
        for j in 0..m {
            rows[i][j] = (rows[i][j] - means[j]) / stds[j];
        }
    }
}

fn vec_dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b.iter()).map(|(x,y)| x*y).sum()
}

fn cross_validation_q2(rows: &[Vec<f64>], y: &[f64], nlv_model: usize, n_splits: usize) -> Vec<f64> {
    let n = rows.len();
    let mut q2s = vec![0.0; nlv_model];
    if n < 2 { return q2s; }
    let k = std::cmp::min(n_splits, n);
    let fold_size = n / k;
    // simple contiguous folds
    for lv in 1..=nlv_model {
        let mut press = 0.0;
        let mut tss = 0.0;
        let y_mean: f64 = y.iter().sum::<f64>() / n as f64;
        for i in 0..n { let d = y[i] - y_mean; tss += d*d; }
        for fold in 0..k {
            let start = fold * fold_size;
            let end = if fold == k-1 { n } else { start + fold_size };
            let mut X_train: Vec<Vec<f64>> = Vec::new();
            let mut y_train: Vec<f64> = Vec::new();
            let mut X_test: Vec<Vec<f64>> = Vec::new();
            let mut y_test: Vec<f64> = Vec::new();
            for idx in 0..n {
                if idx >= start && idx < end {
                    X_test.push(rows[idx].clone());
                    y_test.push(y[idx]);
                } else {
                    X_train.push(rows[idx].clone());
                    y_train.push(y[idx]);
                }
            }
            // naive linear model: compute weights as column-wise dot with y_train
            let m = X_train[0].len();
            let mut weights = vec![0.0; m];
            for j in 0..m {
                let col: Vec<f64> = X_train.iter().map(|r| r[j]).collect();
                weights[j] = vec_dot(&col, &y_train);
            }
            // predict
            for (xr, &yt) in X_test.iter().zip(y_test.iter()) {
                let ypred = vec_dot(xr, &weights);
                let diff = yt - ypred;
                press += diff*diff;
            }
        }
        q2s[lv-1] = if tss == 0.0 { 0.0 } else { 1.0 - press / tss };
    }
    q2s
}

pub fn run_ops(frame: &DataFrame, y: &[f64], settings: SelectionSettings) -> Result<SelectionResult> {
    let rows = dataframe_to_matrix_rows(frame)?; // n_samples x n_features
    let mut X = rows.clone();
    let y_vec = y.to_vec();
    // autoscale
    autoscale_rows(&mut X);
    let n = X[0].len();
    let m = X.len();

    let nlv = settings.latent_vars_ops;
    let nlv_model = settings.latent_vars_model;
    let window = std::cmp::max(2, settings.min_vars_model);
    let increment = 1usize;
    let max_var = std::cmp::max(1, (settings.vars_percentage * n) / 100);
    let nmodels = 100usize;

    // compute correlogram: absolute correlation between each variable and y
    let mut correlogram = vec![0.0f64; n];
    for j in 0..n {
        let col: Vec<f64> = X.iter().map(|r| r[j]).collect();
        correlogram[j] = vec_dot(&col, &y_vec).abs();
    }

    // build vec matrix with nVec = 2*nlv + 1 columns
    let nvec = 2*nlv + 1;
    let mut vecs: Vec<Vec<f64>> = Vec::with_capacity(nvec);
    vecs.push(correlogram.clone());
    for i in 1..=2*nlv {
        // create product with correlogram and a simple transform
        let mut col = vec![0.0f64; n];
        for j in 0..n {
            col[j] = correlogram[j] * (1.0 + (i as f64) * 0.01);
        }
        vecs.push(col);
    }

    let mut models_q2: Vec<f64> = Vec::new();
    let mut models_varsel: Vec<Vec<usize>> = Vec::new();

    for v in vecs.iter() {
        // sort indices by descending
        let mut indices: Vec<usize> = (0..n).collect();
        indices.sort_by(|&a, &b| v[b].partial_cmp(&v[a]).unwrap_or(std::cmp::Ordering::Equal));
        let mut nvar = window;
        while nvar <= max_var {
            // build Xev: rows x nvar using first nvar indices
            let mut Xev: Vec<Vec<f64>> = Vec::with_capacity(m);
            for i in 0..m {
                let mut row = Vec::with_capacity(nvar);
                for k in 0..nvar { row.push(X[i][indices[k]]); }
                Xev.push(row);
            }
            // cross-validate and compute Q2 using nlv_model
            let q2s = cross_validation_q2(&Xev, &y_vec, nlv_model, 5);
            let best_q2 = q2s.into_iter().fold( std::f64::NEG_INFINITY, f64::max);
            models_q2.push(best_q2);
            models_varsel.push(indices[0..nvar].iter().map(|&idx| idx).collect());
            nvar += increment;
        }
        // after processing vector, keep only top nmodels later
    }

    // sort models by q2 desc
    let mut order: Vec<usize> = (0..models_q2.len()).collect();
    order.sort_by(|&a,&b| models_q2[b].partial_cmp(&models_q2[a]).unwrap_or(std::cmp::Ordering::Equal));
    let top = std::cmp::min(nmodels, models_q2.len());
    let mut sorted_q2 = Vec::with_capacity(top);
    let mut sorted_vars = Vec::with_capacity(top);
    for i in 0..top {
        sorted_q2.push(models_q2[order[i]]);
        sorted_vars.push(models_varsel[order[i]].clone());
    }

    if sorted_q2.is_empty() {
        return Err(QsarError::InvalidDataset("No OPS models found".to_string()));
    }

    let best_vars = &sorted_vars[0];
    let best_q2 = sorted_q2[0];

    Ok(SelectionResult {
        session_id: String::new(),
        method: "ops".to_string(),
        selected_descriptors: best_vars.len(),
        latent_variables: nlv_model,
        q2: best_q2,
        r2: 0.0,
        validation_passed: false,
    })
}
