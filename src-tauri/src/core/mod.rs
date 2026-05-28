pub mod error;
pub mod filter;
pub mod loader;
pub mod session;
pub mod types;
pub mod ops;
pub mod ga;
pub mod commands;
pub mod stats;
pub mod pls;

pub use filter::*;
pub use loader::{load_dataset, RawDataset};
// pub use types::{FilterSettings, SelectionSettings};
// pub use ops::run_ops;

// #[cfg(test)]
// mod tests;
