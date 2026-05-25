pub mod pipeline;
pub mod task;
use tokio::sync::Mutex;

pub use pipeline::*;
pub use task::*;

pub struct AppState {
    pub pipeline: Mutex<PipelineState>,
    pub task: Mutex<TaskState>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            pipeline: Mutex::new(PipelineState::new()),
            task: Mutex::new(TaskState::new()),
        }
    }
}
