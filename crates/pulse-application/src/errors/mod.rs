//! Application errors

use thiserror::Error;
use pulse_domain::errors::DomainError;

#[derive(Error, Debug)]
pub enum ApplicationError {
    #[error("Domain error: {0}")]
    Domain(#[from] DomainError),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Authentication failed: {0}")]
    Authentication(String),

    #[error("External service error: {0}")]
    ExternalService(String),

    #[error("External API error: {0}")]
    External(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Infrastructure error: {0}")]
    Infrastructure(String),
}
