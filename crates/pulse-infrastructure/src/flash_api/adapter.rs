//! Flash API adapter
//!
//! Implements the FlashApiClient port from the application layer

use async_trait::async_trait;
use pulse_application::dtos::{
    AccountDto, PriceAmountDto, RealtimePriceDto, UserDto, WalletDto,
};
use pulse_application::ports::FlashApiClient as FlashApiPort;
use pulse_application::ApplicationError;

use super::client::FlashApiClient;
use super::types::{Account, PriceAmount, RealtimePrice, User, Wallet};

/// Adapter that implements the application port using the infrastructure client
pub struct FlashApiAdapter {
    client: FlashApiClient,
}

impl FlashApiAdapter {
    pub fn new(client: FlashApiClient) -> Self {
        Self { client }
    }
}

#[async_trait]
impl FlashApiPort for FlashApiAdapter {
    async fn get_me(
        &self,
        auth_token: Option<&str>,
    ) -> Result<Option<UserDto>, ApplicationError> {
        let user = self.client.get_me(auth_token).await.map_err(|e| {
            ApplicationError::External(format!("Flash API error: {}", e))
        })?;

        Ok(user.map(convert_user_to_dto))
    }

    async fn get_realtime_price(
        &self,
        currency: Option<&str>,
    ) -> Result<RealtimePriceDto, ApplicationError> {
        let price = self.client.get_realtime_price(currency).await.map_err(|e| {
            ApplicationError::External(format!("Flash API error: {}", e))
        })?;

        Ok(convert_price_to_dto(price))
    }

    async fn get_balance(&self, auth_token: &str) -> Result<i64, ApplicationError> {
        // Get user info to access wallet balance
        let user = self
            .client
            .get_me(Some(auth_token))
            .await
            .map_err(|e| ApplicationError::External(format!("Flash API error: {}", e)))?
            .ok_or_else(|| ApplicationError::NotFound("User not found".to_string()))?;

        // Get balance from default wallet
        let balance = user
            .default_account
            .and_then(|account| {
                account.wallets.into_iter().find(|w| w.id == account.default_wallet_id)
            })
            .map(|wallet| wallet.balance)
            .unwrap_or(0);

        Ok(balance)
    }

    async fn send_payment(
        &self,
        auth_token: &str,
        recipient: &str,
        amount_sats: i64,
        memo: Option<String>,
    ) -> Result<String, ApplicationError> {
        // Get user info to access wallet ID
        let user = self
            .client
            .get_me(Some(auth_token))
            .await
            .map_err(|e| ApplicationError::External(format!("Flash API error: {}", e)))?
            .ok_or_else(|| ApplicationError::NotFound("User not found".to_string()))?;

        let wallet_id = user
            .default_account
            .as_ref()
            .ok_or_else(|| ApplicationError::NotFound("No default account found".to_string()))?
            .default_wallet_id
            .clone();

        // Check if recipient is a lightning invoice or wallet ID
        if recipient.starts_with("lnbc") || recipient.starts_with("lntb") {
            // Lightning invoice payment
            self.client
                .send_lightning_payment(&wallet_id, recipient, memo.as_deref(), auth_token)
                .await
                .map_err(|e| ApplicationError::External(format!("Payment failed: {}", e)))
        } else {
            // Intra-ledger payment (to another Flash wallet)
            self.client
                .send_intraledger_payment(
                    &wallet_id,
                    recipient,
                    amount_sats,
                    memo.as_deref(),
                    auth_token,
                )
                .await
                .map_err(|e| ApplicationError::External(format!("Payment failed: {}", e)))
        }
    }

    async fn request_auth_code(&self, phone: &str) -> Result<bool, ApplicationError> {
        self.client.request_auth_code(phone).await.map_err(|e| {
            ApplicationError::External(format!("Flash API error: {}", e))
        })
    }

    async fn user_login(&self, phone: &str, code: &str) -> Result<String, ApplicationError> {
        self.client.user_login(phone, code).await.map_err(|e| {
            ApplicationError::External(format!("Flash API error: {}", e))
        })
    }
}

// Conversion functions

fn convert_user_to_dto(user: User) -> UserDto {
    UserDto {
        id: user.id,
        phone: user.phone,
        username: user.username,
        default_account: user.default_account.map(convert_account_to_dto),
    }
}

fn convert_account_to_dto(account: Account) -> AccountDto {
    AccountDto {
        id: account.id,
        default_wallet_id: account.default_wallet_id,
        wallets: account.wallets.into_iter().map(convert_wallet_to_dto).collect(),
    }
}

fn convert_wallet_to_dto(wallet: Wallet) -> WalletDto {
    WalletDto {
        id: wallet.id,
        balance: wallet.balance,
        wallet_currency: wallet.wallet_currency,
    }
}

fn convert_price_to_dto(price: RealtimePrice) -> RealtimePriceDto {
    RealtimePriceDto {
        id: price.id,
        timestamp: price.timestamp,
        btc_sat_price: convert_price_amount_to_dto(price.btc_sat_price),
        usd_cent_price: convert_price_amount_to_dto(price.usd_cent_price),
    }
}

fn convert_price_amount_to_dto(amount: PriceAmount) -> PriceAmountDto {
    PriceAmountDto {
        base: amount.base,
        offset: amount.offset,
    }
}
