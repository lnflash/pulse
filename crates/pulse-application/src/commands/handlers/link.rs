//! Link account command handler

use async_trait::async_trait;
use pulse_domain::commands::ParsedCommand;
use std::sync::Arc;
use tracing::{error, info};

use crate::commands::{CommandContext, CommandHandler, CommandResponse};
use crate::errors::ApplicationError;
use crate::services::AuthService;

pub struct LinkHandler {
    auth_service: Arc<AuthService>,
}

impl LinkHandler {
    pub fn new(auth_service: Arc<AuthService>) -> Self {
        Self { auth_service }
    }
}

#[async_trait]
impl CommandHandler for LinkHandler {
    async fn handle(
        &self,
        command: &ParsedCommand,
        context: &CommandContext,
    ) -> Result<CommandResponse, ApplicationError> {
        // Check if already linked
        if context.is_verified() {
            return Ok(CommandResponse::text(
                "You're already linked! Type 'help' to see available commands."
            ));
        }

        // Get phone number from command arguments
        let phone = command.args.get("phone")
            .ok_or_else(|| ApplicationError::Internal("Missing phone number".to_string()))?;

        info!(
            platform = %context.platform,
            platform_user_id = %context.platform_user_id,
            phone = %phone,
            "Requesting OTP code for phone number"
        );

        // Request OTP code from Flash API
        match self.auth_service.request_otp_code(context.platform, &context.platform_user_id, phone).await {
            Ok(_) => {
                info!(
                    platform = %context.platform,
                    platform_user_id = %context.platform_user_id,
                    phone = %phone,
                    "OTP code sent successfully"
                );

                Ok(CommandResponse::text(format!(
                    "*OTP Code Sent*\n\n\
                    A verification code has been sent to {}.\n\n\
                    Please check your phone and reply with:\n\
                    `verify <code>`\n\n\
                    Example: `verify 123456`",
                    phone
                )))
            }
            Err(e) => {
                error!(
                    error = %e,
                    platform = %context.platform,
                    platform_user_id = %context.platform_user_id,
                    phone = %phone,
                    "Failed to request OTP code"
                );

                Ok(CommandResponse::text(format!(
                    "*OTP Request Failed*\n\n\
                    Unable to send verification code: {}\n\n\
                    Please make sure you're using a valid phone number in international format.\n\n\
                    Example: `link +1234567890`",
                    e
                )))
            }
        }
    }

    fn command_name(&self) -> &str {
        "link"
    }
}
