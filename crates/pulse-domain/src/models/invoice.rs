//! Invoice domain model

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::Platform;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum InvoiceStatus {
    Pending,
    Paid,
    Expired,
    Cancelled,
}

/// Represents a Lightning invoice created for payment requests
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Invoice {
    /// Unique identifier for this invoice
    pub id: Uuid,

    /// Platform where the invoice was created (Discord, WhatsApp, etc.)
    pub platform: Platform,

    /// Platform-specific user ID of the invoice creator
    pub creator_id: String,

    /// Optional recipient ID if the invoice was sent to a specific user
    pub recipient_id: Option<String>,

    /// Lightning payment request (invoice string)
    pub payment_request: String,

    /// Payment hash for tracking
    pub payment_hash: String,

    /// Amount in satoshis (None for variable amount invoices)
    pub amount_sats: Option<i64>,

    /// Optional memo/description
    pub memo: Option<String>,

    /// Invoice status
    pub status: InvoiceStatus,

    /// When the invoice was created
    pub created_at: chrono::DateTime<chrono::Utc>,

    /// When the invoice was last updated
    pub updated_at: chrono::DateTime<chrono::Utc>,

    /// When the invoice expires (typically 24 hours from creation)
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

impl Invoice {
    /// Create a new pending invoice
    pub fn new(
        platform: Platform,
        creator_id: String,
        payment_request: String,
        payment_hash: String,
        amount_sats: Option<i64>,
        memo: Option<String>,
    ) -> Self {
        let now = chrono::Utc::now();
        let expires_at = now + chrono::Duration::hours(24);

        Self {
            id: Uuid::new_v4(),
            platform,
            creator_id,
            recipient_id: None,
            payment_request,
            payment_hash,
            amount_sats,
            memo,
            status: InvoiceStatus::Pending,
            created_at: now,
            updated_at: now,
            expires_at,
        }
    }

    /// Mark invoice as paid
    pub fn mark_paid(&mut self) {
        self.status = InvoiceStatus::Paid;
        self.updated_at = chrono::Utc::now();
    }

    /// Mark invoice as expired
    pub fn mark_expired(&mut self) {
        self.status = InvoiceStatus::Expired;
        self.updated_at = chrono::Utc::now();
    }

    /// Mark invoice as cancelled
    pub fn mark_cancelled(&mut self) {
        self.status = InvoiceStatus::Cancelled;
        self.updated_at = chrono::Utc::now();
    }

    /// Check if invoice is still valid
    pub fn is_valid(&self) -> bool {
        self.status == InvoiceStatus::Pending && chrono::Utc::now() < self.expires_at
    }

    /// Set the recipient for this invoice
    pub fn set_recipient(&mut self, recipient_id: String) {
        self.recipient_id = Some(recipient_id);
        self.updated_at = chrono::Utc::now();
    }
}
