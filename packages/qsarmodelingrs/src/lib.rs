mod error;
mod filter;
mod loader;
mod session;
mod types;
mod ops;

mod domain;
mod state;
mod commands;
mod events;

pub use error::{QsarError, Result};
pub use filter::{autocorrelation_cut, correlation_cut, filter_matrix, variance_cut, FilteredMatrix};
pub use loader::{detect_csv_layout, load_dataset, load_matrix, load_vector, CsvLayout, LoadedMatrix};
pub use session::{FilteredDataset, LoadedDataset, SessionStore};
pub use types::{DatasetProfile, DatasetSource, FilterSettings, SelectionSettings, SelectionResult};
pub use ops::run_ops;

#[cfg(test)]
mod tests;
