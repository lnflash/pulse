//! Flash API GraphQL client
//!
//! Implementation of Flash API integration

pub mod client;
pub mod queries;
pub mod mutations;
pub mod types;
pub mod adapter;

pub use client::FlashApiClient;
pub use adapter::FlashApiAdapter;
pub use types::*;
