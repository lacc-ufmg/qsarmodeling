use polars::prelude::PolarsError;
use serde;
use serde_json;
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum QsarError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("CSV error: {0}")]
    Csv(#[from] csv::Error),
    #[error("Polars error: {0}")]
    Polars(#[from] PolarsError),
    #[error("Unknown session: {0}")]
    MissingSession(String),
    #[error("Invalid dataset: {0}")]
    InvalidDataset(String),
    #[error("Filtering removed every descriptor.")]
    EmptyFilterResult,
    #[error("Non-numeric value in column '{column}' at row {row}: {value}")]
    NonNumericValue { column: String, row: usize, value: String },
}

pub type Result<T> = std::result::Result<T, QsarError>;


#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AppError {
    #[error("I/O: {message}")]
    Io { message: String },

    #[error("CSV parse: {message}")]
    CsvParse { message: String },

    #[error("Dimensões inconsistentes: X tem {x_samples} amostras, y tem {y_samples}")]
    DimensionMismatch { x_samples: usize, y_samples: usize },

    /// Operação exige um estágio mínimo que ainda não foi atingido.
    #[error("Pipeline insuficiente: requer estágio '{required}'")]
    InsufficientPipeline { required: String },

    #[error("Tarefa cancelada pelo usuário")]
    Cancelled,

    #[error("Erro de cálculo: {message}")]
    Computation { message: String },
}

// Necessário para retornar AppError em comandos Tauri.
impl From<AppError> for tauri::ipc::InvokeError {
    fn from(e: AppError) -> Self {
        serde_json::to_value(&e)
            .map(Self::from)
            .unwrap_or_else(|_| Self::from(e.to_string()))
    }
}
