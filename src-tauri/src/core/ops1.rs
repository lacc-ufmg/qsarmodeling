use ndarray::{Array1, Array2, Axis};
use std::cmp::Ordering;

#[derive(Debug, Clone)]
pub struct OpsConfig {
    pub latent_vars_ops: usize,
    pub latent_vars_model: usize,
    pub vars_percentage: f64,
    pub min_vars_model: usize,
}

/// Resultado final do OPS
#[derive(Debug, Clone)]
pub struct OpsResult {
    pub selected_indices: Vec<usize>,
    pub best_score: f64,
}

/// Trait para desacoplar o modelo (PLS, por enquanto)
pub trait RegressionModel {
    fn fit_predict(
        x: &Array2<f64>,
        y: &Array1<f64>,
        latent_vars: usize,
    ) -> (Array1<f64>, Array1<f64>);
    // retorna (y_pred, coefficients)
}

/// Função principal do OPS
pub fn run_ops<M: RegressionModel>(
    config: &OpsConfig,
    x: &Array2<f64>,
    y: &Array1<f64>,
) -> OpsResult {
    let n_vars = x.len_of(Axis(1));

    assert!(config.vars_percentage > 0.0 && config.vars_percentage <= 1.0);
    assert!(config.min_vars_model >= config.latent_vars_model);

    // ============================
    // 1. Ranking das variáveis
    // ============================
    let (_, coeffs) = M::fit_predict(x, y, config.latent_vars_ops);

    let mut var_importance: Vec<(usize, f64)> = coeffs
        .iter()
        .enumerate()
        .map(|(i, &c)| (i, c.abs()))
        .collect();

    // ordena decrescente por importância
    var_importance.sort_by(|a, b| {
        b.1.partial_cmp(&a.1).unwrap_or(Ordering::Equal)
    });

    let ordered_indices: Vec<usize> =
        var_importance.iter().map(|(i, _)| *i).collect();

    // ============================
    // 2. Loop incremental OPS
    // ============================
    let step = ((config.vars_percentage * n_vars as f64).ceil() as usize)
        .max(1);

    let mut best_score = f64::NEG_INFINITY;
    let mut best_subset = Vec::new();

    let mut current_size = config.min_vars_model;

    while current_size <= n_vars {
        let subset_indices = &ordered_indices[..current_size];

        let x_subset = select_columns(x, subset_indices);

        let (y_pred, _) =
            M::fit_predict(&x_subset, y, config.latent_vars_model);

        let score = r2_score(y, &y_pred);

        if score > best_score {
            best_score = score;
            best_subset = subset_indices.to_vec();
        }

        current_size += step;
    }

    OpsResult {
        selected_indices: best_subset,
        best_score,
    }
}

/// Seleciona colunas específicas (mantendo column-major logicamente consistente)
fn select_columns(x: &Array2<f64>, indices: &[usize]) -> Array2<f64> {
    let mut selected =
        Array2::<f64>::zeros((x.nrows(), indices.len()));

    for (new_j, &old_j) in indices.iter().enumerate() {
        let col = x.index_axis(Axis(1), old_j);
        selected
            .index_axis_mut(Axis(1), new_j)
            .assign(&col);
    }

    selected
}

/// R² clássico
fn r2_score(y_true: &Array1<f64>, y_pred: &Array1<f64>) -> f64 {
    let mean = y_true.mean().unwrap();

    let ss_tot: f64 = y_true.iter().map(|v| (v - mean).powi(2)).sum();
    let ss_res: f64 = y_true
        .iter()
        .zip(y_pred.iter())
        .map(|(yt, yp)| (yt - yp).powi(2))
        .sum();

    1.0 - (ss_res / ss_tot)
}
