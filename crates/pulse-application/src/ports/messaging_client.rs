//! Generic messaging client port for multi-platform support

use async_trait::async_trait;
use pulse_domain::models::Platform;
use crate::errors::ApplicationError;

/// Generic messaging client that can work with any platform (WhatsApp, Discord, Telegram, etc.)
#[async_trait]
pub trait MessagingClient: Send + Sync {
    /// Get the platform this client handles
    fn platform(&self) -> Platform;

    /// Send a text message to a user
    async fn send_message(&self, to: &str, message: &str) -> Result<(), ApplicationError>;

    /// Send media (image, video, etc.) with optional caption
    async fn send_media(
        &self,
        to: &str,
        media_data: &[u8],
        media_type: MediaType,
        caption: Option<String>,
    ) -> Result<(), ApplicationError>;
}

/// Types of media that can be sent
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaType {
    Image,
    Video,
    Audio,
    Document,
}
