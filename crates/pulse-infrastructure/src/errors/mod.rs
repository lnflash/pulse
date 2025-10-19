//! Infrastructure errors

use thiserror::Error;

#[derive(Error, Debug)]
pub enum InfrastructureError {
    #[error("Redis error: {0}")]
    Redis(String),

    #[error("GraphQL error: {0}")]
    GraphQL(String),

    #[error("HTTP error: {0}")]
    Http(String),

    #[error("WhatsApp error: {0}")]
    WhatsApp(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Serialization error: {0}")]
    Serialization(String),
}

// Implement conversion to ApplicationError
impl From<InfrastructureError> for pulse_application::errors::ApplicationError {
    fn from(err: InfrastructureError) -> Self {
        pulse_application::errors::ApplicationError::Infrastructure(err.to_string())
    }
}
