use genetic_algorithm::strategy::evolve::prelude::*;
use serde::{Deserialize, Serialize};
use tauri::{ipc::Channel};

pub const GA_PROGRESS_EVENT: &str = "ga:progress";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum GaProgressEventKind {
    Start,
    Generation,
    Finish,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event")]
pub struct GaProgressEvent {
    event: GaProgressEventKind,
    max_generations: usize,
    current_generation: usize,
    stale_generations: usize,
    best_generation: Option<usize>,
    progress: f64,
}


#[derive(Clone)]
pub struct GaProgressReporter {
    max_generations: usize,
    on_event: Channel<GaProgressEvent>,
}

impl GaProgressReporter {
    pub fn new(on_event: Channel<GaProgressEvent>, max_generations: usize) -> Self {
        Self {
            on_event,
            max_generations,
        }
    }

    pub fn emit<S: StrategyState<BinaryGenotype>, C: StrategyConfig>(
        &self,
        kind: GaProgressEventKind,
        state: &S,
        _config: &C,
    ) {
        let current_generation = state.current_generation();
        let progress = if kind == GaProgressEventKind::Start || self.max_generations == 0 {
            0.0
        } else if kind == GaProgressEventKind::Finish {
            100.0
        } else {
            (((current_generation + 1) as f64 / self.max_generations as f64) * 100.0).min(100.0)
        };

        let _ = self.on_event.send(GaProgressEvent {
            progress,
            event: kind,
            current_generation,
            max_generations: self.max_generations,
            stale_generations: state.stale_generations(),
            best_generation: Some(state.best_generation()),
        });
        return;
    }
}

impl StrategyReporter for GaProgressReporter {
    type Genotype = BinaryGenotype;

    fn on_start<S: StrategyState<Self::Genotype>, C: StrategyConfig>(
        &mut self,
        _genotype: &Self::Genotype,
        state: &S,
        config: &C,
    ) {
        self.emit(GaProgressEventKind::Start, state, config);
    }

    fn on_generation_complete<S: StrategyState<Self::Genotype>, C: StrategyConfig>(
        &mut self,
        _genotype: &Self::Genotype,
        state: &S,
        config: &C,
    ) {
        self.emit(GaProgressEventKind::Generation, state, config);
    }

    fn on_new_best_chromosome<S: StrategyState<Self::Genotype>, C: StrategyConfig>(
        &mut self,
        _genotype: &Self::Genotype,
        state: &S,
        config: &C,
    ) {
        self.emit(GaProgressEventKind::Generation, state, config);
    }

    fn on_finish<S: StrategyState<Self::Genotype>, C: StrategyConfig>(
        &mut self,
        _genotype: &Self::Genotype,
        state: &S,
        config: &C,
    ) {
        self.emit(GaProgressEventKind::Finish, state, config);
    }
}
