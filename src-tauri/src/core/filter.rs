use ndarray::{Array2, ArrayView1, Zip};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::loader::RawDataset;

// =============================
// Filter configuration
// =============================
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterConfig {
    pub variance_cut: f64,
    pub correlation_cut: f64,
    pub autocorrelation_cut: f64,
    pub autoscale: bool,
}

// =============================
// Column statistics (cached)
// =============================
#[derive(Debug, Clone)]
struct ColumnStats {
    pub mean: f64,
    pub var: f64,
    pub std: f64,
}

// =============================
// Filter state (core structure)
// =============================
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterState {
    pub mask: Vec<bool>,
    pub kept: Vec<usize>,
    pub dropped_by_filter: Vec<(String, usize)>,
}

impl FilterState {
    pub fn new(n_features: usize) -> Self {
        Self {
            mask: vec![true; n_features],
            kept: (0..n_features).collect(),
            dropped_by_filter: Vec::new(),
        }
    }
}

// =============================
// Pipeline object
// =============================
pub struct FilterPipeline {
    dataset: Arc<RawDataset>,
    stats: Arc<Vec<ColumnStats>>,
}

impl FilterPipeline {
    pub fn new(dataset: Arc<RawDataset>) -> Self {
        let stats = Arc::new(compute_column_stats(&dataset.x));
        Self { dataset, stats }
    }

    pub fn run(&self, config: &FilterConfig) -> FilterResult {
        let mut state = FilterState::new(self.dataset.n_features);

        let normalized = normalize_columns(&self.dataset.x, &self.stats);
        let x = normalized.view();
        let y = self.dataset.y.view();

        apply_variance_filter(&mut state, &self.stats, config.variance_cut);
        apply_correlation_filter(&mut state, x, y, config.correlation_cut);
        apply_collinearity_filter(&mut state, x, y, config.autocorrelation_cut);

        FilterResult { state }
    }
}

// =============================
// Result
// =============================
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterResult {
    pub state: FilterState,
}

// =============================
// Stats computation
// =============================
fn compute_column_stats(x: &Array2<f64>) -> Vec<ColumnStats> {
    let mut stats = Vec::with_capacity(x.ncols());

    for col in x.columns() {
        let mean = col.mean().unwrap_or(0.0);
        let var = col
            .iter()
            .map(|v| {
                let d = v - mean;
                d * d
            })
            .sum::<f64>()
            / col.len() as f64;

        let std = var.sqrt();

        stats.push(ColumnStats { mean, var, std });
    }

    stats
}

// =============================
// Normalization (autoscale)
// =============================
fn normalize_columns(x: &Array2<f64>, stats: &[ColumnStats]) -> Array2<f64> {
    let mut out = x.clone();

    for (j, mut col) in out.columns_mut().into_iter().enumerate() {
        let s = &stats[j];

        if s.std > 0.0 {
            for v in col.iter_mut() {
                *v = (*v - s.mean) / s.std;
            }
        }
    }

    out
}

// =============================
// Variance filter
// =============================
fn apply_variance_filter(state: &mut FilterState, stats: &[ColumnStats], threshold: f64) {
    let mut dropped = 0;

    for &j in &state.kept {
        if stats[j].var <= threshold {
            state.mask[j] = false;
            dropped += 1;
        }
    }

    rebuild_kept(state);
    state.dropped_by_filter.push(("variance".into(), dropped));
}

/// Feature-target correlation filter
fn apply_correlation_filter(
    state: &mut FilterState,
    x: ndarray::ArrayView2<f64>,
    y: ndarray::ArrayView1<f64>,
    threshold: f64,
) {
    let mut dropped = 0;

    for &j in &state.kept {
        let corr = fast_corr(x.column(j), y);

        if corr.abs() < threshold {
            state.mask[j] = false;
            dropped += 1;
        }
    }

    rebuild_kept(state);
    state
        .dropped_by_filter
        .push(("featureTargetCorrelation".into(), dropped));
}

// =============================
// Collinearity filter (feature-feature)
// =============================
fn apply_collinearity_filter(
    state: &mut FilterState,
    x: ndarray::ArrayView2<f64>,
    y: ArrayView1<f64>,
    threshold: f64,
) {
    let mut dropped = 0;
    let alive = state.kept.clone();

    let mut to_drop = vec![false; x.ncols()];
    let target_corrs: Vec<f64> = (0..x.ncols()).map(|j| fast_corr(x.column(j), y)).collect();

    for i in 0..alive.len() {
        let j = alive[i];

        if to_drop[j] {
            continue;
        }

        let col_j = x.column(j);

        for k_idx in (i + 1)..alive.len() {
            let k = alive[k_idx];

            if to_drop[k] {
                continue;
            }

            let col_k = x.column(k);

            let corr = fast_corr(col_j, col_k);

            if corr.abs() > threshold {
                let corr_j = target_corrs[j].abs();
                let corr_k = target_corrs[k].abs();

                if corr_j < corr_k {
                    to_drop[j] = true;
                    break;
                } else if corr_k < corr_j {
                    to_drop[k] = true;
                }
            }
        }
    }

    // Apply drops
    for &j in &alive {
        if to_drop[j] {
            state.mask[j] = false;
            dropped += 1;
        }
    }

    rebuild_kept(state);

    state
        .dropped_by_filter
        .push(("collinearity".into(), dropped));
}

fn fast_corr(a: ArrayView1<f64>, b: ArrayView1<f64>) -> f64 {
    let mean_a = a.mean().unwrap_or(0.0);
    let mean_b = b.mean().unwrap_or(0.0);

    let mut num = 0.0;
    let mut da = 0.0;
    let mut db = 0.0;

    // Zip itera sobre 'a' e 'b' de forma segura e sem bounds checking
    Zip::from(&a).and(&b).for_each(|&val_a, &val_b| {
        let xa = val_a - mean_a;
        let xb = val_b - mean_b;

        num += xa * xb;
        da += xa * xa;
        db += xb * xb;
    });

    if da == 0.0 || db == 0.0 {
        0.0
    } else {
        // Retorna o valor absoluto, que é o que os seus filtros exigem
        num / (da.sqrt() * db.sqrt())
    }
}

// =============================
// Helpers
// =============================
fn rebuild_kept(state: &mut FilterState) {
    state.kept = state
        .mask
        .iter()
        .enumerate()
        .filter_map(|(i, &k)| if k { Some(i) } else { None })
        .collect();
}

// =============================
// Final materialization
// =============================
pub fn materialize(dataset: &RawDataset, state: &FilterState) -> Array2<f64> {
    let n = dataset.n_samples;
    let m = state.kept.len();

    let mut out = Array2::<f64>::zeros((n, m));

    for (new_j, &old_j) in state.kept.iter().enumerate() {
        out.column_mut(new_j).assign(&dataset.x.column(old_j));
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use ndarray::array;
    use ndarray::{Array1, Array2};
    use std::sync::Arc;

    fn test_dataset(x: Array2<f64>, y: ndarray::Array1<f64>) -> Arc<RawDataset> {
        let n_samples = x.nrows();
        let n_features = x.ncols();

        Arc::new(RawDataset {
            x,
            y,
            n_samples,
            n_features,
            row_labels: None,
            feature_labels: None,
            sample_labels: None,
        })
    }

    #[test]
    fn variance_filter_drops_columns_at_or_below_threshold() {
        let x = array![
            [1.0, 1.0, 0.0],
            [1.0, 2.0, 1.0],
            [1.0, 3.0, 2.0],
            [1.0, 4.0, 3.0],
        ];
        let y = array![0.0, 1.0, 2.0, 3.0];
        let pipeline = FilterPipeline::new(test_dataset(x, y));

        let result = pipeline.run(&FilterConfig {
            variance_cut: 0.0,
            correlation_cut: 0.0,
            autocorrelation_cut: 1.0,
            autoscale: false,
        });

        assert_eq!(result.state.kept, vec![1, 2]);
        assert_eq!(result.state.dropped_by_filter[0], ("variance".into(), 1));
    }

    #[test]
    fn feature_target_and_collinearity_filters_use_target_correlation() {
        let x = array![
            [1.0, 1.0, 5.0],
            [2.0, 2.0, 4.0],
            [3.0, 3.1, 3.0],
            [4.0, 4.2, 2.0],
        ];
        let y = array![1.0, 2.0, 3.0, 4.0];
        let pipeline = FilterPipeline::new(test_dataset(x, y));

        let result = pipeline.run(&FilterConfig {
            variance_cut: 0.0,
            correlation_cut: 0.8,
            autocorrelation_cut: 0.99,
            autoscale: false,
        });

        assert_eq!(result.state.kept, vec![0, 2]);
        assert_eq!(result.state.dropped_by_filter[0].0, "variance");
        assert_eq!(
            result.state.dropped_by_filter[1].0,
            "featureTargetCorrelation"
        );
        assert_eq!(
            result.state.dropped_by_filter[2],
            ("collinearity".into(), 1)
        );
    }

    /// Build a minimal `RawDataset` from column slices and a target slice.
    /// `cols[j]` is the j-th feature column; `y_vals` is the target vector.
    fn dataset_from_cols(cols: &[&[f64]], y_vals: &[f64]) -> Arc<RawDataset> {
        assert!(!cols.is_empty());
        let n_samples = cols[0].len();
        let n_features = cols.len();
        assert_eq!(y_vals.len(), n_samples, "y length must equal n_samples");

        // Array2::from_shape_vec row-major: row i = [cols[0][i], cols[1][i], …]
        let flat: Vec<f64> = (0..n_samples)
            .flat_map(|i| cols.iter().map(move |c| c[i]))
            .collect();
        let x = Array2::from_shape_vec((n_samples, n_features), flat)
            .expect("shape mismatch in helper");

        Arc::new(RawDataset {
            y: Array1::from_vec(y_vals.to_vec()),
            x,
            n_samples,
            n_features,
            row_labels: None,
            feature_labels: None,
            sample_labels: None,
        })
    }

    /// Population variance of column `j` (matches `compute_column_stats`).
    fn col_var(x: &Array2<f64>, j: usize) -> f64 {
        let col = x.column(j);
        let m = col.mean().unwrap_or(0.0);
        col.iter().map(|v| (v - m).powi(2)).sum::<f64>() / col.len() as f64
    }

    fn col_mean(x: &Array2<f64>, j: usize) -> f64 {
        x.column(j).mean().unwrap_or(0.0)
    }

    const EPS: f64 = 1e-10;

    // =========================================================================
    // Normalization
    // =========================================================================

    // After normalization each non-constant column must satisfy mean≈0 and
    // population variance≈1.  Constant columns (std=0) are left unchanged.
    #[test]
    fn normalize_produces_zero_mean_unit_population_variance() {
        let ds = dataset_from_cols(
            &[
                &[2.0, 4.0, 6.0, 8.0],     // mean=5, var=5
                &[10.0, 10.0, 20.0, 20.0], // mean=15, var=25
                &[3.0, 3.0, 3.0, 3.0],     // constant – std=0, unchanged
            ],
            &[0.0, 1.0, 2.0, 3.0],
        );

        let stats = compute_column_stats(&ds.x);
        let normed = normalize_columns(&ds.x, &stats);

        for j in 0..2 {
            assert!(
                col_mean(&normed, j).abs() < EPS,
                "col {j}: expected mean≈0, got {}",
                col_mean(&normed, j)
            );
            assert!(
                (col_var(&normed, j) - 1.0).abs() < EPS,
                "col {j}: expected var≈1, got {}",
                col_var(&normed, j)
            );
        }

        // Constant column must be untouched (the std==0 guard fires)
        for v in normed.column(2) {
            assert_eq!(*v, 3.0, "constant column must not be modified");
        }
    }

    // normalize(normalize(X)) = normalize(X).
    // After the first pass every column has mean=0, std=1, so the second
    // application is a no-op: (v−0)/1 = v.
    #[test]
    fn normalize_is_idempotent() {
        let ds = dataset_from_cols(
            &[&[1.0, 3.0, 5.0, 7.0], &[2.0, 2.0, 8.0, 8.0]],
            &[0.0, 1.0, 2.0, 3.0],
        );

        let stats1 = compute_column_stats(&ds.x);
        let once = normalize_columns(&ds.x, &stats1);

        let stats2 = compute_column_stats(&once);
        let twice = normalize_columns(&once, &stats2);

        for (a, b) in once.iter().zip(twice.iter()) {
            assert!(
                (a - b).abs() < EPS,
                "second normalization should change nothing: {a} vs {b}"
            );
        }
    }

    // =========================================================================
    // Variance filter
    // =========================================================================
    //
    // Drops every column j where pop-var(j) <= threshold  (inclusive bound).
    // Stats are computed from the original, unnormalized X.

    #[test]
    fn variance_filter_drops_at_and_below_threshold() {
        // col 0: constant, var=0.00 → dropped (0.00 ≤ 0.5)
        // col 1: var=1.00           → kept   (1.00 ≤ 0.5 is false)
        // col 2: var=0.25           → dropped (0.25 ≤ 0.5)
        let ds = dataset_from_cols(
            &[
                &[5.0, 5.0, 5.0, 5.0],   // var=0.0
                &[1.0, -1.0, 1.0, -1.0], // var=1.0
                &[0.5, -0.5, 0.5, -0.5], // var=0.25
            ],
            &[0.0, 1.0, 2.0, 3.0],
        );

        let stats = compute_column_stats(&ds.x);
        let mut state = FilterState::new(ds.n_features);

        apply_variance_filter(&mut state, &stats, 0.5);

        assert_eq!(state.kept, vec![1], "only var=1 survives threshold=0.5");
        assert!(!state.mask[0]);
        assert!(state.mask[1]);
        assert!(!state.mask[2]);

        let (name, count) = &state.dropped_by_filter[0];
        assert_eq!(name, "variance");
        assert_eq!(*count, 2);
    }

    // A column whose variance equals the threshold exactly is dropped (≤, not <).
    #[test]
    fn variance_filter_threshold_is_inclusive() {
        // col 0: [1,-1,1,-1] → pop-var = 1.0
        let ds = dataset_from_cols(&[&[1.0, -1.0, 1.0, -1.0]], &[0.0, 1.0, 2.0, 3.0]);
        let stats = compute_column_stats(&ds.x);

        // threshold = 1.0 → var ≤ threshold → dropped
        let mut state_eq = FilterState::new(1);
        apply_variance_filter(&mut state_eq, &stats, 1.0);
        assert!(
            state_eq.kept.is_empty(),
            "var=threshold must be dropped (inclusive)"
        );

        // threshold = 0.999 → var > threshold → kept
        let mut state_above = FilterState::new(1);
        apply_variance_filter(&mut state_above, &stats, 0.999);
        assert_eq!(state_above.kept, vec![0], "var>threshold must be kept");
    }

    #[test]
    fn variance_filter_keeps_all_when_none_below_threshold() {
        let ds = dataset_from_cols(
            &[
                &[1.0, -1.0, 1.0, -1.0], // var=1.0
                &[2.0, -2.0, 2.0, -2.0], // var=4.0
            ],
            &[0.0, 1.0, 2.0, 3.0],
        );
        let stats = compute_column_stats(&ds.x);
        let mut state = FilterState::new(ds.n_features);

        apply_variance_filter(&mut state, &stats, 0.5);

        assert_eq!(state.kept, vec![0, 1]);
        assert_eq!(state.dropped_by_filter[0].1, 0);
    }

    // =========================================================================
    // Correlation filter  (feature–target)
    // =========================================================================
    //
    // Drops column j when |r(col_j, y)| < threshold  (strict lower bound).
    // Receives the already-normalized X view, matching the pipeline's order.
    //
    // Orthogonality proof for columns [1,2,3,4] and [1,3,3,1]:
    //   centered_a = [-1.5,-0.5,0.5,1.5], centered_b = [-1,1,1,-1]
    //   dot = 1.5 − 0.5 + 0.5 − 1.5 = 0  → r = 0  ✓

    #[test]
    fn correlation_filter_drops_uncorrelated_with_target() {
        // col 0: [1,2,3,4] – r(col0, y) = 1.0 → kept
        // col 1: [1,3,3,1] – r(col1, y) = 0.0 → dropped
        let y_vals = [1.0_f64, 2.0, 3.0, 4.0];
        let ds = dataset_from_cols(&[&[1.0, 2.0, 3.0, 4.0], &[1.0, 3.0, 3.0, 1.0]], &y_vals);

        let stats = compute_column_stats(&ds.x);
        let normed = normalize_columns(&ds.x, &stats);
        let y = Array1::from_vec(y_vals.to_vec());
        let mut state = FilterState::new(ds.n_features);

        apply_correlation_filter(&mut state, normed.view(), y.view(), 0.5);

        assert_eq!(state.kept, vec![0], "col 1 (r=0) should be dropped");

        let (name, count) = &state.dropped_by_filter[0];
        assert_eq!(name, "featureTargetCorrelation");
        assert_eq!(*count, 1);
    }

    // Absolute value: a negatively correlated column has |r|=1 and must be kept.
    #[test]
    fn correlation_filter_keeps_negatively_correlated_column() {
        // col 0: [4,3,2,1] → r(col0, y=[1,2,3,4]) = −1.0, |r|=1.0 → kept
        let y_vals = [1.0_f64, 2.0, 3.0, 4.0];
        let ds = dataset_from_cols(&[&[4.0, 3.0, 2.0, 1.0]], &y_vals);

        let stats = compute_column_stats(&ds.x);
        let normed = normalize_columns(&ds.x, &stats);
        let y = Array1::from_vec(y_vals.to_vec());
        let mut state = FilterState::new(ds.n_features);

        apply_correlation_filter(&mut state, normed.view(), y.view(), 0.5);

        assert_eq!(
            state.kept,
            vec![0],
            "negative correlation |r|=1 should be kept"
        );
    }

    // Drop condition is |r| < threshold (strict), so |r| == threshold → kept.
    #[test]
    fn correlation_filter_threshold_is_exclusive_lower_bound() {
        // threshold=0.0: |r| < 0.0 is never true → nothing dropped
        let y_vals = [1.0_f64, 2.0, 3.0, 4.0];
        let ds = dataset_from_cols(&[&[1.0, 3.0, 3.0, 1.0]], &y_vals); // r=0 with y
        let stats = compute_column_stats(&ds.x);
        let normed = normalize_columns(&ds.x, &stats);
        let y = Array1::from_vec(y_vals.to_vec());
        let mut state = FilterState::new(ds.n_features);

        apply_correlation_filter(&mut state, normed.view(), y.view(), 0.0);

        assert_eq!(state.kept, vec![0], "threshold=0 drops nothing");
    }

    // =========================================================================
    // Collinearity filter  (feature–feature, target-aware tie-break)
    // =========================================================================
    //
    // For each pair (j, k) with |r(col_j, col_k)| > threshold:
    //   – drop col with lower |r(c, y)|
    //   – if |r(j,y)| == |r(k,y)| → drop neither
    //
    // Data used:
    //   y         = [1, 2, 3, 4]
    //   col 0     = [1, 2, 3, 4]  r(col0, y) = 1.000  (y itself)
    //   col 1     = [1, 1, 2, 4]  r(col1, y) = 5/√30 ≈ 0.913
    //
    //   corr(col0, col1) = 5/√30 ≈ 0.913  (same as r(col1,y) since col0 == y)
    //
    //   col 2     = [1, 3, 3, 1]  r(col2,y)=0, corr(col0,col2)=0, corr(col1,col2)≈−0.41
    //
    // Pearson correlation is invariant to normalization, so all corrs hold
    // after the X columns are standardised.

    #[test]
    fn collinearity_filter_drops_lower_target_corr_in_pair() {
        // pair (col0, col1): |r|≈0.913 > 0.9, collinear.
        //   |r(col0,y)|=1.0 > |r(col1,y)|=0.913 → col1 dropped.
        // pair (col0, col2): |r|=0 → not collinear.
        let y_vals = [1.0_f64, 2.0, 3.0, 4.0];
        let ds = dataset_from_cols(
            &[
                &[1.0, 2.0, 3.0, 4.0],
                &[1.0, 1.0, 2.0, 4.0],
                &[1.0, 3.0, 3.0, 1.0],
            ],
            &y_vals,
        );

        let stats = compute_column_stats(&ds.x);
        let normed = normalize_columns(&ds.x, &stats);
        let y = Array1::from_vec(y_vals.to_vec());
        let mut state = FilterState::new(ds.n_features);

        apply_collinearity_filter(&mut state, normed.view(), y.view(), 0.9);

        assert_eq!(
            state.kept,
            vec![0, 2],
            "col 1 should be dropped (lower |r(c,y)|)"
        );
        assert!(state.mask[0]);
        assert!(!state.mask[1]);
        assert!(state.mask[2]);

        let (name, count) = &state.dropped_by_filter[0];
        assert_eq!(name, "collinearity");
        assert_eq!(*count, 1);
    }

    // When both columns in a collinear pair have the same |r(c,y)| the
    // algorithm has no basis for a decision and must drop neither.
    //
    //   col 0: [1,2,3,4]  r(col0,y)=  1.0, |r|=1.0
    //   col 1: [4,3,2,1]  r(col1,y)= −1.0, |r|=1.0
    //   corr(col0,col1) = −1.0 → collinear; tie → neither dropped.
    #[test]
    fn collinearity_filter_equal_target_corr_drops_neither() {
        let y_vals = [1.0_f64, 2.0, 3.0, 4.0];
        let ds = dataset_from_cols(&[&[1.0, 2.0, 3.0, 4.0], &[4.0, 3.0, 2.0, 1.0]], &y_vals);

        let stats = compute_column_stats(&ds.x);
        let normed = normalize_columns(&ds.x, &stats);
        let y = Array1::from_vec(y_vals.to_vec());
        let mut state = FilterState::new(ds.n_features);

        apply_collinearity_filter(&mut state, normed.view(), y.view(), 0.9);

        assert_eq!(
            state.kept,
            vec![0, 1],
            "tied target corrs → neither dropped"
        );
        assert_eq!(state.dropped_by_filter[0].1, 0);
    }

    #[test]
    fn collinearity_filter_keeps_all_uncorrelated_columns() {
        // corr(col0, col1) = 0 → threshold not exceeded → nothing dropped.
        let y_vals = [1.0_f64, 2.0, 3.0, 4.0];
        let ds = dataset_from_cols(&[&[1.0, 2.0, 3.0, 4.0], &[1.0, 3.0, 3.0, 1.0]], &y_vals);

        let stats = compute_column_stats(&ds.x);
        let normed = normalize_columns(&ds.x, &stats);
        let y = Array1::from_vec(y_vals.to_vec());
        let mut state = FilterState::new(ds.n_features);

        apply_collinearity_filter(&mut state, normed.view(), y.view(), 0.9);

        assert_eq!(state.kept, vec![0, 1]);
        assert_eq!(state.dropped_by_filter[0].1, 0);
    }

    // =========================================================================
    // materialize
    // =========================================================================

    #[test]
    fn materialize_extracts_kept_columns_in_order() {
        let ds = dataset_from_cols(
            &[
                &[1.0, 2.0, 3.0, 4.0],    // col 0 → new col 0
                &[5.0, 6.0, 7.0, 8.0],    // col 1 → dropped
                &[9.0, 10.0, 11.0, 12.0], // col 2 → new col 1
            ],
            &[0.0, 1.0, 2.0, 3.0],
        );

        let mut state = FilterState::new(3);
        state.mask[1] = false;
        state.kept = vec![0, 2];

        let out = materialize(&ds, &state);

        assert_eq!(out.nrows(), 4);
        assert_eq!(out.ncols(), 2);
        assert_eq!(out.column(0).to_vec(), vec![1.0, 2.0, 3.0, 4.0]);
        assert_eq!(out.column(1).to_vec(), vec![9.0, 10.0, 11.0, 12.0]);
    }

    // =========================================================================
    // Full pipeline integration
    // =========================================================================
    //
    // Four-column dataset, one column removed by each filter stage:
    //
    //   y         = [1, 2, 3, 4]
    //   col 0     = [1,2,3,4]     var=1.25  r(c,y)=1.00  not collinear  → SURVIVES
    //   col 1     = [5,5,5,5]     var=0.00  → DROPPED by variance (0.0 ≤ 0.0)
    //   col 2     = [1,3,3,1]     var=1.00  r(c,y)=0.00  → DROPPED by correlation (<0.5)
    //   col 3     = [1,1,2,4]     var=1.50  r(c,y)≈0.91  collinear with col 0 → DROPPED by collinearity
    //
    // Expected audit trail:
    //   [("variance",1), ("featureTargetCorrelation",1), ("collinearity",1)]

    #[test]
    fn pipeline_applies_all_three_filters_in_sequence() {
        let y_vals = [1.0_f64, 2.0, 3.0, 4.0];
        let ds = dataset_from_cols(
            &[
                &[1.0, 2.0, 3.0, 4.0], // col 0 – survives
                &[5.0, 5.0, 5.0, 5.0], // col 1 – killed by variance
                &[1.0, 3.0, 3.0, 1.0], // col 2 – killed by correlation
                &[1.0, 1.0, 2.0, 4.0], // col 3 – killed by collinearity
            ],
            &y_vals,
        );

        let config = FilterConfig {
            variance_cut: 0.0,        // drops var ≤ 0 (constant col 1)
            correlation_cut: 0.5,     // drops |r(c,y)| < 0.5 (col 2, r=0)
            autocorrelation_cut: 0.9, // drops collinear lower-r(c,y) (col 3)
            autoscale: false,
        };

        let result = FilterPipeline::new(ds).run(&config);
        let state = &result.state;

        assert_eq!(state.kept, vec![0], "only col 0 should survive");

        assert_eq!(state.dropped_by_filter.len(), 3);
        assert_eq!(state.dropped_by_filter[0], ("variance".into(), 1));
        assert_eq!(
            state.dropped_by_filter[1],
            ("featureTargetCorrelation".into(), 1)
        );
        assert_eq!(state.dropped_by_filter[2], ("collinearity".into(), 1));
    }
}
