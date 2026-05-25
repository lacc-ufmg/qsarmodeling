use tokio_util::sync::CancellationToken;

pub struct TaskState {
    token: Option<CancellationToken>,
}

impl TaskState {
    pub fn new() -> Self { Self { token: None } }

    /// Inicia uma nova tarefa; cancela a anterior se ainda estiver em execução.
    /// Devolve o token que a tarefa deve checar periodicamente.
    pub fn begin(&mut self) -> CancellationToken {
        if let Some(t) = self.token.take() { t.cancel(); }
        let t = CancellationToken::new();
        self.token = Some(t.clone());
        t
    }

    pub fn cancel(&mut self) {
        if let Some(t) = self.token.take() { t.cancel(); }
    }

    pub fn is_running(&self) -> bool {
        self.token.as_ref().map_or(false, |t| !t.is_cancelled())
    }
}
