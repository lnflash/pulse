//! Payment domain model

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PaymentStatus {
    Pending,
    Confirmed,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PaymentDirection {
    Sent,
    Received,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Payment {
    pub id: Uuid,
    pub whatsapp_id: String,
    pub amount_sats: i64,
    pub recipient: String,
    pub memo: Option<String>,
    pub status: PaymentStatus,
    pub direction: PaymentDirection,
    pub flash_transaction_id: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl Payment {
    pub fn new_send(
        whatsapp_id: String,
        amount_sats: i64,
        recipient: String,
        memo: Option<String>,
    ) -> Self {
        let now = chrono::Utc::now();
        Self {
            id: Uuid::new_v4(),
            whatsapp_id,
            amount_sats,
            recipient,
            memo,
            status: PaymentStatus::Pending,
            direction: PaymentDirection::Sent,
            flash_transaction_id: None,
            created_at: now,
            updated_at: now,
        }
    }
}
