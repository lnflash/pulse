//! Price command handler

use async_trait::async_trait;
use pulse_domain::commands::ParsedCommand;
use std::sync::Arc;
use tracing::error;

use crate::commands::{CommandContext, CommandHandler, CommandResponse};
use crate::errors::ApplicationError;
use crate::ports::FlashApiClient;

pub struct PriceHandler {
    flash_api: Arc<dyn FlashApiClient>,
}

impl PriceHandler {
    pub fn new(flash_api: Arc<dyn FlashApiClient>) -> Self {
        Self { flash_api }
    }
}

#[async_trait]
impl CommandHandler for PriceHandler {
    async fn handle(
        &self,
        command: &ParsedCommand,
        _context: &CommandContext,
    ) -> Result<CommandResponse, ApplicationError> {
        // Get currency from arguments (default to USD)
        let currency = command
            .args
            .get("currency")
            .map(|s| s.as_str())
            .unwrap_or("USD");

        // Fetch price from Flash API
        match self.flash_api.get_realtime_price(Some(currency)).await {
            Ok(price) => {
                // btcSatPrice = price of 1 satoshi in USD cents
                // To get 1 BTC price: multiply by 100,000,000 sats and divide by 100 to convert cents to dollars
                let sat_price_cents = price.btc_sat_price.to_decimal();
                let btc_price = (sat_price_cents * 100_000_000.0) / 100.0;

                let sats_per_dollar = if btc_price > 0.0 {
                    (100_000_000.0 / btc_price) as i64
                } else {
                    0
                };

                Ok(CommandResponse::text(format!(
                    "*Bitcoin Price*\n\n\
                    1 BTC = ${:.2}\n\
                    $1 = {} sats\n\n\
                    _Updated: {}_",
                    btc_price,
                    sats_per_dollar,
                    chrono::DateTime::from_timestamp(price.timestamp, 0)
                        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S UTC").to_string())
                        .unwrap_or_else(|| "Unknown".to_string())
                )))
            }
            Err(e) => {
                error!(error = %e, "Failed to fetch Bitcoin price");
                Ok(CommandResponse::text(
                    "Sorry, I couldn't fetch the Bitcoin price right now. Please try again later."
                ))
            }
        }
    }

    fn command_name(&self) -> &str {
        "price"
    }
}
