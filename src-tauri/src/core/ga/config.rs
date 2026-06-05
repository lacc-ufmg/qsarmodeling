use serde::{Deserialize, Serialize};

/// Configuration for GA-based variable selection.
///
/// The GA maximizes a penalized cross-validated score:
///     penalized_score = q2_cv - size_penalty * (n_selected / n_features)
///
/// The raw score is the k-fold CV Q² (higher is better).
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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

