//! Unlink account command handler

use async_trait::async_trait;
use pulse_domain::commands::ParsedCommand;
use std::sync::Arc;
use tracing::{error, info};

use crate::commands::{CommandContext, CommandHandler, CommandResponse};
use crate::errors::ApplicationError;
use crate::services::AuthService;

pub struct UnlinkHandler {
    auth_service: Arc<AuthService>,
}

impl UnlinkHandler {
    pub fn new(auth_service: Arc<AuthService>) -> Self {
        Self { auth_service }
    }
}

#[async_trait]
impl CommandHandler for UnlinkHandler {
    async fn handle(
        &self,
        _command: &ParsedCommand,
        context: &CommandContext,
    ) -> Result<CommandResponse, ApplicationError> {
        // Check if user is authenticated
        if !context.is_authenticated() {
            return Ok(CommandResponse::text(
                "You don't have a linked account. Send `link <your-token>` to get started."
            ));
        }

        info!(
            platform = %context.platform,
            platform_user_id = %context.platform_user_id,
            "Unlinking account"
        );

        // Unlink the account (logout)
        match self.auth_service.logout(context.platform, &context.platform_user_id).await {
            Ok(()) => {
                info!(
                    platform = %context.platform,
                    platform_user_id = %context.platform_user_id,
                    "Account unlinked successfully"
                );
                Ok(CommandResponse::text(
                    "*Account Unlinked*\n\n\
                    Your Flash account has been disconnected and all session data removed.\n\n\
                    Send `link <your-token>` anytime to reconnect."
                ))
            }
            Err(e) => {
                error!(
                    error = %e,
                    platform = %context.platform,
                    platform_user_id = %context.platform_user_id,
                    "Failed to unlink account"
                );
                Ok(CommandResponse::text(
                    "An error occurred while unlinking your account. Please try again."
                ))
            }
        }
    }

    fn command_name(&self) -> &str {
        "unlink"
    }
}
