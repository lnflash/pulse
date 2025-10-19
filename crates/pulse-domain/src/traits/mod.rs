//! Domain traits
//!
//! Core interfaces that define behavior contracts

use std::future::Future;

/// Repository trait for persisting and retrieving entities
pub trait Repository<T> {
    type Error;

    fn save(&self, entity: &T) -> impl Future<Output = Result<(), Self::Error>> + Send;
    fn find_by_id(&self, id: &str) -> impl Future<Output = Result<Option<T>, Self::Error>> + Send;
    fn delete(&self, id: &str) -> impl Future<Output = Result<(), Self::Error>> + Send;
}
