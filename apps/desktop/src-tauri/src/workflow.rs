use chrono::Local;
use qsarmodelingrs::load_dataset as qsar_load_dataset;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

const DEFAULT_API_BASE: &str = "http://127.0.0.1:27051";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetProfile {
    pub session_id: String,
    pub id: String,
    pub matrix_name: String,
    pub vector_name: String,
    pub rows: u32,
    pub descriptors: u32,
    pub source: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterSettings {
    pub var_cut: f64,
    pub corr_cut: f64,
    pub autocorr_cut: f64,
    pub autoscale: bool,
    pub lj_transform: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SelectionMethod {
    Ops,
    Ga,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionSettings {
    pub method: SelectionMethod,
    pub latent_vars_model: u32,
    pub latent_vars_ops: u32,
    pub vars_percentage: u32,
    pub min_vars_model: u32,
    pub max_vars_model: u32,
    pub population_size: u32,
    pub generations: u32,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionResult {
    pub session_id: String,
    pub method: SelectionMethod,
    pub selected_descriptors: u32,
    pub latent_variables: u32,
    pub q2: f64,
    pub r2: f64,
    pub validation_passed: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationSettings {
    pub run_cross_validation: bool,
    pub run_y_randomization: bool,
    pub run_lno: bool,
    pub run_external_validation: bool,
    pub yrand_cutoff: f64,
    pub lno_cutoff: f64,
    pub test_set_ratio: f64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub cv: Option<CrossValidationResult>,
    pub yr: Option<YRandomizationResult>,
    pub lno: Option<LeaveNOutResult>,
    pub ext: Option<ExternalValidationResult>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossValidationResult {
    pub q2: f64,
    pub rmse: f64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YRandomizationResult {
    pub score: f64,
    pub passed: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaveNOutResult {
    pub score: f64,
    pub passed: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalValidationResult {
    pub r2_pred: f64,
    pub rmsep: f64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadDatasetInput {
    pub matrix_path: String,
    pub vector_path: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterSettingsPatch {
    pub var_cut: Option<f64>,
    pub corr_cut: Option<f64>,
    pub autocorr_cut: Option<f64>,
    pub autoscale: Option<bool>,
    pub lj_transform: Option<bool>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionSettingsPatch {
    pub method: Option<SelectionMethod>,
    pub latent_vars_model: Option<u32>,
    pub latent_vars_ops: Option<u32>,
    pub vars_percentage: Option<u32>,
    pub min_vars_model: Option<u32>,
    pub max_vars_model: Option<u32>,
    pub population_size: Option<u32>,
    pub generations: Option<u32>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationSettingsPatch {
    pub run_cross_validation: Option<bool>,
    pub run_y_randomization: Option<bool>,
    pub run_lno: Option<bool>,
    pub run_external_validation: Option<bool>,
    pub yrand_cutoff: Option<f64>,
    pub lno_cutoff: Option<f64>,
    pub test_set_ratio: Option<f64>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BusyState {
    Idle,
    LoadingData,
    Filtering,
    Selecting,
    Validating,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowSnapshot {
    pub uploaded_dataset: Option<DatasetProfile>,
    pub active_dataset: Option<DatasetProfile>,
    pub selection_result: Option<SelectionResult>,
    pub validation_result: Option<ValidationResult>,
    pub busy_state: BusyState,
    pub error: Option<String>,
    pub history: Vec<String>,
    pub filter_settings: FilterSettings,
    pub selection_settings: SelectionSettings,
    pub validation_settings: ValidationSettings,
}

struct WorkflowSession {
    uploaded_dataset: Option<DatasetProfile>,
    active_dataset: Option<DatasetProfile>,
    selection_result: Option<SelectionResult>,
    validation_result: Option<ValidationResult>,
    busy_state: BusyState,
    error: Option<String>,
    history: Vec<String>,
    filter_settings: FilterSettings,
    selection_settings: SelectionSettings,
    validation_settings: ValidationSettings,
}

impl Default for WorkflowSession {
    fn default() -> Self {
        Self {
            uploaded_dataset: None,
            active_dataset: None,
            selection_result: None,
            validation_result: None,
            busy_state: BusyState::Idle,
            error: None,
            history: Vec::new(),
            filter_settings: FilterSettings {
                var_cut: 0.3,
                corr_cut: 0.25,
                autocorr_cut: 0.85,
                autoscale: true,
                lj_transform: false,
            },
            selection_settings: SelectionSettings {
                method: SelectionMethod::Ops,
                latent_vars_model: 10,
                latent_vars_ops: 5,
                vars_percentage: 10,
                min_vars_model: 3,
                max_vars_model: 20,
                population_size: 50,
                generations: 100,
            },
            validation_settings: ValidationSettings {
                run_cross_validation: true,
                run_y_randomization: true,
                run_lno: true,
                run_external_validation: true,
                yrand_cutoff: 0.3,
                lno_cutoff: 0.1,
                test_set_ratio: 0.2,
            },
        }
    }
}

impl WorkflowSession {
    fn snapshot(&self) -> WorkflowSnapshot {
        WorkflowSnapshot {
            uploaded_dataset: self.uploaded_dataset.clone(),
            active_dataset: self.active_dataset.clone(),
            selection_result: self.selection_result.clone(),
            validation_result: self.validation_result.clone(),
            busy_state: self.busy_state.clone(),
            error: self.error.clone(),
            history: self.history.clone(),
            filter_settings: self.filter_settings.clone(),
            selection_settings: self.selection_settings.clone(),
            validation_settings: self.validation_settings.clone(),
        }
    }

    fn append_history(&mut self, message: impl Into<String>) {
        self.history.insert(
            0,
            format!("{} - {}", Local::now().format("%H:%M:%S"), message.into()),
        );
        self.history.truncate(8);
    }

    fn clear_results(&mut self) {
        self.selection_result = None;
        self.validation_result = None;
    }
}

pub struct WorkflowSessionStore {
    session: Mutex<WorkflowSession>,
}

impl Default for WorkflowSessionStore {
    fn default() -> Self {
        Self {
            session: Mutex::new(WorkflowSession::default()),
        }
    }
}

fn backend_base_url() -> String {
    std::env::var("QSAR_API_BASE").unwrap_or_else(|_| DEFAULT_API_BASE.to_string())
}

fn emit_snapshot(app: &AppHandle, snapshot: &WorkflowSnapshot) -> Result<(), String> {
    app.emit("workflow:state-updated", snapshot)
        .map_err(|error| error.to_string())
}

fn apply_filter_patch(session: &mut WorkflowSession, patch: FilterSettingsPatch) {
    if let Some(value) = patch.var_cut {
        session.filter_settings.var_cut = value;
    }
    if let Some(value) = patch.corr_cut {
        session.filter_settings.corr_cut = value;
    }
    if let Some(value) = patch.autocorr_cut {
        session.filter_settings.autocorr_cut = value;
    }
    if let Some(value) = patch.autoscale {
        session.filter_settings.autoscale = value;
    }
    if let Some(value) = patch.lj_transform {
        session.filter_settings.lj_transform = value;
    }
}

fn apply_selection_patch(session: &mut WorkflowSession, patch: SelectionSettingsPatch) {
    if let Some(value) = patch.method {
        session.selection_settings.method = value;
    }
    if let Some(value) = patch.latent_vars_model {
        session.selection_settings.latent_vars_model = value;
    }
    if let Some(value) = patch.latent_vars_ops {
        session.selection_settings.latent_vars_ops = value;
    }
    if let Some(value) = patch.vars_percentage {
        session.selection_settings.vars_percentage = value;
    }
    if let Some(value) = patch.min_vars_model {
        session.selection_settings.min_vars_model = value;
    }
    if let Some(value) = patch.max_vars_model {
        session.selection_settings.max_vars_model = value;
    }
    if let Some(value) = patch.population_size {
        session.selection_settings.population_size = value;
    }
    if let Some(value) = patch.generations {
        session.selection_settings.generations = value;
    }
}

fn apply_validation_patch(session: &mut WorkflowSession, patch: ValidationSettingsPatch) {
    if let Some(value) = patch.run_cross_validation {
        session.validation_settings.run_cross_validation = value;
    }
    if let Some(value) = patch.run_y_randomization {
        session.validation_settings.run_y_randomization = value;
    }
    if let Some(value) = patch.run_lno {
        session.validation_settings.run_lno = value;
    }
    if let Some(value) = patch.run_external_validation {
        session.validation_settings.run_external_validation = value;
    }
    if let Some(value) = patch.yrand_cutoff {
        session.validation_settings.yrand_cutoff = value;
    }
    if let Some(value) = patch.lno_cutoff {
        session.validation_settings.lno_cutoff = value;
    }
    if let Some(value) = patch.test_set_ratio {
        session.validation_settings.test_set_ratio = value;
    }
}

fn set_busy_state(session: &mut WorkflowSession, busy_state: BusyState) {
    session.busy_state = busy_state;
    session.error = None;
}

async fn post_json<T: Serialize, R: for<'de> Deserialize<'de>>(
    path: &str,
    payload: &T,
) -> Result<R, String> {
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}{}", backend_base_url(), path))
        .json(payload)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(if body.is_empty() {
            format!("Backend request failed with status {}", status)
        } else {
            body
        });
    }

    response
        .json::<R>()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_workflow_snapshot(state: State<'_, WorkflowSessionStore>) -> WorkflowSnapshot {
    let session = state.session.lock().expect("workflow state lock poisoned");
    session.snapshot()
}

#[tauri::command]
pub fn update_filter_settings(
    app: AppHandle,
    state: State<'_, WorkflowSessionStore>,
    patch: FilterSettingsPatch,
) -> Result<WorkflowSnapshot, String> {
    let snapshot = {
        let mut session = state.session.lock().map_err(|error| error.to_string())?;
        apply_filter_patch(&mut session, patch);
        session.snapshot()
    };

    emit_snapshot(&app, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn update_selection_settings(
    app: AppHandle,
    state: State<'_, WorkflowSessionStore>,
    patch: SelectionSettingsPatch,
) -> Result<WorkflowSnapshot, String> {
    let snapshot = {
        let mut session = state.session.lock().map_err(|error| error.to_string())?;
        apply_selection_patch(&mut session, patch);
        session.snapshot()
    };

    emit_snapshot(&app, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn update_validation_settings(
    app: AppHandle,
    state: State<'_, WorkflowSessionStore>,
    patch: ValidationSettingsPatch,
) -> Result<WorkflowSnapshot, String> {
    let snapshot = {
        let mut session = state.session.lock().map_err(|error| error.to_string())?;
        apply_validation_patch(&mut session, patch);
        session.snapshot()
    };

    emit_snapshot(&app, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
pub async fn load_dataset(
    app: AppHandle,
    state: State<'_, WorkflowSessionStore>,
    input: LoadDatasetInput,
) -> Result<WorkflowSnapshot, String> {
    {
        let mut session = state.session.lock().map_err(|error| error.to_string())?;
        set_busy_state(&mut session, BusyState::LoadingData);
        let snapshot = session.snapshot();
        emit_snapshot(&app, &snapshot)?;
    }

    // Load dataset directly from file paths using qsarmodelingrs
    let loaded_dataset = (|| -> Result<DatasetProfile, String> {
        let matrix_path = std::path::PathBuf::from(&input.matrix_path);
        let vector_path = std::path::PathBuf::from(&input.vector_path);

        // Validate that files exist
        if !matrix_path.exists() {
            return Err(format!("Matrix file not found: {}", input.matrix_path));
        }
        if !vector_path.exists() {
            return Err(format!("Vector file not found: {}", input.vector_path));
        }

        // Load using qsarmodelingrs
        let (matrix, _y) =
            qsar_load_dataset(&matrix_path, &vector_path).map_err(|e| e.to_string())?;

        let session_id = Uuid::new_v4().to_string();
        let matrix_name = matrix_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("matrix.csv")
            .to_string();
        let vector_name = vector_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("vector.csv")
            .to_string();

        Ok(DatasetProfile {
            session_id: session_id.clone(),
            id: session_id.clone(),
            matrix_name,
            vector_name,
            rows: matrix.frame.height() as u32,
            descriptors: matrix.frame.width() as u32,
            source: "Local".to_string(),
        })
    })()?;

    let snapshot = {
        let mut session = state.session.lock().map_err(|error| error.to_string())?;
        session.uploaded_dataset = Some(loaded_dataset.clone());
        session.active_dataset = Some(loaded_dataset.clone());
        session.clear_results();
        session.busy_state = BusyState::Idle;
        session.error = None;
        session.append_history(format!(
            "Loaded dataset ({} rows, {} descriptors).",
            loaded_dataset.rows, loaded_dataset.descriptors
        ));
        session.snapshot()
    };

    emit_snapshot(&app, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
pub async fn run_descriptor_filters(
    app: AppHandle,
    state: State<'_, WorkflowSessionStore>,
) -> Result<WorkflowSnapshot, String> {
    let (session_id, settings) = {
        let mut session = state.session.lock().map_err(|error| error.to_string())?;
        let session_id = session
            .uploaded_dataset
            .as_ref()
            .ok_or_else(|| "Load a dataset before applying filters.".to_string())?
            .session_id
            .clone();
        set_busy_state(&mut session, BusyState::Filtering);
        let snapshot = session.snapshot();
        emit_snapshot(&app, &snapshot)?;
        (session_id, session.filter_settings.clone())
    };

    #[derive(Serialize)]
    struct FilterRequest {
        #[serde(rename = "varCut")]
        var_cut: f64,
        #[serde(rename = "corrCut")]
        corr_cut: f64,
        #[serde(rename = "autocorrCut")]
        autocorr_cut: f64,
        autoscale: bool,
        #[serde(rename = "ljTransform")]
        lj_transform: bool,
    }

    let filtered = post_json::<_, DatasetProfile>(
        &format!("/sessions/{session_id}/filters"),
        &FilterRequest {
            var_cut: settings.var_cut,
            corr_cut: settings.corr_cut,
            autocorr_cut: settings.autocorr_cut,
            autoscale: settings.autoscale,
            lj_transform: settings.lj_transform,
        },
    )
    .await;

    let filtered = match filtered {
        Ok(dataset) => dataset,
        Err(error) => {
            let snapshot = {
                let mut session = state
                    .session
                    .lock()
                    .map_err(|lock_error| lock_error.to_string())?;
                session.busy_state = BusyState::Idle;
                session.error = Some(error.clone());
                session.snapshot()
            };
            emit_snapshot(&app, &snapshot)?;
            return Err(error);
        }
    };

    let snapshot = {
        let mut session = state.session.lock().map_err(|error| error.to_string())?;
        session.active_dataset = Some(filtered.clone());
        session.clear_results();
        session.busy_state = BusyState::Idle;
        session.error = None;
        session.append_history(format!(
            "Applied descriptor filters. Active matrix now has {} descriptors.",
            filtered.descriptors
        ));
        session.snapshot()
    };

    emit_snapshot(&app, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
pub async fn run_variable_selection(
    app: AppHandle,
    state: State<'_, WorkflowSessionStore>,
) -> Result<WorkflowSnapshot, String> {
    let (session_id, filter_settings, selection_settings) = {
        let mut session = state.session.lock().map_err(|error| error.to_string())?;
        let session_id = session
            .uploaded_dataset
            .as_ref()
            .ok_or_else(|| "Load a dataset before running selection.".to_string())?
            .session_id
            .clone();
        set_busy_state(&mut session, BusyState::Selecting);
        let snapshot = session.snapshot();
        emit_snapshot(&app, &snapshot)?;
        (
            session_id,
            session.filter_settings.clone(),
            session.selection_settings.clone(),
        )
    };

    #[derive(Serialize)]
    struct SelectionRequest {
        #[serde(rename = "filterSettings")]
        filter_settings: FilterSettings,
        #[serde(rename = "selectionSettings")]
        selection_settings: SelectionSettings,
    }

    let selected = post_json::<_, SelectionResult>(
        &format!("/sessions/{session_id}/selection"),
        &SelectionRequest {
            filter_settings,
            selection_settings,
        },
    )
    .await;

    let selected = match selected {
        Ok(result) => result,
        Err(error) => {
            let snapshot = {
                let mut session = state
                    .session
                    .lock()
                    .map_err(|lock_error| lock_error.to_string())?;
                session.busy_state = BusyState::Idle;
                session.error = Some(error.clone());
                session.snapshot()
            };
            emit_snapshot(&app, &snapshot)?;
            return Err(error);
        }
    };

    let snapshot = {
        let mut session = state.session.lock().map_err(|error| error.to_string())?;
        session.selection_result = Some(selected.clone());
        session.validation_result = None;
        session.busy_state = BusyState::Idle;
        session.error = None;
        session.append_history(format!(
            "{} selected {} descriptors (Q2 {:.3}).",
            match selected.method {
                SelectionMethod::Ops => "OPS",
                SelectionMethod::Ga => "GA",
            },
            selected.selected_descriptors,
            selected.q2,
        ));
        session.snapshot()
    };

    emit_snapshot(&app, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
pub async fn run_validation_suite(
    app: AppHandle,
    state: State<'_, WorkflowSessionStore>,
) -> Result<WorkflowSnapshot, String> {
    let (session_id, validation_settings) = {
        let mut session = state.session.lock().map_err(|error| error.to_string())?;
        let session_id = session
            .uploaded_dataset
            .as_ref()
            .ok_or_else(|| "Load a dataset before running validations.".to_string())?
            .session_id
            .clone();
        if session.selection_result.is_none() {
            return Err("Run selection before validation.".to_string());
        }
        set_busy_state(&mut session, BusyState::Validating);
        let snapshot = session.snapshot();
        emit_snapshot(&app, &snapshot)?;
        (session_id, session.validation_settings.clone())
    };

    #[derive(Serialize)]
    struct ValidationRequest {
        #[serde(rename = "validationSettings")]
        validation_settings: ValidationSettings,
    }

    let validation = post_json::<_, ValidationResult>(
        &format!("/sessions/{session_id}/validate"),
        &ValidationRequest {
            validation_settings,
        },
    )
    .await;

    let validation = match validation {
        Ok(result) => result,
        Err(error) => {
            let snapshot = {
                let mut session = state
                    .session
                    .lock()
                    .map_err(|lock_error| lock_error.to_string())?;
                session.busy_state = BusyState::Idle;
                session.error = Some(error.clone());
                session.snapshot()
            };
            emit_snapshot(&app, &snapshot)?;
            return Err(error);
        }
    };

    let snapshot = {
        let mut session = state.session.lock().map_err(|error| error.to_string())?;
        session.validation_result = Some(validation.clone());
        session.busy_state = BusyState::Idle;
        session.error = None;
        session.append_history("Validation suite completed.");
        session.snapshot()
    };

    emit_snapshot(&app, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
pub async fn run_full_pipeline(
    app: AppHandle,
    state: State<'_, WorkflowSessionStore>,
) -> Result<WorkflowSnapshot, String> {
    let (session_id, filter_settings, selection_settings, validation_settings) = {
        let mut session = state.session.lock().map_err(|error| error.to_string())?;
        let session_id = session
            .uploaded_dataset
            .as_ref()
            .ok_or_else(|| "Load a dataset before running the pipeline.".to_string())?
            .session_id
            .clone();
        set_busy_state(&mut session, BusyState::Filtering);
        let snapshot = session.snapshot();
        emit_snapshot(&app, &snapshot)?;
        (
            session_id,
            session.filter_settings.clone(),
            session.selection_settings.clone(),
            session.validation_settings.clone(),
        )
    };

    #[derive(Serialize)]
    struct PipelineRequest {
        #[serde(rename = "filterSettings")]
        filter_settings: FilterSettings,
        #[serde(rename = "selectionSettings")]
        selection_settings: SelectionSettings,
        #[serde(rename = "validationSettings")]
        validation_settings: ValidationSettings,
    }

    #[derive(Deserialize)]
    struct PipelineResponse {
        dataset: DatasetProfile,
        selection: SelectionResult,
        validation: ValidationResult,
    }

    let pipeline = post_json::<_, PipelineResponse>(
        &format!("/sessions/{session_id}/pipeline"),
        &PipelineRequest {
            filter_settings,
            selection_settings,
            validation_settings,
        },
    )
    .await;

    let pipeline = match pipeline {
        Ok(result) => result,
        Err(error) => {
            let snapshot = {
                let mut session = state
                    .session
                    .lock()
                    .map_err(|lock_error| lock_error.to_string())?;
                session.busy_state = BusyState::Idle;
                session.error = Some(error.clone());
                session.snapshot()
            };
            emit_snapshot(&app, &snapshot)?;
            return Err(error);
        }
    };

    let snapshot = {
        let mut session = state.session.lock().map_err(|error| error.to_string())?;
        session.active_dataset = Some(pipeline.dataset.clone());
        session.selection_result = Some(pipeline.selection.clone());
        session.validation_result = Some(pipeline.validation.clone());
        session.busy_state = BusyState::Idle;
        session.error = None;
        session.append_history(format!(
            "Applied descriptor filters. Active matrix now has {} descriptors.",
            pipeline.dataset.descriptors
        ));
        session.append_history(format!(
            "{} selected {} descriptors (Q2 {:.3}).",
            match pipeline.selection.method {
                SelectionMethod::Ops => "OPS",
                SelectionMethod::Ga => "GA",
            },
            pipeline.selection.selected_descriptors,
            pipeline.selection.q2,
        ));
        session.append_history("Validation suite completed.");
        session.append_history("Full pipeline finished with backend results.");
        session.snapshot()
    };

    emit_snapshot(&app, &snapshot)?;
    Ok(snapshot)
}
