//! Command handler trait

use async_trait::async_trait;
use pulse_domain::commands::ParsedCommand;

use crate::errors::ApplicationError;
use super::context::CommandContext;

/// Response from a command handler
#[derive(Debug, Clone)]
pub struct CommandResponse {
    /// Response message to send to user
    pub message: String,

    /// Whether to send media (e.g., QR code image)
    pub media: Option<CommandMedia>,
}

#[derive(Debug, Clone)]
pub enum CommandMedia {
    /// QR code image data
    QrCode(Vec<u8>),

    /// Chart or graph image
    Chart(Vec<u8>),
}

impl CommandResponse {
    pub fn text(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            media: None,
        }
    }

    pub fn with_media(message: impl Into<String>, media: CommandMedia) -> Self {
        Self {
            message: message.into(),
            media: Some(media),
        }
    }
}

/// Command handler trait
///
/// All command handlers implement this trait, receiving a parsed command
/// and execution context, and returning a response.
#[async_trait]
pub trait CommandHandler: Send + Sync {
    /// Handle a command with the given context
    async fn handle(
        &self,
        command: &ParsedCommand,
        context: &CommandContext,
    ) -> Result<CommandResponse, ApplicationError>;

    /// Get the command name for logging/debugging
    fn command_name(&self) -> &str;
}
