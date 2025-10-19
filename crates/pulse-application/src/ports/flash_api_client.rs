//! Flash API client port

use async_trait::async_trait;
use crate::errors::ApplicationError;
use crate::dtos::{UserDto, RealtimePriceDto, InvoiceDto, TransactionDto};

#[async_trait]
pub trait FlashApiClient: Send + Sync {
    /// Get user information and wallets using an auth token
    async fn get_me(&self, auth_token: Option<&str>) -> Result<Option<UserDto>, ApplicationError>;

    /// Get real-time BTC price
    async fn get_realtime_price(&self, currency: Option<&str>) -> Result<RealtimePriceDto, ApplicationError>;

    /// Get wallet balance
    async fn get_balance(&self, auth_token: &str) -> Result<i64, ApplicationError>;

    /// Send a payment
    async fn send_payment(
        &self,
        auth_token: &str,
        recipient: &str,
        amount_sats: i64,
        memo: Option<String>,
    ) -> Result<String, ApplicationError>;

    /// Request OTP auth code for phone number
    /// Returns true if OTP was sent successfully
    async fn request_auth_code(&self, phone: &str) -> Result<bool, ApplicationError>;

    /// Login with phone number and OTP code
    /// Returns auth token on success
    async fn user_login(&self, phone: &str, code: &str) -> Result<String, ApplicationError>;

    /// Create a Lightning invoice
    /// Returns invoice details including payment request
    async fn create_invoice(
        &self,
        auth_token: &str,
        amount_sats: Option<i64>,
        memo: Option<String>,
    ) -> Result<InvoiceDto, ApplicationError>;

    /// Get transaction history
    /// Returns a list of transactions for the user's default account
    async fn get_transactions(
        &self,
        auth_token: &str,
        first: Option<i32>,
        after: Option<&str>,
    ) -> Result<Vec<TransactionDto>, ApplicationError>;
}
