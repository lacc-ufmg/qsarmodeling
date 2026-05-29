use thiserror::Error;

#[derive(Debug, Error)]
pub enum QsarError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("CSV error: {0}")]
    Csv(#[from] csv::Error),
    #[error("Unknown session: {0}")]
    MissingSession(String),
    #[error("Invalid dataset: {0}")]
    InvalidDataset(String),
    #[error("Filtering removed every descriptor.")]
    EmptyFilterResult,
    #[error("Non-numeric value in column '{column}' at row {row}: {value}")]
    NonNumericValue {
        column: String,
        row: usize,
        value: String,
    },
}

pub type Result<T> = std::result::Result<T, QsarError>;
