//! Invoice repository port

use async_trait::async_trait;
use pulse_domain::models::{Invoice, Platform};
use uuid::Uuid;

use crate::errors::ApplicationError;

#[async_trait]
pub trait InvoiceRepository: Send + Sync {
    /// Save an invoice
    async fn save(&self, invoice: &Invoice) -> Result<(), ApplicationError>;

    /// Find an invoice by its ID
    async fn find_by_id(&self, id: &Uuid) -> Result<Option<Invoice>, ApplicationError>;

    /// Find an invoice by payment hash
    async fn find_by_payment_hash(&self, payment_hash: &str) -> Result<Option<Invoice>, ApplicationError>;

    /// Find all pending invoices for a user
    async fn find_pending_by_creator(
        &self,
        platform: Platform,
        creator_id: &str,
    ) -> Result<Vec<Invoice>, ApplicationError>;

    /// Update an invoice's status
    async fn update(&self, invoice: &Invoice) -> Result<(), ApplicationError>;

    /// Delete an invoice
    async fn delete(&self, id: &Uuid) -> Result<(), ApplicationError>;
}
