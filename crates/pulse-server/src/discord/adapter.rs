//! Discord MessagingClient adapter implementation

use async_trait::async_trait;
use poise::serenity_prelude::{self as serenity, ChannelId, Http};
use pulse_application::errors::ApplicationError;
use pulse_application::ports::{MediaType, MessagingClient};
use pulse_domain::models::Platform;
use std::sync::Arc;
use tracing::{debug, error};

/// Discord adapter implementing MessagingClient trait
///
/// This adapter is reserved for sending messages outside of command responses
/// (e.g., notifications, webhooks, scheduled messages). For command responses,
/// poise's Context handles message sending directly.
#[allow(dead_code)]
pub struct DiscordAdapter {
    http: Arc<Http>,
}

#[allow(dead_code)]
impl DiscordAdapter {
    pub fn new(http: Arc<Http>) -> Self {
        Self { http }
    }

    /// Helper to send a message to a Discord channel
    async fn send_to_channel(
        &self,
        channel_id: &str,
        content: &str,
    ) -> Result<(), ApplicationError> {
        let channel_id: u64 = channel_id.parse().map_err(|_| {
            ApplicationError::Internal(format!("Invalid Discord channel ID: {}", channel_id))
        })?;

        let channel = ChannelId::new(channel_id);

        channel
            .say(&self.http, content)
            .await
            .map_err(|e| {
                error!(error = %e, "Failed to send Discord message");
                ApplicationError::Internal(format!("Failed to send Discord message: {}", e))
            })?;

        debug!(channel_id = %channel_id, "Discord message sent successfully");
        Ok(())
    }
}

#[async_trait]
impl MessagingClient for DiscordAdapter {
    fn platform(&self) -> Platform {
        Platform::Discord
    }

    async fn send_message(&self, to: &str, message: &str) -> Result<(), ApplicationError> {
        self.send_to_channel(to, message).await
    }

    async fn send_media(
        &self,
        to: &str,
        media_data: &[u8],
        media_type: MediaType,
        caption: Option<String>,
    ) -> Result<(), ApplicationError> {
        let channel_id: u64 = to.parse().map_err(|_| {
            ApplicationError::Internal(format!("Invalid Discord channel ID: {}", to))
        })?;

        let channel = ChannelId::new(channel_id);

        // Determine file extension based on media type
        let (filename, extension) = match media_type {
            MediaType::Image => ("image", "png"),
            MediaType::Video => ("video", "mp4"),
            MediaType::Audio => ("audio", "mp3"),
            MediaType::Document => ("document", "pdf"),
        };

        let full_filename = format!("{}.{}", filename, extension);

        // Create attachment from media data
        let attachment = serenity::CreateAttachment::bytes(media_data.to_vec(), full_filename);

        // Send as attachment
        channel
            .send_files(
                &self.http,
                vec![attachment],
                serenity::CreateMessage::new().content(caption.unwrap_or_default()),
            )
            .await
            .map_err(|e| {
                error!(error = %e, "Failed to send Discord media");
                ApplicationError::Internal(format!("Failed to send Discord media: {}", e))
            })?;

        debug!(channel_id = %channel_id, "Discord media sent successfully");
        Ok(())
    }
}
