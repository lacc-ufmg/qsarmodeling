use std::sync::Arc;

use genetic_algorithm::strategy::evolve::prelude::*;
use ndarray::{Array1, Array2};

use crate::{core::ga::GAConfig, utils::select_columns};

#[derive(Clone, Debug)]
pub(super) struct VariableSelectionFitness {
    pub(super) x: Arc<Array2<f64>>,
    pub(super) y: Arc<Array1<f64>>,
    pub(super) config: GAConfig,
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
            validation_score(self.x.as_ref(), self.y.as_ref(), &selected, &self.config)?;

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

pub(super) fn mask_to_indices(mask: &[bool]) -> Vec<usize> {
    mask.iter()
        .enumerate()
        .filter_map(|(i, &flag)| flag.then_some(i))
        .collect()
}

/// Score a subset with k-fold CV Q² minus a subset-size penalty.
pub(super) fn validation_score(
    x: &Array2<f64>,
    y: &Array1<f64>,
    selected: &[usize],
    config: &GAConfig,
) -> Option<(f64, f64)> {
    if selected.is_empty() {
        return None;
    }

    let x_selected = select_columns(x, selected);
    let n_samples = x_selected.nrows();
    let n_lv = selected.len().min(n_samples.saturating_sub(1)).max(1);

    let (raw_cv_score, rmsecv) = crate::validation::metrics::loo_q2_rmsecv(&x_selected, y, n_lv);
    if !raw_cv_score.is_finite() || !rmsecv.is_finite() {
        return None;
    }

    let size_penalty = config.size_penalty * (selected.len() as f64 / x.ncols().max(1) as f64);
    let penalized_score = raw_cv_score - size_penalty;

    Some((raw_cv_score, penalized_score))
}
