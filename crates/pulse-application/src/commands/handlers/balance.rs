//! Balance command handler

use async_trait::async_trait;
use pulse_domain::commands::ParsedCommand;
use std::sync::Arc;
use tracing::error;

use crate::commands::{CommandContext, CommandHandler, CommandResponse};
use crate::errors::ApplicationError;
use crate::ports::FlashApiClient;
use crate::services::AuthService;

pub struct BalanceHandler {
    auth_service: Arc<AuthService>,
    flash_api: Arc<dyn FlashApiClient>,
}

impl BalanceHandler {
    pub fn new(auth_service: Arc<AuthService>, flash_api: Arc<dyn FlashApiClient>) -> Self {
        Self {
            auth_service,
            flash_api,
        }
    }
}

#[async_trait]
impl CommandHandler for BalanceHandler {
    async fn handle(
        &self,
        _command: &ParsedCommand,
        context: &CommandContext,
    ) -> Result<CommandResponse, ApplicationError> {
        // Check if user is authenticated
        if !context.is_verified() {
            return Ok(CommandResponse::text(
                "You need to link your account first. Send `link <your-token>` to get started."
            ));
        }

        // Get auth token from session
        let auth_token = match self.auth_service.get_auth_token(context.platform, &context.platform_user_id).await {
            Ok(token) => token,
            Err(e) => {
                error!(error = %e, "Failed to get auth token");
                return Ok(CommandResponse::text(
                    "Session expired. Please link your account again with `link <your-token>`"
                ));
            }
        };

        // Fetch balance from Flash API
        match self.flash_api.get_balance(&auth_token).await {
            Ok(balance_sats) => {
                let balance_btc = balance_sats as f64 / 100_000_000.0;

                Ok(CommandResponse::text(format!(
                    "*Your Balance*\n\n\
                    {} sats\n\
                    {:.8} BTC",
                    balance_sats,
                    balance_btc
                )))
            }
            Err(e) => {
                error!(error = %e, "Failed to fetch balance");
                Ok(CommandResponse::text(
                    "Sorry, I couldn't fetch your balance right now. Please try again later."
                ))
            }
        }
    }

    fn command_name(&self) -> &str {
        "balance"
    }
}
