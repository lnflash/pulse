//! Command definitions
//!
//! This module defines the command types that the system can process

pub mod parser;

use serde::{Deserialize, Serialize};

pub use parser::CommandParser;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CommandType {
    Help,
    Balance,
    Link,
    Unlink,
    Verify,
    Consent,
    Refresh,
    Username,
    Price,
    Send,
    Receive,
    History,
    Request,
    Contacts,
    Pay,
    Vybz,
    Admin,
    Pending,
    Voice,
    Settings,
    Undo,
    Template,
    Skip,
    Learn,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedCommand {
    pub command_type: CommandType,
    pub args: std::collections::HashMap<String, String>,
    pub raw_text: String,
}
