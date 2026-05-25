use serde::Serialize;
use ndarray::Array2;
use crate::core::domain::{
    dataset::RawDataset, filter::*, ops::*, validation::*,
};

/// Etapa atual do pipeline, derivada do estado — usada pela UI para
/// habilitar/desabilitar seções.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PipelineStage {
    Empty,
    Loaded,
    Filtered,
    Selected,
    Validated,
}

pub struct PipelineState {
    // ── Dados brutos (imutáveis após carga) ──────────────────────────────────
    pub raw: Option<RawDataset>,

    // ── Filtragem ─────────────────────────────────────────────────────────────
    /// Config atual exibida na UI; persiste entre reaplicações.
    pub filter_config: FilterConfig,
    /// None = nenhum filtro aplicado ainda; substituído a cada reaplicação.
    pub filtered: Option<FilteredDataset>,

    // ── OPS ───────────────────────────────────────────────────────────────────
    pub ops_config: Option<OpsConfig>,
    pub ops_result: Option<OpsResult>,

    // ── Validação ─────────────────────────────────────────────────────────────
    pub validation_config: Option<ValidationConfig>,
    pub validation_results: Option<ValidationResults>,
}

impl PipelineState {
    pub fn new() -> Self {
        Self {
            raw: None,
            filter_config: FilterConfig::default(),
            filtered: None,
            ops_config: None,
            ops_result: None,
            validation_config: None,
            validation_results: None,
        }
    }

    // ── Helpers de leitura ───────────────────────────────────────────────────

    /// X que alimenta o OPS: filtrado se disponível, senão o original.
    pub fn ops_input_x(&self) -> Option<&Array2<f64>> {
        self.filtered
            .as_ref()
            .map(|f| &f.x)
            .or_else(|| self.raw.as_ref().map(|r| &r.x))
    }

    pub fn ops_input_n_features(&self) -> Option<usize> {
        self.ops_input_x().map(|x| x.ncols())
    }

    pub fn stage(&self) -> PipelineStage {
        match (
            self.raw.is_some(),
            self.filtered.is_some(),
            self.ops_result.is_some(),
            self.validation_results.is_some(),
        ) {
            (false, ..)         => PipelineStage::Empty,
            (true, false, false, _) => PipelineStage::Loaded,
            (true, true, false, _)  => PipelineStage::Filtered,
            (true, _, true, false)  => PipelineStage::Selected,
            (true, _, true, true)   => PipelineStage::Validated,
        }
    }

    // ── Invalidações em cascata ──────────────────────────────────────────────

    /// Chamado quando o usuário reaplica filtros (passo 7).
    /// O dataset bruto é preservado; tudo downstream é descartado.
    pub fn invalidate_from_filter(&mut self) {
        self.filtered = None;
        self.ops_result = None;
        self.validation_results = None;
    }

    /// Chamado quando OPS é reexecutado.
    pub fn invalidate_from_ops(&mut self) {
        self.ops_result = None;
        self.validation_results = None;
    }

    /// Chamado quando um novo dataset é carregado.
    pub fn reset(&mut self) {
        *self = Self::new();
    }
}
