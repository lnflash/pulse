//! Application state
//!
//! Shared state for the Axum application

use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    // TODO: Add services and repositories
    _placeholder: Arc<()>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            _placeholder: Arc::new(()),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
