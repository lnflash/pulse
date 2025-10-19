//! Redis-backed session repository implementation

use async_trait::async_trait;
use deadpool_redis::{redis::AsyncCommands, Pool};
use pulse_application::ports::SessionRepository;
use pulse_domain::models::Session;
use serde_json;
use tracing::{debug, info};

use crate::errors::InfrastructureError;

const SESSION_KEY_PREFIX: &str = "session:";
const SESSION_BY_PLATFORM_PREFIX: &str = "session:platform:";
const SESSION_TTL_SECONDS: u64 = 86400; // 24 hours

pub struct RedisSessionRepository {
    pool: Pool,
}

impl RedisSessionRepository {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }

    fn session_key(id: &str) -> String {
        format!("{}{}", SESSION_KEY_PREFIX, id)
    }

    fn platform_user_key(platform: pulse_domain::models::Platform, platform_user_id: &str) -> String {
        format!("{}{}", SESSION_BY_PLATFORM_PREFIX, platform.make_key(platform_user_id))
    }
}

#[async_trait]
impl SessionRepository for RedisSessionRepository {
    async fn save(
        &self,
        session: &Session,
    ) -> Result<(), pulse_application::errors::ApplicationError> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to get connection: {}", e)))?;

        let session_json = serde_json::to_string(session).map_err(|e| {
            InfrastructureError::Serialization(format!("Failed to serialize session: {}", e))
        })?;

        let session_id = session.id.to_string();
        let session_key = Self::session_key(&session_id);
        let platform_key = Self::platform_user_key(session.platform, &session.platform_user_id);

        // Save session data
        conn.set_ex::<_, _, ()>(&session_key, &session_json, SESSION_TTL_SECONDS)
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to save session: {}", e)))?;

        // Save platform:user_id -> session_id mapping
        conn.set_ex::<_, _, ()>(&platform_key, &session_id, SESSION_TTL_SECONDS)
            .await
            .map_err(|e| {
                InfrastructureError::Redis(format!("Failed to save platform mapping: {}", e))
            })?;

        info!(
            session_id = %session_id,
            platform = %session.platform,
            platform_user_id = %session.platform_user_id,
            "Session saved to Redis"
        );

        Ok(())
    }

    async fn find_by_id(
        &self,
        id: &str,
    ) -> Result<Option<Session>, pulse_application::errors::ApplicationError> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to get connection: {}", e)))?;

        let session_key = Self::session_key(id);

        let session_json: Option<String> = conn
            .get(&session_key)
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to get session: {}", e)))?;

        match session_json {
            Some(json) => {
                let session: Session = serde_json::from_str(&json).map_err(|e| {
                    InfrastructureError::Serialization(format!(
                        "Failed to deserialize session: {}",
                        e
                    ))
                })?;

                debug!(session_id = %id, "Session found in Redis");
                Ok(Some(session))
            }
            None => {
                debug!(session_id = %id, "Session not found in Redis");
                Ok(None)
            }
        }
    }

    async fn find_by_platform_user(
        &self,
        platform: pulse_domain::models::Platform,
        platform_user_id: &str,
    ) -> Result<Option<Session>, pulse_application::errors::ApplicationError> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to get connection: {}", e)))?;

        let platform_key = Self::platform_user_key(platform, platform_user_id);

        // Get session_id from platform:user_id mapping
        let session_id: Option<String> = conn
            .get(&platform_key)
            .await
            .map_err(|e| {
                InfrastructureError::Redis(format!("Failed to get platform mapping: {}", e))
            })?;

        match session_id {
            Some(id) => {
                debug!(
                    platform = %platform,
                    platform_user_id = %platform_user_id,
                    session_id = %id,
                    "Found session_id for platform user"
                );
                self.find_by_id(&id).await
            }
            None => {
                debug!(
                    platform = %platform,
                    platform_user_id = %platform_user_id,
                    "No session found for platform user"
                );
                Ok(None)
            }
        }
    }

    async fn delete(
        &self,
        id: &str,
    ) -> Result<(), pulse_application::errors::ApplicationError> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| InfrastructureError::Redis(format!("Failed to get connection: {}", e)))?;

        // First, get the session to find the platform_user_id
        if let Some(session) = self.find_by_id(id).await? {
            let session_key = Self::session_key(id);
            let platform_key = Self::platform_user_key(session.platform, &session.platform_user_id);

            // Delete both keys
            conn.del::<_, ()>(&session_key).await.map_err(|e| {
                InfrastructureError::Redis(format!("Failed to delete session: {}", e))
            })?;

            conn.del::<_, ()>(&platform_key).await.map_err(|e| {
                InfrastructureError::Redis(format!("Failed to delete platform mapping: {}", e))
            })?;

            info!(
                session_id = %id,
                platform = %session.platform,
                platform_user_id = %session.platform_user_id,
                "Session deleted from Redis"
            );
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pulse_domain::models::Session;

    #[tokio::test]
    #[ignore] // Requires Redis server
    async fn test_session_crud() {
        // This test requires a running Redis server
        let config = crate::config::RedisConfig {
            host: "localhost".to_string(),
            port: 6379,
            password: None,
            db: 1, // Use db 1 for tests
        };

        let pool = crate::redis::pool::create_redis_pool(&config)
            .await
            .unwrap();
        let repo = RedisSessionRepository::new(pool);

        // Create a test session
        let session = Session::new(
            pulse_domain::models::Platform::WhatsApp,
            "1234567890@c.us".to_string(),
            "+1234567890".to_string()
        );
        let session_id = session.id.to_string();

        // Save
        repo.save(&session).await.unwrap();

        // Find by ID
        let found = repo.find_by_id(&session_id).await.unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().platform_user_id, session.platform_user_id);

        // Find by platform user
        let found_by_platform = repo
            .find_by_platform_user(pulse_domain::models::Platform::WhatsApp, &session.platform_user_id)
            .await
            .unwrap();
        assert!(found_by_platform.is_some());

        // Delete
        repo.delete(&session_id).await.unwrap();

        // Verify deleted
        let not_found = repo.find_by_id(&session_id).await.unwrap();
        assert!(not_found.is_none());
    }
}
