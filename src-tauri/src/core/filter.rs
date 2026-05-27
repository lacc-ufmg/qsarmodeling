use ndarray::{Array2, ArrayView1};
use std::sync::Arc;
use serde::{Serialize, Deserialize};

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
    pub lj_transform: bool,
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

        // Optional autoscaling
        let normalized = if config.autoscale {
            Some(normalize_columns(&self.dataset.x, &self.stats))
        } else {
            None
        };

        let x = normalized
            .as_ref()
            .map(|a| a.view())
            .unwrap_or_else(|| self.dataset.x.view());

        // Sequential filters
        apply_variance_filter(&mut state, &self.stats, config.variance_cut);
        apply_correlation_filter(&mut state, x, config.correlation_cut);
        apply_autocorrelation_filter(&mut state, x, &self.stats, config.autocorrelation_cut);

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
fn apply_variance_filter(
    state: &mut FilterState,
    stats: &[ColumnStats],
    threshold: f64,
) {
    let mut dropped = 0;

    for &j in &state.kept {
        if stats[j].var < threshold {
            state.mask[j] = false;
            dropped += 1;
        }
    }

    rebuild_kept(state);
    state
        .dropped_by_filter
        .push(("variance".into(), dropped));
}

// =============================
// Correlation filter (greedy)
// =============================
fn apply_correlation_filter(
    state: &mut FilterState,
    x: ndarray::ArrayView2<f64>,
    threshold: f64,
) {
    let mut selected: Vec<usize> = Vec::new();
    let mut dropped = 0;

    for &j in &state.kept {
        let col_j = x.column(j);

        let mut keep = true;

        for &k in &selected {
            let col_k = x.column(k);

            let corr = fast_corr(col_j, col_k);

            if corr.abs() > threshold {
                keep = false;
                break;
            }
        }

        if keep {
            selected.push(j);
        } else {
            state.mask[j] = false;
            dropped += 1;
        }
    }

    state.kept = selected;
    state
        .dropped_by_filter
        .push(("correlation".into(), dropped));
}

// =============================
// Autocorrelation filter
// =============================
fn apply_autocorrelation_filter(
    state: &mut FilterState,
    x: ndarray::ArrayView2<f64>,
    stats: &[ColumnStats],
    threshold: f64,
) {
    let mut dropped = 0;
    let alive = state.kept.clone(); // working set

    let mut to_drop = vec![false; x.ncols()];

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
                // Drop one based on variance
                if stats[j].var >= stats[k].var {
                    to_drop[k] = true;
                } else {
                    to_drop[j] = true;
                    break; // j is gone, stop comparing it
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
        .push(("autocorrelation".into(), dropped));
}

// =============================
// Fast correlation (dot-based)
// =============================
fn fast_corr(a: ArrayView1<f64>, b: ArrayView1<f64>) -> f64 {
    let mean_a = a.mean().unwrap_or(0.0);
    let mean_b = b.mean().unwrap_or(0.0);

    let mut num = 0.0;
    let mut da = 0.0;
    let mut db = 0.0;

    for i in 0..a.len() {
        let xa = a[i] - mean_a;
        let xb = b[i] - mean_b;

        num += xa * xb;
        da += xa * xa;
        db += xb * xb;
    }

    if da == 0.0 || db == 0.0 {
        0.0
    } else {
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
pub fn materialize(
    dataset: &RawDataset,
    state: &FilterState,
) -> Array2<f64> {
    let n = dataset.n_samples;
    let m = state.kept.len();

    let mut out = Array2::<f64>::zeros((n, m));

    for (new_j, &old_j) in state.kept.iter().enumerate() {
        out.column_mut(new_j).assign(&dataset.x.column(old_j));
    }

    out
}
