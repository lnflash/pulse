//! Pay Lightning invoice command handler

use async_trait::async_trait;
use pulse_domain::commands::ParsedCommand;
use std::sync::Arc;
use tracing::{error, info};

use crate::commands::{CommandContext, CommandHandler, CommandResponse};
use crate::errors::ApplicationError;
use crate::ports::FlashApiClient;
use crate::services::AuthService;

pub struct PayHandler {
    auth_service: Arc<AuthService>,
    flash_api: Arc<dyn FlashApiClient>,
}

impl PayHandler {
    pub fn new(auth_service: Arc<AuthService>, flash_api: Arc<dyn FlashApiClient>) -> Self {
        Self {
            auth_service,
            flash_api,
        }
    }
}

#[async_trait]
impl CommandHandler for PayHandler {
    async fn handle(
        &self,
        command: &ParsedCommand,
        context: &CommandContext,
    ) -> Result<CommandResponse, ApplicationError> {
        // Check if user is authenticated
        if !context.is_verified() {
            return Ok(CommandResponse::text(
                "You need to link your account first. Send `link <phone-number>` to get started."
            ));
        }

        // Extract Lightning invoice from arguments
        let invoice = command.args.get("invoice")
            .ok_or_else(|| ApplicationError::Internal("Missing invoice".to_string()))?;

        // Validate invoice format (must start with lnbc or lntb)
        if !invoice.to_lowercase().starts_with("lnbc") && !invoice.to_lowercase().starts_with("lntb") {
            return Ok(CommandResponse::text(
                "*Invalid Invoice*\n\n\
                The provided string doesn't appear to be a valid Lightning invoice.\n\n\
                Lightning invoices start with 'lnbc' (mainnet) or 'lntb' (testnet).\n\n\
                Please check the invoice and try again."
            ));
        }

        // Get auth token from session
        let auth_token = match self.auth_service.get_auth_token(context.platform, &context.platform_user_id).await {
            Ok(token) => token,
            Err(e) => {
                error!(error = %e, "Failed to get auth token");
                return Ok(CommandResponse::text(
                    "Session expired. Please link your account again."
                ));
            }
        };

        info!(
            platform = %context.platform,
            platform_user_id = %context.platform_user_id,
            invoice_prefix = &invoice[..15],
            "Paying Lightning invoice"
        );

        // Pay invoice via Flash API (send_payment handles Lightning invoices)
        match self.flash_api.send_payment(&auth_token, invoice, 0, None).await {
            Ok(status) => {
                info!(
                    platform = %context.platform,
                    platform_user_id = %context.platform_user_id,
                    status = %status,
                    "Lightning invoice paid successfully"
                );

                Ok(CommandResponse::text(format!(
                    "*Payment Sent!*\n\n\
                    Invoice: {}...\n\
                    Status: {}\n\n\
                    ✅ Your Lightning payment has been processed.",
                    &invoice[..20],
                    status
                )))
            }
            Err(e) => {
                error!(error = %e, "Failed to pay invoice");
                Ok(CommandResponse::text(format!(
                    "*Payment Failed*\n\n\
                    Unable to pay invoice: {}\n\n\
                    Please check:\n\
                    • You have sufficient balance\n\
                    • The invoice is valid and not expired\n\
                    • Your connection is stable",
                    e
                )))
            }
        }
    }

    fn command_name(&self) -> &str {
        "pay"
    }
}
