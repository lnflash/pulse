//! Session repository port

use async_trait::async_trait;
use pulse_domain::models::{Platform, Session};

use crate::errors::ApplicationError;

#[async_trait]
pub trait SessionRepository: Send + Sync {
    async fn save(&self, session: &Session) -> Result<(), ApplicationError>;
    async fn find_by_id(&self, id: &str) -> Result<Option<Session>, ApplicationError>;

    /// Find a session by platform and platform-specific user ID
    async fn find_by_platform_user(
        &self,
        platform: Platform,
        platform_user_id: &str,
    ) -> Result<Option<Session>, ApplicationError>;

    async fn delete(&self, id: &str) -> Result<(), ApplicationError>;
}
