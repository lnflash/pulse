//! Transaction history command handler

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use pulse_domain::commands::ParsedCommand;
use serde_json;
use std::sync::Arc;
use tracing::{error, info};

use crate::commands::{CommandContext, CommandHandler, CommandResponse};
use crate::errors::ApplicationError;
use crate::ports::FlashApiClient;
use crate::services::AuthService;

pub struct HistoryHandler {
    auth_service: Arc<AuthService>,
    flash_api: Arc<dyn FlashApiClient>,
}

impl HistoryHandler {
    pub fn new(auth_service: Arc<AuthService>, flash_api: Arc<dyn FlashApiClient>) -> Self {
        Self {
            auth_service,
            flash_api,
        }
    }
}

#[async_trait]
impl CommandHandler for HistoryHandler {
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

        // Parse limit from args
        let limit: i32 = command
            .args
            .get("limit")
            .and_then(|s| s.parse().ok())
            .unwrap_or(10);

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
            limit = %limit,
            "Fetching transaction history"
        );

        // Fetch transactions from Flash API
        match self.flash_api.get_transactions(&auth_token, Some(limit), None).await {
            Ok(transactions) => {
                info!(
                    platform = %context.platform,
                    platform_user_id = %context.platform_user_id,
                    count = %transactions.len(),
                    "Fetched transaction history"
                );

                if transactions.is_empty() {
                    return Ok(CommandResponse::text(
                        "*Transaction History*\n\nNo transactions found."
                    ));
                }

                // Return transactions as JSON embedded in message for Discord to parse
                let transactions_json = serde_json::to_string(&transactions).unwrap_or_default();

                // Build text response
                let mut response = format!("TRANSACTIONS:{}\n\n*Transaction History*\n\n", transactions_json);

                for tx in transactions.iter() {
                    let direction_emoji = if tx.direction == "SEND" { "📤" } else { "📥" };
                    let amount_display = if tx.direction == "SEND" {
                        format!("-{} sats", tx.settlement_amount)
                    } else {
                        format!("+{} sats", tx.settlement_amount)
                    };

                    let timestamp = DateTime::from_timestamp(tx.created_at, 0)
                        .unwrap_or_else(|| Utc::now())
                        .format("%Y-%m-%d %H:%M")
                        .to_string();

                    let memo_text = tx.memo.as_deref().unwrap_or("No memo");

                    response.push_str(&format!(
                        "{} {} | {} | {}\n",
                        direction_emoji,
                        amount_display,
                        memo_text,
                        timestamp
                    ));
                }

                Ok(CommandResponse::text(response))
            }
            Err(e) => {
                error!(error = %e, "Failed to fetch transactions");
                Ok(CommandResponse::text(format!(
                    "*Failed to Fetch History*\n\n\
                    Unable to fetch transaction history: {}\n\n\
                    Please try again later.",
                    e
                )))
            }
        }
    }

    fn command_name(&self) -> &str {
        "history"
    }
}
