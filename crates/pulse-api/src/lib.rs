//! # Pulse API Layer
//!
//! This crate contains the HTTP/WebSocket API implementation using Axum.
//! It handles incoming requests, webhooks, and provides the admin dashboard API.

pub mod handlers;
pub mod middleware;
pub mod routes;
pub mod errors;
pub mod state;

// Re-export commonly used types
pub use errors::ApiError;
pub use state::AppState;
