//! Generic cache implementation using Redis

use async_trait::async_trait;
use deadpool_redis::{redis::AsyncCommands, Pool};
use serde::{de::DeserializeOwned, Serialize};
use tracing::debug;

use crate::errors::InfrastructureError;

/// Cache trait for storing and retrieving values
#[async_trait]
pub trait Cache: Send + Sync {
    async fn get<T: DeserializeOwned>(&self, key: &str) -> Result<Option<T>, InfrastructureError>;
    async fn set<T: Serialize + Sync>(
        &self,
        key: &str,
        value: &T,
        ttl_seconds: Option<usize>,
    ) -> Result<(), InfrastructureError>;
    async fn delete(&self, key: &str) -> Result<(), InfrastructureError>;
    async fn exists(&self, key: &str) -> Result<bool, InfrastructureError>;
}

/// Redis-based cache implementation
pub struct RedisCache {
    pool: Pool,
    key_prefix: String,
}

impl RedisCache {
    pub fn new(pool: Pool, key_prefix: impl Into<String>) -> Self {
        Self {
            pool,
            key_prefix: key_prefix.into(),
        }
    }

    fn prefixed_key(&self, key: &str) -> String {
        format!("{}:{}", self.key_prefix, key)
    }
}

#[async_trait]
impl Cache for RedisCache {
    async fn get<T: DeserializeOwned>(&self, key: &str) -> Result<Option<T>, InfrastructureError> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to get connection: {}", e)))?;

        let prefixed_key = self.prefixed_key(key);
        let value_json: Option<String> = conn
            .get(&prefixed_key)
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to get cache value: {}", e)))?;

        match value_json {
            Some(json) => {
                let value: T = serde_json::from_str(&json).map_err(|e| {
                    InfrastructureError::Serialization(format!(
                        "Failed to deserialize cache value: {}",
                        e
                    ))
                })?;
                debug!(key = %key, "Cache hit");
                Ok(Some(value))
            }
            None => {
                debug!(key = %key, "Cache miss");
                Ok(None)
            }
        }
    }

    async fn set<T: Serialize + Sync>(
        &self,
        key: &str,
        value: &T,
        ttl_seconds: Option<usize>,
    ) -> Result<(), InfrastructureError> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to get connection: {}", e)))?;

        let value_json = serde_json::to_string(value).map_err(|e| {
            InfrastructureError::Serialization(format!("Failed to serialize cache value: {}", e))
        })?;

        let prefixed_key = self.prefixed_key(key);

        if let Some(ttl) = ttl_seconds {
            conn.set_ex::<_, _, ()>(&prefixed_key, &value_json, ttl as u64)
                .await
                .map_err(|e| {
                    InfrastructureError::Redis(format!("Failed to set cache value with TTL: {}", e))
                })?;
            debug!(key = %key, ttl_seconds = %ttl, "Cache set with TTL");
        } else {
            conn.set::<_, _, ()>(&prefixed_key, &value_json).await.map_err(|e| {
                InfrastructureError::Redis(format!("Failed to set cache value: {}", e))
            })?;
            debug!(key = %key, "Cache set (no TTL)");
        }

        Ok(())
    }

    async fn delete(&self, key: &str) -> Result<(), InfrastructureError> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to get connection: {}", e)))?;

        let prefixed_key = self.prefixed_key(key);
        conn.del::<_, ()>(&prefixed_key)
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to delete cache key: {}", e)))?;

        debug!(key = %key, "Cache key deleted");
        Ok(())
    }

    async fn exists(&self, key: &str) -> Result<bool, InfrastructureError> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to get connection: {}", e)))?;

        let prefixed_key = self.prefixed_key(key);
        let exists: bool = conn
            .exists(&prefixed_key)
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to check key existence: {}", e)))?;

        Ok(exists)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Serialize, Deserialize, PartialEq)]
    struct TestData {
        value: String,
        count: i32,
    }

    #[tokio::test]
    #[ignore] // Requires Redis server
    async fn test_cache_operations() {
        let config = crate::config::RedisConfig {
            host: "localhost".to_string(),
            port: 6379,
            password: None,
            db: 1,
        };

        let pool = crate::redis::pool::create_redis_pool(&config)
            .await
            .unwrap();
        let cache = RedisCache::new(pool, "test");

        let test_data = TestData {
            value: "hello".to_string(),
            count: 42,
        };

        // Set
        cache.set("key1", &test_data, Some(60)).await.unwrap();

        // Get
        let retrieved: Option<TestData> = cache.get("key1").await.unwrap();
        assert_eq!(retrieved, Some(test_data));

        // Exists
        assert!(cache.exists("key1").await.unwrap());

        // Delete
        cache.delete("key1").await.unwrap();

        // Verify deleted
        let not_found: Option<TestData> = cache.get("key1").await.unwrap();
        assert_eq!(not_found, None);
        assert!(!cache.exists("key1").await.unwrap());
    }
}
