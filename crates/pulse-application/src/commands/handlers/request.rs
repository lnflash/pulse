//! Payment request command handler

use async_trait::async_trait;
use pulse_domain::commands::ParsedCommand;
use serde_json;
use std::sync::Arc;
use tracing::{error, info};

use crate::commands::{CommandContext, CommandHandler, CommandResponse};
use crate::errors::ApplicationError;
use crate::ports::FlashApiClient;
use crate::services::AuthService;

pub struct RequestHandler {
    auth_service: Arc<AuthService>,
    flash_api: Arc<dyn FlashApiClient>,
}

impl RequestHandler {
    pub fn new(auth_service: Arc<AuthService>, flash_api: Arc<dyn FlashApiClient>) -> Self {
        Self {
            auth_service,
            flash_api,
        }
    }
}

#[async_trait]
impl CommandHandler for RequestHandler {
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

        // Parse amount if provided (optional for variable amount requests)
        let amount_sats: Option<i64> = if let Some(amount_str) = command.args.get("amount") {
            let unit = command.args.get("unit").map(|s| s.as_str()).unwrap_or("sats");

            let sats = match unit {
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

            if sats <= 0 {
                return Ok(CommandResponse::text("Amount must be greater than 0."));
            }

            Some(sats)
        } else {
            None
        };

        // Get memo if provided
        let memo = command.args.get("memo").map(|s| s.to_string());

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
            amount_sats = ?amount_sats,
            "Creating payment request"
        );

        // Create invoice via Flash API (same as receive, but we call it a "payment request")
        match self.flash_api.create_invoice(&auth_token, amount_sats, memo).await {
            Ok(invoice) => {
                info!(
                    platform = %context.platform,
                    platform_user_id = %context.platform_user_id,
                    payment_hash = %invoice.payment_hash,
                    "Payment request created successfully"
                );

                // Format response message with invoice data embedded in JSON
                let amount_text = if let Some(sats) = invoice.amount_sats {
                    format!("{} sats", sats)
                } else {
                    "Any amount".to_string()
                };

                // Return invoice details as structured JSON in the message for Discord to parse
                let invoice_json = serde_json::json!({
                    "payment_request": invoice.payment_request,
                    "payment_hash": invoice.payment_hash,
                    "amount_sats": invoice.amount_sats,
                    "amount_text": amount_text,
                });

                Ok(CommandResponse::text(format!(
                    "REQUEST:{}\n\n*Payment Request Created*\n\n\
                    Amount: {}\n\
                    Payment Hash: {}\n\n\
                    Payment Request:\n```{}```\n\n\
                    ⚡ Share this QR code or payment request to receive your payment.",
                    serde_json::to_string(&invoice_json).unwrap_or_default(),
                    amount_text,
                    &invoice.payment_hash[..16],
                    invoice.payment_request
                )))
            }
            Err(e) => {
                error!(error = %e, "Failed to create payment request");
                Ok(CommandResponse::text(format!(
                    "*Payment Request Failed*\n\n\
                    Unable to create payment request: {}\n\n\
                    Please check:\n\
                    • Your account is properly linked\n\
                    • You have sufficient permissions\n\
                    • Your connection is stable",
                    e
                )))
            }
        }
    }

    fn command_name(&self) -> &str {
        "request"
    }
}
