//! API errors

use thiserror::Error;
use pulse_application::errors::ApplicationError;

#[derive(Error, Debug)]
pub enum ApiError {
    #[error("Application error: {0}")]
    Application(#[from] ApplicationError),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Internal server error")]
    Internal,
}
