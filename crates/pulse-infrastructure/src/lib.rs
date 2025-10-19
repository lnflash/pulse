//! # Pulse Infrastructure Layer
//!
//! This crate contains implementations of external integrations such as
//! WhatsApp, Flash API (GraphQL), Redis, RabbitMQ, AI services, etc.
//! It implements the ports defined in the application layer.

pub mod whatsapp;
pub mod flash_api;
pub mod redis;
pub mod config;
pub mod errors;

// Re-export commonly used types
pub use errors::InfrastructureError;
pub use config::AppConfig;
pub use redis::{create_redis_pool, Cache, RedisCache, RedisSessionRepository, RedisInvoiceRepository};
pub use flash_api::{FlashApiClient, FlashApiAdapter};
