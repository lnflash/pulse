//! Verify OTP command handler

use async_trait::async_trait;
use pulse_domain::commands::ParsedCommand;
use std::sync::Arc;
use tracing::{error, info};

use crate::commands::{CommandContext, CommandHandler, CommandResponse};
use crate::errors::ApplicationError;
use crate::services::AuthService;

pub struct VerifyHandler {
    auth_service: Arc<AuthService>,
}

impl VerifyHandler {
    pub fn new(auth_service: Arc<AuthService>) -> Self {
        Self { auth_service }
    }
}

#[async_trait]
impl CommandHandler for VerifyHandler {
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

        // Get OTP code from command arguments
        let otp_code = command.args.get("code")
            .ok_or_else(|| ApplicationError::Internal("Missing OTP code".to_string()))?;

        info!(
            platform = %context.platform,
            platform_user_id = %context.platform_user_id,
            "Verifying OTP code"
        );

        // Verify OTP and complete account linking
        match self.auth_service.verify_otp_and_link(
            context.platform,
            &context.platform_user_id,
            otp_code
        ).await {
            Ok(session) => {
                info!(
                    platform = %context.platform,
                    platform_user_id = %context.platform_user_id,
                    flash_user_id = ?session.flash_user_id,
                    "Successfully verified OTP and linked Flash account"
                );

                Ok(CommandResponse::text(
                    "*Account Linked Successfully!*\n\n\
                    Your Flash account is now connected.\n\n\
                    Try these commands:\n\
                    • `balance` - Check your wallet balance\n\
                    • `price` - Get current Bitcoin price\n\
                    • `send` - Send Bitcoin\n\
                    • `help` - See all commands"
                ))
            }
            Err(e) => {
                error!(
                    error = %e,
                    platform = %context.platform,
                    platform_user_id = %context.platform_user_id,
                    "Failed to verify OTP code"
                );

                Ok(CommandResponse::text(format!(
                    "*Verification Failed*\n\n\
                    Unable to verify your code: {}\n\n\
                    Please make sure you entered the correct code.\n\n\
                    To try again:\n\
                    1. Request a new code: `link <phone>`\n\
                    2. Enter the code: `verify <code>`",
                    e
                )))
            }
        }
    }

    fn command_name(&self) -> &str {
        "verify"
    }
}
