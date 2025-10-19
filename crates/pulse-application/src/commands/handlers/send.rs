//! Send payment command handler

use async_trait::async_trait;
use pulse_domain::commands::ParsedCommand;
use std::sync::Arc;
use tracing::{error, info};

use crate::commands::{CommandContext, CommandHandler, CommandResponse};
use crate::errors::ApplicationError;
use crate::ports::FlashApiClient;
use crate::services::AuthService;

pub struct SendHandler {
    auth_service: Arc<AuthService>,
    flash_api: Arc<dyn FlashApiClient>,
}

impl SendHandler {
    pub fn new(auth_service: Arc<AuthService>, flash_api: Arc<dyn FlashApiClient>) -> Self {
        Self {
            auth_service,
            flash_api,
        }
    }
}

#[async_trait]
impl CommandHandler for SendHandler {
    async fn handle(
        &self,
        command: &ParsedCommand,
        context: &CommandContext,
    ) -> Result<CommandResponse, ApplicationError> {
        // Check if user is authenticated
        if !context.is_verified() {
            return Ok(CommandResponse::text(
                "You need to link your account first. Send `link <your-token>` to get started."
            ));
        }

        // Extract arguments
        let amount_str = command.args.get("amount")
            .ok_or_else(|| ApplicationError::Internal("Missing amount".to_string()))?;
        let unit = command.args.get("unit").map(|s| s.as_str()).unwrap_or("sats");
        let recipient = command.args.get("recipient")
            .ok_or_else(|| ApplicationError::Internal("Missing recipient".to_string()))?;
        let memo = command.args.get("memo").map(|s| s.to_string());

        // Parse amount to sats
        let amount_sats: i64 = match unit {
            "sats" | "sat" => amount_str.parse().map_err(|_| {
                ApplicationError::Internal(format!("Invalid amount: {}", amount_str))
            })?,
            "btc" => {
                let btc: f64 = amount_str.parse().map_err(|_| {
                    ApplicationError::Internal(format!("Invalid BTC amount: {}", amount_str))
                })?;
                (btc * 100_000_000.0) as i64
            }
            _ => {
                return Ok(CommandResponse::text(format!(
                    "Invalid unit '{}'. Use 'sats' or 'btc'.",
                    unit
                )));
            }
        };

        if amount_sats <= 0 {
            return Ok(CommandResponse::text("Amount must be greater than 0."));
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

        info!(
            platform = %context.platform,
            platform_user_id = %context.platform_user_id,
            recipient = %recipient,
            amount_sats = %amount_sats,
            "Sending payment"
        );

        // Send payment via Flash API
        match self.flash_api.send_payment(&auth_token, recipient, amount_sats, memo).await {
            Ok(status) => {
                info!(
                    platform = %context.platform,
                    platform_user_id = %context.platform_user_id,
                    status = %status,
                    "Payment sent successfully"
                );

                Ok(CommandResponse::text(format!(
                    "*Payment Sent!*\n\n\
                    Amount: {} sats\n\
                    To: {}\n\
                    Status: {}\n\n\
                    ✅ Your payment has been processed.",
                    amount_sats,
                    recipient,
                    status
                )))
            }
            Err(e) => {
                error!(error = %e, "Failed to send payment");
                Ok(CommandResponse::text(format!(
                    "*Payment Failed*\n\n\
                    Unable to send payment: {}\n\n\
                    Please check:\n\
                    • You have sufficient balance\n\
                    • The recipient address is valid\n\
                    • Your connection is stable",
                    e
                )))
            }
        }
    }

    fn command_name(&self) -> &str {
        "send"
    }
}
