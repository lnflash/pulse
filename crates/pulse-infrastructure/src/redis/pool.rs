//! Redis connection pool

use deadpool_redis::{
    redis::cmd,
    Config, Pool, Runtime,
};
use tracing::info;

use crate::{config::RedisConfig, errors::InfrastructureError};

/// Create a Redis connection pool
pub async fn create_redis_pool(config: &RedisConfig) -> Result<Pool, InfrastructureError> {
    let redis_url = if let Some(password) = &config.password {
        format!(
            "redis://:{}@{}:{}/{}",
            password, config.host, config.port, config.db
        )
    } else {
        format!("redis://{}:{}/{}", config.host, config.port, config.db)
    };

    let cfg = Config::from_url(redis_url);
    let pool = cfg
        .create_pool(Some(Runtime::Tokio1))
        .map_err(|e| InfrastructureError::Redis(format!("Failed to create pool: {}", e)))?;

    // Test connection
    match pool.get().await {
        Ok(mut conn) => {
            let pong: String = cmd("PING")
                .query_async(&mut conn)
                .await
                .map_err(|e| InfrastructureError::Redis(format!("Ping failed: {}", e)))?;

            if pong == "PONG" {
                info!(
                    "Redis connection pool created successfully: {}:{}",
                    config.host, config.port
                );
            } else {
                tracing::warn!("Redis responded with unexpected ping response: {}", pong);
            }
        }
        Err(e) => {
            return Err(InfrastructureError::Redis(format!(
                "Failed to get connection from pool: {}",
                e
            )));
        }
    }

    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // Requires Redis server
    async fn test_redis_pool_creation() {
        let config = RedisConfig {
            host: "localhost".to_string(),
            port: 6379,
            password: None,
            db: 0,
        };

        let result = create_redis_pool(&config).await;
        assert!(result.is_ok());
    }
}
