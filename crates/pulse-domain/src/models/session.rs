//! Session domain model

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::Platform;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: Uuid,
    /// Messaging platform (WhatsApp, Discord, etc.)
    pub platform: Platform,
    /// Platform-specific user ID (e.g., "+1234567890@c.us" for WhatsApp, "123456789" for Discord)
    pub platform_user_id: String,
    /// Platform-specific identifier (phone number, username, etc.)
    pub platform_identifier: String,
    /// Phone number waiting for OTP verification (temporary state during link flow)
    pub pending_phone: Option<String>,
    pub flash_user_id: Option<String>,
    pub flash_auth_token: Option<String>,
    pub is_verified: bool,
    pub mfa_verified: bool,
    pub mfa_expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub consent_given: bool,
    pub consent_timestamp: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

impl Session {
    pub fn new(platform: Platform, platform_user_id: String, platform_identifier: String) -> Self {
        let now = chrono::Utc::now();
        let expires_at = now + chrono::Duration::hours(24);

        Self {
            id: Uuid::new_v4(),
            platform,
            platform_user_id,
            platform_identifier,
            pending_phone: None,
            flash_user_id: None,
            flash_auth_token: None,
            is_verified: false,
            mfa_verified: false,
            mfa_expires_at: None,
            consent_given: false,
            consent_timestamp: None,
            created_at: now,
            updated_at: now,
            expires_at,
        }
    }

    /// Get the unified platform key for this session
    ///
    /// Format: "platform:user_id" (e.g., "whatsapp:+1234567890@c.us")
    pub fn platform_key(&self) -> String {
        self.platform.make_key(&self.platform_user_id)
    }

    pub fn is_expired(&self) -> bool {
        chrono::Utc::now() > self.expires_at
    }

    pub fn is_mfa_valid(&self) -> bool {
        self.mfa_verified
            && self
                .mfa_expires_at
                .map(|expires| chrono::Utc::now() < expires)
                .unwrap_or(false)
    }
}
