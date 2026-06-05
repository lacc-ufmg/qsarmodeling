use ndarray::Array2;
use std::path::Path;
use std::sync::{Arc, Mutex};

use crate::core;
use crate::core::filter::{FilterConfig, FilterPipeline, FilterResult};
use crate::core::ga::{GAConfig, GAResult, GaProgressEvent};
use crate::core::loader::{DatasetMetadata, RawDataset};
use crate::core::ops::{OpsConfig, OpsResult};
use tauri::ipc::Channel;

pub struct SessionState {
    inner: Mutex<SessionInner>,
}

struct SessionInner {
    dataset: Option<Arc<RawDataset>>,
    pipeline: Option<FilterPipeline>,
    last_filter_config: Option<FilterConfig>,
    last_filter_result: Option<FilterResult>,
}

impl SessionState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(SessionInner {
                dataset: None,
                pipeline: None,
                last_filter_config: None,
                last_filter_result: None,
            }),
        }
    }

    pub fn get_dataset(&self) -> Option<Arc<RawDataset>> {
        self.inner.lock().unwrap().dataset.clone()
    }

    pub fn run_ops(&self, config: OpsConfig) -> Result<OpsResult, String> {
        let dataset = self.get_dataset().ok_or("No dataset loaded")?;

        // Materialize X (after filtering)
        let x = self.materialize_last_x()?;
        let y = dataset.y.clone();

        // Run OPS
        let result = core::ops::run_ops(&x, &y, &config);
        Ok(result)
    }

    pub fn run_ga(
        &self,
        config: GAConfig,
        channel: Channel<GaProgressEvent>,
    ) -> Result<GAResult, String> {
        let dataset = self.get_dataset().ok_or("No dataset loaded")?;

        let x = self.materialize_last_x()?;
        let y = dataset.y.clone();

        let result = core::ga::run_ga_with_handle(x, y, config, Some(channel));
        Ok(result)
    }

    pub fn load_dataset(&self, x_path: &Path, y_path: &Path) -> Result<DatasetMetadata, String> {
        let dataset = core::loader::load_dataset(&x_path, &y_path)
            .map_err(|e| format!("Failed to load dataset: {}", e))?;

        Ok(self.set_dataset(dataset))
    }

    fn set_dataset(&self, dataset: RawDataset) -> DatasetMetadata {
        let mut inner = self.inner.lock().unwrap();

        let metadata = DatasetMetadata::from(&dataset);
        let dataset = Arc::new(dataset);

        // Build pipeline ONCE (this computes stats)
        let pipeline = FilterPipeline::new(dataset.clone());

        inner.dataset = Some(dataset);
        inner.pipeline = Some(pipeline);

        // Invalidate previous results
        inner.last_filter_config = None;
        inner.last_filter_result = None;
        metadata
    }

    pub fn has_dataset(&self) -> bool {
        self.inner.lock().unwrap().dataset.is_some()
    }

    // =============================
    // Filtering
    // =============================
    pub fn apply_filter(&self, config: FilterConfig) -> Result<FilterResult, String> {
        let mut inner = self.inner.lock().unwrap();

        let pipeline = inner.pipeline.as_ref().ok_or("No dataset loaded")?;

        // Run filter (fast: stats already cached)
        let result = pipeline.run(&config);

        inner.last_filter_config = Some(config);
        inner.last_filter_result = Some(result.clone());

        Ok(result)
    }

    // =============================
    // Accessors
    // =============================
    pub fn get_last_result(&self) -> Option<FilterResult> {
        self.inner.lock().unwrap().last_filter_result.clone()
    }

    pub fn get_last_config(&self) -> Option<FilterConfig> {
        self.inner.lock().unwrap().last_filter_config.clone()
    }

    // =============================
    // Optional: materialized matrix
    // =============================
    pub fn materialize_last_x(&self) -> Result<Array2<f64>, String> {
        let inner = self.inner.lock().unwrap();

        let dataset = inner.dataset.as_ref().ok_or("No dataset")?;
        let result = inner
            .last_filter_result
            .as_ref()
            .ok_or("No filter result")?;

        Ok(core::filter::materialize(dataset, &result.state))
    }
}
