//! Command execution context

use pulse_domain::models::{Platform, Session};

/// Context for command execution
///
/// Contains all the information needed to execute a command,
/// including the session, user permissions, etc.
#[derive(Debug, Clone)]
pub struct CommandContext {
    /// Messaging platform (WhatsApp, Discord, etc.)
    pub platform: Platform,

    /// Platform-specific user ID
    pub platform_user_id: String,

    /// Optional session (if user is linked)
    pub session: Option<Session>,

    /// Whether this is a voice command
    pub is_voice: bool,
}

impl CommandContext {
    pub fn new(platform: Platform, platform_user_id: String, is_voice: bool) -> Self {
        Self {
            platform,
            platform_user_id,
            session: None,
            is_voice,
        }
    }

    /// Create a context with the platform extracted from a platform key
    ///
    /// Platform key format: "platform:user_id"
    pub fn from_platform_key(platform_key: &str, is_voice: bool) -> Option<Self> {
        let (platform, user_id) = Platform::parse_key(platform_key)?;
        Some(Self::new(platform, user_id, is_voice))
    }

    /// Get the unified platform key for this context
    pub fn platform_key(&self) -> String {
        self.platform.make_key(&self.platform_user_id)
    }

    pub fn with_session(mut self, session: Session) -> Self {
        self.session = Some(session);
        self
    }

    /// Check if user has a valid session
    pub fn is_authenticated(&self) -> bool {
        self.session.is_some()
    }

    /// Check if user is verified
    pub fn is_verified(&self) -> bool {
        self.session
            .as_ref()
            .map(|s| s.is_verified)
            .unwrap_or(false)
    }

    /// Check if user has valid MFA
    pub fn is_mfa_valid(&self) -> bool {
        self.session
            .as_ref()
            .map(|s| s.is_mfa_valid())
            .unwrap_or(false)
    }
}
