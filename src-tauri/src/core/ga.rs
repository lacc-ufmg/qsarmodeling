use std::sync::Arc;

use genetic_algorithm::strategy::evolve::prelude::*;
use ndarray::{Array1, Array2};

/// Configuration for GA-based variable selection.
///
/// The GA maximizes a penalized cross-validated score:
///     penalized_score = q2_cv - size_penalty * (n_selected / n_features)
///
/// The raw score is the k-fold CV Q² (higher is better).
#[derive(Clone, Debug)]
pub struct GAConfig {
    /// Number of chromosomes in the population.
    pub population_size: usize,

    /// Maximum number of generations.
    pub max_generations: usize,

    /// Stop after this many generations without improvement.
    pub max_stale_generations: usize,

    /// Optional early stop once the penalized fitness reaches this target.
    /// Interpreted in *raw score units* (e.g. 0.95), then scaled internally.
    pub target_fitness_score: Option<f64>,

    /// Selection pressure for `SelectTournament`.
    /// Typical: 0.3..0.7
    pub replacement_rate: f32,

    /// Fraction preserved as elite.
    /// Typical: 0.01..0.05
    pub elitism_rate: f32,

    /// Tournament size.
    pub tournament_size: usize,

    /// Fraction of parents selected for reproduction in crossover.
    /// Typical: 0.5..0.8
    pub crossover_selection_rate: f32,

    /// Probability that a selected pair actually crosses over.
    /// Typical: 0.5..0.9
    pub crossover_rate: f32,

    /// Probability of mutating a chromosome.
    /// Typical for binary genomes: 0.05..0.3
    pub mutation_probability: f32,

    /// Number of CV folds.
    pub cv_folds: usize,

    /// Ridge regularization used when fitting the fold-wise linear model.
    /// Small positive values help with collinearity.
    pub ridge_lambda: f64,

    /// Minimum number of selected variables allowed.
    pub min_features: usize,

    /// Maximum number of selected variables allowed.
    /// If `None`, no explicit upper bound is enforced.
    pub max_features: Option<usize>,

    /// Penalty applied to larger subsets.
    /// The score is reduced by:
    ///     size_penalty * (n_selected / n_features)
    pub size_penalty: f64,

    /// Precision used to convert the floating-point fitness to `FitnessValue` (`isize`).
    /// Smaller values => larger integer scale.
    pub fitness_precision: f64,

    /// Seed for deterministic runs.
    pub seed: Option<u64>,

    /// Enable parallel fitness evaluation.
    pub par_fitness: bool,
}

impl Default for GAConfig {
    fn default() -> Self {
        Self {
            population_size: 200,
            max_generations: 500,
            max_stale_generations: 100,
            target_fitness_score: None,
            replacement_rate: 0.5,
            elitism_rate: 0.02,
            tournament_size: 4,
            crossover_selection_rate: 0.7,
            crossover_rate: 0.8,
            mutation_probability: 0.2,
            cv_folds: 5,
            ridge_lambda: 1e-8,
            min_features: 1,
            max_features: None,
            size_penalty: 0.02,
            fitness_precision: 1e-6,
            seed: None,
            par_fitness: true,
        }
    }
}

/// Result of the GA variable selection.
#[derive(Clone, Debug)]
pub struct GAResult {
    /// Best binary mask found by the GA.
    pub best_mask: Vec<bool>,

    /// Indices of selected variables.
    pub selected_indices: Vec<usize>,

    /// Convenience count of selected variables.
    pub selected_count: usize,

    /// Raw cross-validated Q² score before subset-size penalty.
    pub raw_cv_score: f64,

    /// Penalized score used by the fitness function.
    pub penalized_score: f64,

    /// Integer fitness value seen by the GA.
    pub fitness_score: isize,

    /// Best generation reported by the GA.
    pub best_generation: Option<usize>,

    /// Whether the GA found at least one valid solution.
    pub found_solution: bool,
}

#[derive(Clone, Debug)]
struct VariableSelectionFitness {
    x: Arc<Array2<f64>>,
    y: Arc<Array1<f64>>,
    config: GAConfig,
}

impl Fitness for VariableSelectionFitness {
    type Genotype = BinaryGenotype;

    fn calculate_for_chromosome(
        &mut self,
        chromosome: &FitnessChromosome<Self>,
        _genotype: &FitnessGenotype<Self>,
    ) -> Option<FitnessValue> {
        let selected = mask_to_indices(&chromosome.genes);

        if selected.len() < self.config.min_features {
            return None;
        }
        if let Some(max_features) = self.config.max_features {
            if selected.len() > max_features {
                return None;
            }
        }

        let (_raw_cv_score, penalized_score) =
            subset_score(self.x.as_ref(), self.y.as_ref(), &selected, &self.config)?;

        if !penalized_score.is_finite() {
            return None;
        }

        let scaled = (penalized_score / self.config.fitness_precision).round();
        if !scaled.is_finite() {
            return None;
        }

        Some(scaled as FitnessValue)
    }
}

/// Run GA-based variable selection over the descriptor matrix `x` and response `y`.
///
/// Each gene is a binary include/exclude flag for one column of `x`.
pub fn run_ga(x: Array2<f64>, y: Array1<f64>, config: GAConfig) -> GAResult {
    assert_eq!(
        x.nrows(),
        y.len(),
        "x and y must have the same number of rows"
    );
    assert!(x.ncols() > 0, "x must have at least one descriptor");
    assert!(x.nrows() > 1, "x must have at least two samples");
    assert!(config.population_size > 0, "population_size must be > 0");
    assert!(config.max_generations > 0, "max_generations must be > 0");
    assert!(
        config.max_stale_generations > 0,
        "max_stale_generations must be > 0"
    );
    assert!(config.cv_folds >= 2, "cv_folds must be >= 2");
    assert!(config.ridge_lambda >= 0.0, "ridge_lambda must be >= 0");
    assert!(config.min_features >= 1, "min_features must be >= 1");
    assert!(
        config.fitness_precision > 0.0,
        "fitness_precision must be > 0"
    );

    let n_features = x.ncols();

    if let Some(max_features) = config.max_features {
        assert!(
            max_features >= config.min_features,
            "max_features must be >= min_features"
        );
        assert!(
            max_features <= n_features,
            "max_features cannot exceed the number of descriptors"
        );
    }

    let x = Arc::new(x);
    let y = Arc::new(y);

    let fitness = VariableSelectionFitness {
        x: Arc::clone(&x),
        y: Arc::clone(&y),
        config: config.clone(),
    };

    let genotype = BinaryGenotype::builder()
        .with_genes_size(n_features)
        .with_genes_hashing(true)
        .with_chromosome_recycling(true)
        .build()
        .expect("failed to build BinaryGenotype");

    let mut builder = Evolve::builder()
        .with_genotype(genotype)
        .with_target_population_size(config.population_size)
        .with_select(SelectTournament::new(
            config.replacement_rate,
            config.elitism_rate,
            config.tournament_size,
        ))
        .with_crossover(CrossoverUniform::new(
            config.crossover_selection_rate,
            config.crossover_rate,
        ))
        .with_mutate(MutateSingleGene::new(config.mutation_probability))
        .with_fitness(fitness)
        .with_fitness_ordering(FitnessOrdering::Maximize)
        .with_max_generations(config.max_generations)
        .with_max_stale_generations(config.max_stale_generations)
        .with_replace_on_equal_fitness(true);

    if let Some(seed) = config.seed {
        builder = builder.with_rng_seed_from_u64(seed);
    }

    if let Some(target_raw) = config.target_fitness_score {
        let target_scaled = (target_raw / config.fitness_precision).round() as FitnessValue;
        builder = builder.with_target_fitness_score(target_scaled);
    }

    if config.par_fitness {
        builder = builder.with_par_fitness(true);
    }

    let evolve = builder
        .call()
        .expect("GA execution failed; check configuration and data consistency");

    let best_mask = evolve
        .best_genes()
        .unwrap_or_else(|| vec![false; n_features]);

    let selected_indices = mask_to_indices(&best_mask);
    let selected_count = selected_indices.len();

    let (raw_cv_score, penalized_score) =
        subset_score(x.as_ref(), y.as_ref(), &selected_indices, &config)
            .unwrap_or((f64::NEG_INFINITY, f64::NEG_INFINITY));

    let fitness_score = if penalized_score.is_finite() {
        (penalized_score / config.fitness_precision).round() as isize
    } else {
        isize::MIN
    };

    GAResult {
        best_mask,
        selected_indices,
        selected_count,
        raw_cv_score,
        penalized_score,
        fitness_score,
        best_generation: Some(evolve.best_generation()),
        found_solution: penalized_score.is_finite(),
    }
}

fn mask_to_indices(mask: &[bool]) -> Vec<usize> {
    mask.iter()
        .enumerate()
        .filter_map(|(i, &flag)| flag.then_some(i))
        .collect()
}

/// Score a subset with k-fold CV Q² minus a subset-size penalty.
fn subset_score(
    x: &Array2<f64>,
    y: &Array1<f64>,
    selected: &[usize],
    config: &GAConfig,
) -> Option<(f64, f64)> {
    if selected.is_empty() {
        return None;
    }

    let n_samples = x.nrows();
    if n_samples < 2 {
        return None;
    }

    let k_folds = config.cv_folds.clamp(2, n_samples);
    let y_mean_global = y.iter().copied().sum::<f64>() / n_samples as f64;
    let tss = y
        .iter()
        .map(|&v| {
            let d = v - y_mean_global;
            d * d
        })
        .sum::<f64>();

    if tss <= f64::EPSILON {
        return None;
    }

    let mut folds: Vec<Vec<usize>> = vec![Vec::new(); k_folds];
    for idx in 0..n_samples {
        folds[idx % k_folds].push(idx);
    }

    let mut press = 0.0;

    for test_idx in &folds {
        if test_idx.is_empty() {
            continue;
        }

        let mut train_idx = Vec::with_capacity(n_samples - test_idx.len());
        for idx in 0..n_samples {
            if !test_idx.contains(&idx) {
                train_idx.push(idx);
            }
        }

        if train_idx.len() <= selected.len() {
            return None;
        }

        let (beta, x_mean, y_mean) =
            fit_ridge_ols_fold(x, y, &train_idx, selected, config.ridge_lambda)?;

        for &row in test_idx {
            let mut pred = y_mean;
            for (j, &col) in selected.iter().enumerate() {
                pred += (x[(row, col)] - x_mean[j]) * beta[j];
            }
            let err = y[row] - pred;
            press += err * err;
        }
    }

    let raw_cv_score = 1.0 - (press / tss);
    if !raw_cv_score.is_finite() {
        return None;
    }

    let size_penalty = config.size_penalty * (selected.len() as f64 / x.ncols().max(1) as f64);
    let penalized_score = raw_cv_score - size_penalty;

    Some((raw_cv_score, penalized_score))
}

/// Fit ridge-regularized OLS on one training fold using centered predictors.
///
/// Returns:
/// - beta coefficients
/// - column means for selected predictors
/// - response mean
fn fit_ridge_ols_fold(
    x: &Array2<f64>,
    y: &Array1<f64>,
    train_idx: &[usize],
    selected: &[usize],
    ridge_lambda: f64,
) -> Option<(Vec<f64>, Vec<f64>, f64)> {
    let k = selected.len();
    if k == 0 {
        return None;
    }

    let n_train = train_idx.len();
    if n_train <= k {
        return None;
    }

    let mut x_mean = vec![0.0; k];
    let mut y_mean = 0.0;

    for &row in train_idx {
        y_mean += y[row];
        for (j, &col) in selected.iter().enumerate() {
            x_mean[j] += x[(row, col)];
        }
    }

    let n_train_f = n_train as f64;
    y_mean /= n_train_f;
    for v in &mut x_mean {
        *v /= n_train_f;
    }

    let mut xtx = vec![0.0; k * k];
    let mut xty = vec![0.0; k];

    for &row in train_idx {
        let yc = y[row] - y_mean;

        for a in 0..k {
            let xa = x[(row, selected[a])] - x_mean[a];
            xty[a] += xa * yc;

            for b in 0..=a {
                let xb = x[(row, selected[b])] - x_mean[b];
                xtx[a * k + b] += xa * xb;
            }
        }
    }

    // Symmetrize and add ridge regularization.
    for a in 0..k {
        for b in 0..a {
            xtx[b * k + a] = xtx[a * k + b];
        }
        xtx[a * k + a] += ridge_lambda;
    }

    let beta = solve_linear_system(xtx, xty, k)?;
    Some((beta, x_mean, y_mean))
}

/// Dense linear system solver via Gauss-Jordan elimination with partial pivoting.
///
/// Solves A x = b.
fn solve_linear_system(mut a: Vec<f64>, mut b: Vec<f64>, n: usize) -> Option<Vec<f64>> {
    let eps = 1e-12;

    for i in 0..n {
        // Pivot search
        let mut pivot_row = i;
        let mut pivot_abs = a[i * n + i].abs();
        for r in (i + 1)..n {
            let v = a[r * n + i].abs();
            if v > pivot_abs {
                pivot_abs = v;
                pivot_row = r;
            }
        }

        if pivot_abs < eps {
            return None;
        }

        if pivot_row != i {
            for c in 0..n {
                a.swap(i * n + c, pivot_row * n + c);
            }
            b.swap(i, pivot_row);
        }

        let diag = a[i * n + i];
        if diag.abs() < eps {
            return None;
        }

        // Normalize pivot row
        for c in i..n {
            a[i * n + c] /= diag;
        }
        b[i] /= diag;

        // Eliminate all other rows
        for r in 0..n {
            if r == i {
                continue;
            }
            let factor = a[r * n + i];
            if factor.abs() < eps {
                continue;
            }

            for c in i..n {
                a[r * n + c] -= factor * a[i * n + c];
            }
            b[r] -= factor * b[i];
        }
    }

    Some(b)
}
