//! # Pulse Domain Layer
//!
//! This crate contains the pure business logic and domain models for the Pulse
//! WhatsApp Bitcoin wallet bot. It has no external dependencies and defines
//! the core types, traits, and business rules.

pub mod models;
pub mod errors;
pub mod traits;
pub mod commands;

// Re-export commonly used types
pub use errors::DomainError;
