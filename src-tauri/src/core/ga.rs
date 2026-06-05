use std::sync::Arc;

use genetic_algorithm::strategy::evolve::prelude::*;
use ndarray::{Array1, Array2};
use tauri::{ipc::Channel};

pub mod config;
pub mod events;
pub mod fitness;

pub use config::{GAConfig, GAResult};
pub use events::{GaProgressEvent, GaProgressEventKind, GaProgressReporter};
use fitness::{VariableSelectionFitness, mask_to_indices, validation_score};


/// Run GA-based variable selection over the descriptor matrix `x` and response `y`.
///
/// Each gene is a binary include/exclude flag for one column of `x`.
pub fn run_ga(x: Array2<f64>, y: Array1<f64>, config: GAConfig) -> GAResult {
    run_ga_with_handle(x, y, config, None)
}

pub fn run_ga_with_handle(
    x: Array2<f64>,
    y: Array1<f64>,
    config: GAConfig,
    on_event: Option<Channel<GaProgressEvent>>,
) -> GAResult {
    debug_assert_eq!(
        x.nrows(),
        y.len(),
        "x and y must have the same number of rows"
    );
    debug_assert!(x.ncols() > 0, "x must have at least one descriptor");
    debug_assert!(x.nrows() > 1, "x must have at least two samples");
    debug_assert!(config.population_size > 0, "population_size must be > 0");
    debug_assert!(config.max_generations > 0, "max_generations must be > 0");
    debug_assert!(
        config.max_stale_generations > 0,
        "max_stale_generations must be > 0"
    );
    debug_assert!(config.cv_folds >= 2, "cv_folds must be >= 2");
    debug_assert!(config.ridge_lambda >= 0.0, "ridge_lambda must be >= 0");
    debug_assert!(config.min_features >= 1, "min_features must be >= 1");
    debug_assert!(
        config.fitness_precision > 0.0,
        "fitness_precision must be > 0"
    );

    let n_features = x.ncols();

    if let Some(max_features) = config.max_features {
        debug_assert!(
            max_features >= config.min_features,
            "max_features must be >= min_features"
        );
        debug_assert!(
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

    let reporter = GaProgressReporter::new(on_event.expect("no on_event"), config.max_generations);

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
        .with_reporter(reporter)
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
        validation_score(x.as_ref(), y.as_ref(), &selected_indices, &config).unwrap_or((0.0, 0.0));

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


#[cfg(test)]
mod tests {
    use super::*;
    use ndarray::{array, Array1, Array2};

    pub fn simple_dataset() -> (Array2<f64>, Array1<f64>) {
        // Small deterministic dataset
        let x = array![
            [1.0, 0.0, 3.0],
            [2.0, 1.0, 6.0],
            [3.0, 0.0, 9.0],
            [4.0, 1.0, 12.0],
            [5.0, 0.0, 15.0],
        ];

        // y is strongly correlated with col 0 and col 2
        let y = array![1.0, 2.0, 3.0, 4.0, 5.0];

        (x, y)
    }

    pub fn test_config() -> GAConfig {
        GAConfig {
            population_size: 30,
            max_generations: 50,
            max_stale_generations: 10,
            target_fitness_score: None,
            replacement_rate: 0.5,
            elitism_rate: 0.05,
            tournament_size: 3,
            crossover_selection_rate: 0.7,
            crossover_rate: 0.8,
            mutation_probability: 0.2,
            cv_folds: 3,
            ridge_lambda: 1e-8,
            min_features: 1,
            max_features: None,
            size_penalty: 0.01,
            fitness_precision: 1e-6,
            seed: Some(42), // deterministic
            par_fitness: false,
        }
    }

    // -----------------------------
    // mask_to_indices
    // -----------------------------
    #[test]
    fn test_mask_to_indices_basic() {
        let mask = vec![true, false, true, false, true];
        let indices = mask_to_indices(&mask);
        assert_eq!(indices, vec![0, 2, 4]);
    }

    #[test]
    fn test_mask_to_indices_empty() {
        let mask = vec![false, false, false];
        let indices = mask_to_indices(&mask);
        assert!(indices.is_empty());
    }

    // -----------------------------
    // validation_score
    // -----------------------------
    #[test]
    fn test_validation_score_valid_subset() {
        let (x, y) = simple_dataset();
        let config = test_config();

        let selected = vec![0, 2];
        let result = validation_score(&x, &y, &selected, &config);

        assert!(result.is_some());
        let (raw, penalized) = result.unwrap();

        assert!(raw.is_finite());
        assert!(penalized.is_finite());
        assert!(penalized <= raw); // penalty reduces score
    }

    #[test]
    fn test_validation_score_empty_subset() {
        let (x, y) = simple_dataset();
        let config = test_config();

        let result = validation_score(&x, &y, &[], &config);
        assert!(result.is_none());
    }

    // -----------------------------
    // GA execution
    // -----------------------------
    #[test]
    fn test_run_ga_basic() {
        let (x, y) = simple_dataset();
        let config = test_config();

        let result = run_ga(x, y, config);

        assert!(result.best_mask.len() > 0);
        assert_eq!(result.selected_count, result.selected_indices.len());

        assert!(result.raw_cv_score.is_finite());
        assert!(result.penalized_score.is_finite());

        assert!(result.found_solution);
    }

    #[test]
    fn test_run_ga_respects_min_features() {
        let (x, y) = simple_dataset();

        let mut config = test_config();
        config.min_features = 2;

        let result = run_ga(x, y, config);

        assert!(result.selected_count >= 2);
    }

    #[test]
    fn test_run_ga_respects_max_features() {
        let (x, y) = simple_dataset();

        let mut config = test_config();
        config.max_features = Some(2);

        let result = run_ga(x, y, config);

        assert!(result.selected_count <= 2);
    }

    #[test]
    fn test_run_ga_deterministic_with_seed() {
        let (x, y) = simple_dataset();
        let config = test_config();

        let result1 = run_ga(x.clone(), y.clone(), config.clone());
        let result2 = run_ga(x, y, config);

        assert_eq!(result1.best_mask, result2.best_mask);
        assert_eq!(result1.selected_indices, result2.selected_indices);
        assert_eq!(result1.fitness_score, result2.fitness_score);
    }

    #[test]
    fn test_run_ga_handles_no_valid_solution() {
        let (x, y) = simple_dataset();

        let mut config = test_config();
        config.min_features = 10; // impossible (more than n_features)

        let result = run_ga(x, y, config);

        assert_eq!(result.selected_count, 0);
        assert!(!result.found_solution);
        assert!(!result.penalized_score.is_finite());
    }

    #[test]
    fn test_fitness_scaling_consistency() {
        let (x, y) = simple_dataset();
        let config = test_config();

        let result = run_ga(x, y, config.clone());

        if result.penalized_score.is_finite() {
            let expected = (result.penalized_score / config.fitness_precision).round() as isize;

            assert_eq!(result.fitness_score, expected);
        }
    }
}
