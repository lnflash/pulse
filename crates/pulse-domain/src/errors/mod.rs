//! Domain errors
//!
//! Error types for domain-level operations

use thiserror::Error;

#[derive(Error, Debug)]
pub enum DomainError {
    #[error("Validation error: {0}")]
    ValidationError(String),

    #[error("Invalid phone number: {0}")]
    InvalidPhoneNumber(String),

    #[error("Invalid amount: {0}")]
    InvalidAmount(String),

    #[error("Invalid command: {0}")]
    InvalidCommand(String),

    #[error("Session expired")]
    SessionExpired,

    #[error("Invalid OTP")]
    InvalidOtp,

    #[error("Unknown error: {0}")]
    Unknown(String),
}
