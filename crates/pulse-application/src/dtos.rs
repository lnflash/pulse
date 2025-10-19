//! Data Transfer Objects
//!
//! DTOs used for communication between application and infrastructure layers

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserDto {
    pub id: String,
    pub phone: Option<String>,
    pub username: Option<String>,
    pub default_account: Option<AccountDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountDto {
    pub id: String,
    pub default_wallet_id: String,
    pub wallets: Vec<WalletDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletDto {
    pub id: String,
    pub balance: i64,
    pub wallet_currency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RealtimePriceDto {
    pub id: String,
    pub timestamp: i64,
    pub btc_sat_price: PriceAmountDto,
    pub usd_cent_price: PriceAmountDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceAmountDto {
    pub base: i64,
    pub offset: i32,
}

impl PriceAmountDto {
    pub fn to_decimal(&self) -> f64 {
        self.base as f64 / 10_f64.powi(self.offset)
    }
}
