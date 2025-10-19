//! # Pulse Application Layer
//!
//! This crate contains the use cases and application services that orchestrate
//! the domain logic. It depends on the domain layer and defines ports
//! (interfaces) that the infrastructure layer must implement.

pub mod commands;
pub mod services;
pub mod ports;
pub mod errors;
pub mod dtos;

// Re-export commonly used types
pub use errors::ApplicationError;
pub use dtos::*;
