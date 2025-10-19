//! Redis-backed invoice repository implementation

use async_trait::async_trait;
use deadpool_redis::{redis::AsyncCommands, Pool};
use pulse_application::ports::InvoiceRepository;
use pulse_domain::models::{Invoice, Platform};
use serde_json;
use tracing::{debug, info};
use uuid::Uuid;

use crate::errors::InfrastructureError;

const INVOICE_KEY_PREFIX: &str = "invoice:";
const INVOICE_BY_HASH_PREFIX: &str = "invoice:hash:";
const INVOICE_BY_CREATOR_PREFIX: &str = "invoice:creator:";
const INVOICE_TTL_SECONDS: u64 = 86400; // 24 hours

pub struct RedisInvoiceRepository {
    pool: Pool,
}

impl RedisInvoiceRepository {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }

    fn invoice_key(id: &Uuid) -> String {
        format!("{}{}", INVOICE_KEY_PREFIX, id)
    }

    fn hash_key(payment_hash: &str) -> String {
        format!("{}{}", INVOICE_BY_HASH_PREFIX, payment_hash)
    }

    fn creator_key(platform: Platform, creator_id: &str) -> String {
        format!("{}{}", INVOICE_BY_CREATOR_PREFIX, platform.make_key(creator_id))
    }
}

#[async_trait]
impl InvoiceRepository for RedisInvoiceRepository {
    async fn save(
        &self,
        invoice: &Invoice,
    ) -> Result<(), pulse_application::errors::ApplicationError> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to get connection: {}", e)))?;

        let invoice_json = serde_json::to_string(invoice).map_err(|e| {
            InfrastructureError::Serialization(format!("Failed to serialize invoice: {}", e))
        })?;

        let invoice_id = invoice.id.to_string();
        let invoice_key = Self::invoice_key(&invoice.id);
        let hash_key = Self::hash_key(&invoice.payment_hash);
        let creator_key = Self::creator_key(invoice.platform, &invoice.creator_id);

        // Save invoice data
        conn.set_ex::<_, _, ()>(&invoice_key, &invoice_json, INVOICE_TTL_SECONDS)
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to save invoice: {}", e)))?;

        // Save payment_hash -> invoice_id mapping
        conn.set_ex::<_, _, ()>(&hash_key, &invoice_id, INVOICE_TTL_SECONDS)
            .await
            .map_err(|e| {
                InfrastructureError::Redis(format!("Failed to save hash mapping: {}", e))
            })?;

        // Add invoice ID to creator's list of invoices
        conn.sadd::<_, _, ()>(&creator_key, &invoice_id)
            .await
            .map_err(|e| {
                InfrastructureError::Redis(format!("Failed to add to creator list: {}", e))
            })?;

        // Set TTL on creator's set
        conn.expire::<_, ()>(&creator_key, INVOICE_TTL_SECONDS as i64)
            .await
            .map_err(|e| {
                InfrastructureError::Redis(format!("Failed to set creator list TTL: {}", e))
            })?;

        info!(
            invoice_id = %invoice_id,
            platform = %invoice.platform,
            creator_id = %invoice.creator_id,
            payment_hash = %invoice.payment_hash,
            "Invoice saved to Redis"
        );

        Ok(())
    }

    async fn find_by_id(
        &self,
        id: &Uuid,
    ) -> Result<Option<Invoice>, pulse_application::errors::ApplicationError> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to get connection: {}", e)))?;

        let invoice_key = Self::invoice_key(id);

        let invoice_json: Option<String> = conn
            .get(&invoice_key)
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to get invoice: {}", e)))?;

        match invoice_json {
            Some(json) => {
                let invoice: Invoice = serde_json::from_str(&json).map_err(|e| {
                    InfrastructureError::Serialization(format!(
                        "Failed to deserialize invoice: {}",
                        e
                    ))
                })?;

                debug!(invoice_id = %id, "Invoice found in Redis");
                Ok(Some(invoice))
            }
            None => {
                debug!(invoice_id = %id, "Invoice not found in Redis");
                Ok(None)
            }
        }
    }

    async fn find_by_payment_hash(
        &self,
        payment_hash: &str,
    ) -> Result<Option<Invoice>, pulse_application::errors::ApplicationError> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to get connection: {}", e)))?;

        let hash_key = Self::hash_key(payment_hash);

        // Get invoice_id from payment_hash mapping
        let invoice_id: Option<String> = conn
            .get(&hash_key)
            .await
            .map_err(|e| {
                InfrastructureError::Redis(format!("Failed to get hash mapping: {}", e))
            })?;

        match invoice_id {
            Some(id_str) => {
                let id = Uuid::parse_str(&id_str).map_err(|e| {
                    InfrastructureError::Serialization(format!("Invalid UUID: {}", e))
                })?;
                debug!(
                    payment_hash = %payment_hash,
                    invoice_id = %id,
                    "Found invoice_id for payment hash"
                );
                self.find_by_id(&id).await
            }
            None => {
                debug!(
                    payment_hash = %payment_hash,
                    "No invoice found for payment hash"
                );
                Ok(None)
            }
        }
    }

    async fn find_pending_by_creator(
        &self,
        platform: Platform,
        creator_id: &str,
    ) -> Result<Vec<Invoice>, pulse_application::errors::ApplicationError> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to get connection: {}", e)))?;

        let creator_key = Self::creator_key(platform, creator_id);

        // Get all invoice IDs for this creator
        let invoice_ids: Vec<String> = conn
            .smembers(&creator_key)
            .await
            .map_err(|e| {
                InfrastructureError::Redis(format!("Failed to get creator invoices: {}", e))
            })?;

        let mut invoices = Vec::new();

        for id_str in invoice_ids {
            if let Ok(id) = Uuid::parse_str(&id_str) {
                if let Some(invoice) = self.find_by_id(&id).await? {
                    // Only include pending invoices
                    if invoice.status == pulse_domain::models::InvoiceStatus::Pending {
                        invoices.push(invoice);
                    }
                }
            }
        }

        debug!(
            platform = %platform,
            creator_id = %creator_id,
            count = invoices.len(),
            "Found pending invoices for creator"
        );

        Ok(invoices)
    }

    async fn update(
        &self,
        invoice: &Invoice,
    ) -> Result<(), pulse_application::errors::ApplicationError> {
        // For Redis, update is the same as save
        self.save(invoice).await
    }

    async fn delete(
        &self,
        id: &Uuid,
    ) -> Result<(), pulse_application::errors::ApplicationError> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to get connection: {}", e)))?;

        // First, get the invoice to find related keys
        if let Some(invoice) = self.find_by_id(id).await? {
            let invoice_key = Self::invoice_key(id);
            let hash_key = Self::hash_key(&invoice.payment_hash);
            let creator_key = Self::creator_key(invoice.platform, &invoice.creator_id);
            let id_str = id.to_string();

            // Delete invoice data
            conn.del::<_, ()>(&invoice_key).await.map_err(|e| {
                InfrastructureError::Redis(format!("Failed to delete invoice: {}", e))
            })?;

            // Delete hash mapping
            conn.del::<_, ()>(&hash_key).await.map_err(|e| {
                InfrastructureError::Redis(format!("Failed to delete hash mapping: {}", e))
            })?;

            // Remove from creator's set
            conn.srem::<_, _, ()>(&creator_key, &id_str)
                .await
                .map_err(|e| {
                    InfrastructureError::Redis(format!("Failed to remove from creator list: {}", e))
                })?;

            info!(
                invoice_id = %id,
                platform = %invoice.platform,
                creator_id = %invoice.creator_id,
                "Invoice deleted from Redis"
            );
        }

        Ok(())
    }
}
