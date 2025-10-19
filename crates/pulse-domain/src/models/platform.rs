//! Platform abstraction for multi-platform support
//!
//! Defines supported messaging platforms (WhatsApp, Discord, Telegram, etc.)

use serde::{Deserialize, Serialize};
use std::fmt;

/// Supported messaging platforms
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Platform {
    /// WhatsApp messaging platform
    WhatsApp,
    /// Discord messaging platform
    Discord,
    /// Telegram messaging platform
    Telegram,
    /// Slack messaging platform
    Slack,
}

impl Platform {
    /// Get the platform identifier prefix for Redis keys
    pub fn prefix(&self) -> &'static str {
        match self {
            Platform::WhatsApp => "whatsapp",
            Platform::Discord => "discord",
            Platform::Telegram => "telegram",
            Platform::Slack => "slack",
        }
    }

    /// Create a unified platform key from user ID
    ///
    /// Format: "platform:user_id"
    /// Examples:
    /// - "whatsapp:+1234567890@c.us"
    /// - "discord:123456789012345678"
    /// - "telegram:987654321"
    pub fn make_key(&self, user_id: &str) -> String {
        format!("{}:{}", self.prefix(), user_id)
    }

    /// Parse a platform key back into (Platform, user_id)
    ///
    /// Returns None if the key format is invalid
    pub fn parse_key(key: &str) -> Option<(Platform, String)> {
        let parts: Vec<&str> = key.splitn(2, ':').collect();
        if parts.len() != 2 {
            return None;
        }

        let platform = match parts[0] {
            "whatsapp" => Platform::WhatsApp,
            "discord" => Platform::Discord,
            "telegram" => Platform::Telegram,
            "slack" => Platform::Slack,
            _ => return None,
        };

        Some((platform, parts[1].to_string()))
    }

    /// Get the human-readable name of the platform
    pub fn name(&self) -> &'static str {
        match self {
            Platform::WhatsApp => "WhatsApp",
            Platform::Discord => "Discord",
            Platform::Telegram => "Telegram",
            Platform::Slack => "Slack",
        }
    }
}

impl fmt::Display for Platform {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.name())
    }
}

impl Default for Platform {
    fn default() -> Self {
        Platform::WhatsApp
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_platform_prefix() {
        assert_eq!(Platform::WhatsApp.prefix(), "whatsapp");
        assert_eq!(Platform::Discord.prefix(), "discord");
    }

    #[test]
    fn test_make_key() {
        let key = Platform::WhatsApp.make_key("+1234567890@c.us");
        assert_eq!(key, "whatsapp:+1234567890@c.us");

        let key = Platform::Discord.make_key("123456789012345678");
        assert_eq!(key, "discord:123456789012345678");
    }

    #[test]
    fn test_parse_key() {
        let (platform, user_id) = Platform::parse_key("whatsapp:+1234567890@c.us").unwrap();
        assert_eq!(platform, Platform::WhatsApp);
        assert_eq!(user_id, "+1234567890@c.us");

        let (platform, user_id) = Platform::parse_key("discord:123456789012345678").unwrap();
        assert_eq!(platform, Platform::Discord);
        assert_eq!(user_id, "123456789012345678");

        assert!(Platform::parse_key("invalid").is_none());
        assert!(Platform::parse_key("unknown:12345").is_none());
    }

    #[test]
    fn test_display() {
        assert_eq!(format!("{}", Platform::WhatsApp), "WhatsApp");
        assert_eq!(format!("{}", Platform::Discord), "Discord");
    }
}
