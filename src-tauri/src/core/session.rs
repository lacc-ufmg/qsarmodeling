use std::collections::HashMap;
use std::path::Path;

use polars::prelude::*;

use super::error::{QsarError, Result};
use super::filter::{filter_matrix_from_original};
use super::loader::{load_dataset, RawDataset};
use super::types::{DatasetProfile, DatasetSource, FilterCacheKey, FilterSettings};

#[derive(Debug, Clone)]
pub struct LoadedDataset {
    pub session_id: String,
    pub matrix_name: String,
    pub vector_name: String,
    pub original_frame: DataFrame,
    pub target: Vec<f64>,
    pub row_labels: Option<Vec<String>>,
    cached_filters: HashMap<FilterCacheKey, FilteredDataset>,
}

#[derive(Debug, Clone)]
pub struct FilteredDataset {
    pub profile: DatasetProfile,
    pub frame: DataFrame,
    pub selected_indices: Vec<usize>,
}

impl LoadedDataset {
    fn from_loaded_matrix(session_id: String, matrix_name: String, vector_name: String, loaded: RawDataset, target: Vec<f64>) -> Self {
        Self {
            session_id,
            matrix_name,
            vector_name,
            original_frame: loaded.frame,
            target,
            row_labels: loaded.row_labels,
            cached_filters: HashMap::new(),
        }
    }

    pub fn profile(&self) -> DatasetProfile {
        DatasetProfile {
            session_id: self.session_id.clone(),
            id: format!("dataset-{}", self.session_id),
            matrix_name: self.matrix_name.clone(),
            vector_name: self.vector_name.clone(),
            rows: self.original_frame.height(),
            descriptors: self.original_frame.width(),
            source: DatasetSource::Uploaded,
        }
    }

    fn filtered_profile(&self, descriptors: usize) -> DatasetProfile {
        DatasetProfile {
            session_id: self.session_id.clone(),
            id: format!("dataset-{}-filtered", self.session_id),
            matrix_name: self.matrix_name.clone(),
            vector_name: self.vector_name.clone(),
            rows: self.original_frame.height(),
            descriptors,
            source: DatasetSource::Filtered,
        }
    }
}

#[derive(Debug, Default)]
pub struct SessionStore {
    sessions: HashMap<String, LoadedDataset>,
}

impl SessionStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn load_dataset(&mut self, matrix_path: impl AsRef<Path>, vector_path: impl AsRef<Path>) -> Result<DatasetProfile> {
        let session_id = uuid();
        let matrix_path = matrix_path.as_ref();
        let vector_path = vector_path.as_ref();
        let matrix_name = matrix_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("matrix.csv")
            .to_string();
        let vector_name = vector_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("vector.csv")
            .to_string();

        let loaded_matrix = load_dataset(matrix_path, vector_path)
            .map_err(|error| QsarError::InvalidDataset(error.to_string()))?;
        let target = loaded_matrix.y.to_vec();

        if loaded_matrix.frame.height() != target.len() {
            return Err(QsarError::InvalidDataset(
                "Matrix row count does not match the y vector length.".to_string(),
            ));
        }

        let dataset = LoadedDataset::from_loaded_matrix(session_id.clone(), matrix_name, vector_name, loaded_matrix, target);
        let profile = dataset.profile();
        self.sessions.insert(session_id, dataset);
        Ok(profile)
    }

    pub fn session(&self, session_id: &str) -> Result<&LoadedDataset> {
        self.sessions
            .get(session_id)
            .ok_or_else(|| QsarError::MissingSession(session_id.to_string()))
    }

    pub fn filter_dataset(&mut self, session_id: &str, settings: FilterSettings) -> Result<FilteredDataset> {
        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| QsarError::MissingSession(session_id.to_string()))?;
        let key = settings.into();

        if let Some(cached) = session.cached_filters.get(&key) {
            return Ok(cached.clone());
        }

        let filtered = filter_matrix_from_original(&session.original_frame, &session.target, settings)?;
        let profile = session.filtered_profile(filtered.frame.width());
        let result = FilteredDataset {
            profile,
            frame: filtered.frame,
            selected_indices: filtered.selected_indices,
        };

        session.cached_filters.insert(key, result.clone());
        Ok(result)
    }

    pub fn session_profile(&self, session_id: &str) -> Result<DatasetProfile> {
        Ok(self.session(session_id)?.profile())
    }
}

fn uuid() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}
