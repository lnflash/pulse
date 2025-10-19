//! Flash API response types

use serde::{Deserialize, Serialize};

/// Response from the `me` query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeResponse {
    pub me: Option<User>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub phone: Option<String>,
    pub username: Option<String>,
    #[serde(rename = "defaultAccount")]
    pub default_account: Option<Account>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    #[serde(rename = "defaultWalletId")]
    pub default_wallet_id: String,
    pub wallets: Vec<Wallet>,
    #[serde(rename = "realtimePrice")]
    pub realtime_price: Option<RealtimePrice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Wallet {
    pub id: String,
    pub balance: i64,
    #[serde(rename = "walletCurrency")]
    pub wallet_currency: String,
}

/// Response from the `realtimePrice` query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RealtimePriceResponse {
    #[serde(rename = "realtimePrice")]
    pub realtime_price: RealtimePrice,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RealtimePrice {
    pub id: String,
    pub timestamp: i64,
    #[serde(rename = "denominatorCurrency")]
    pub denominator_currency: String,
    #[serde(rename = "btcSatPrice")]
    pub btc_sat_price: PriceAmount,
    #[serde(rename = "usdCentPrice")]
    pub usd_cent_price: PriceAmount,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceAmount {
    pub base: i64,
    pub offset: i32,
}

impl PriceAmount {
    /// Convert to actual decimal value
    pub fn to_decimal(&self) -> f64 {
        self.base as f64 / 10_f64.powi(self.offset)
    }
}

/// Payment send response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentSendResponse {
    #[serde(rename = "lnInvoicePaymentSend")]
    pub ln_invoice_payment_send: Option<PaymentSendPayload>,
    #[serde(rename = "intraLedgerPaymentSend")]
    pub intra_ledger_payment_send: Option<PaymentSendPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentSendPayload {
    pub errors: Vec<GraphQLError>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphQLError {
    pub message: String,
}

/// Transaction connection response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionConnection {
    pub edges: Vec<TransactionEdge>,
    #[serde(rename = "pageInfo")]
    pub page_info: PageInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionEdge {
    pub cursor: String,
    pub node: Transaction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,
    pub status: String,
    pub direction: String,
    pub memo: Option<String>,
    #[serde(rename = "settlementAmount")]
    pub settlement_amount: i64,
    #[serde(rename = "settlementCurrency")]
    pub settlement_currency: String,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageInfo {
    #[serde(rename = "hasNextPage")]
    pub has_next_page: bool,
    #[serde(rename = "hasPreviousPage")]
    pub has_previous_page: bool,
}

/// Generic GraphQL response wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphQLResponse<T> {
    pub data: Option<T>,
    pub errors: Option<Vec<GraphQLError>>,
}

/// Captcha challenge creation response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptchaCreateChallengeResponse {
    #[serde(rename = "captchaCreateChallenge")]
    pub captcha_create_challenge: CaptchaCreateChallengePayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptchaCreateChallengePayload {
    pub errors: Vec<GraphQLError>,
    pub result: Option<CaptchaChallenge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptchaChallenge {
    pub id: String,
    #[serde(rename = "challengeCode")]
    pub challenge_code: String,
    #[serde(rename = "newCaptcha")]
    pub new_captcha: bool,
    #[serde(rename = "failbackMode")]
    pub failback_mode: bool,
}

/// Request auth code response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptchaRequestAuthCodeResponse {
    #[serde(rename = "captchaRequestAuthCode")]
    pub captcha_request_auth_code: CaptchaRequestAuthCodePayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptchaRequestAuthCodePayload {
    pub errors: Vec<GraphQLError>,
    pub success: Option<bool>,
}

/// User login response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserLoginResponse {
    #[serde(rename = "userLogin")]
    pub user_login: UserLoginPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserLoginPayload {
    pub errors: Vec<GraphQLError>,
    #[serde(rename = "authToken")]
    pub auth_token: Option<String>,
}

/// Transaction list response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionListResponse {
    pub me: Option<TransactionListUser>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionListUser {
    pub id: String,
    #[serde(rename = "defaultAccount")]
    pub default_account: Option<TransactionListAccount>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionListAccount {
    pub id: String,
    pub transactions: TransactionConnection,
}
