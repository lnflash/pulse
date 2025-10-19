//! Configuration management
//!
//! Application configuration loaded from environment variables and config files

use serde::{Deserialize, Serialize};
use std::env;

use crate::errors::InfrastructureError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub redis: RedisConfig,
    pub flash_api: FlashApiConfig,
    pub whatsapp: WhatsAppConfig,
    pub discord: DiscordConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub port: u16,
    pub host: String,
    pub environment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisConfig {
    pub host: String,
    pub port: u16,
    pub password: Option<String>,
    pub db: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashApiConfig {
    pub url: String,
    pub auth_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppConfig {
    pub enabled: bool,
    pub phone_number_id: Option<String>,
    pub access_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordConfig {
    pub enabled: bool,
    pub bot_token: Option<String>,
    pub application_id: Option<String>,
}

impl AppConfig {
    /// Load configuration from environment variables
    pub fn from_env() -> Result<Self, InfrastructureError> {
        // Load .env file if it exists (for local development)
        dotenvy::dotenv().ok();

        let config = Self {
            server: ServerConfig {
                port: env::var("PORT")
                    .ok()
                    .and_then(|p| p.parse().ok())
                    .unwrap_or(3000),
                host: env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
                environment: env::var("NODE_ENV")
                    .or_else(|_| env::var("ENVIRONMENT"))
                    .unwrap_or_else(|_| "development".to_string()),
            },
            redis: RedisConfig {
                host: env::var("REDIS_HOST").unwrap_or_else(|_| "localhost".to_string()),
                port: env::var("REDIS_PORT")
                    .ok()
                    .and_then(|p| p.parse().ok())
                    .unwrap_or(6379),
                password: env::var("REDIS_PASSWORD").ok(),
                db: env::var("REDIS_DB")
                    .ok()
                    .and_then(|d| d.parse().ok())
                    .unwrap_or(0),
            },
            flash_api: FlashApiConfig {
                url: env::var("FLASH_API_URL")
                    .unwrap_or_else(|_| "https://api.flashapp.me/graphql".to_string()),
                auth_token: env::var("FLASH_AUTH_TOKEN").ok(),
            },
            whatsapp: WhatsAppConfig {
                enabled: env::var("WHATSAPP_ENABLED")
                    .ok()
                    .and_then(|e| e.parse().ok())
                    .unwrap_or(false),
                phone_number_id: env::var("WHATSAPP_PHONE_NUMBER_ID").ok(),
                access_token: env::var("WHATSAPP_ACCESS_TOKEN").ok(),
            },
            discord: DiscordConfig {
                enabled: env::var("DISCORD_ENABLED")
                    .ok()
                    .and_then(|e| e.parse().ok())
                    .unwrap_or(false),
                bot_token: env::var("DISCORD_BOT_TOKEN").ok(),
                application_id: env::var("DISCORD_APPLICATION_ID").ok(),
            },
        };

        // Validate configuration
        config.validate()?;

        Ok(config)
    }

    /// Validate the configuration
    fn validate(&self) -> Result<(), InfrastructureError> {
        // Validate port range
        if self.server.port == 0 {
            return Err(InfrastructureError::Config(
                "Server port cannot be 0".to_string(),
            ));
        }

        // Validate Redis port
        if self.redis.port == 0 {
            return Err(InfrastructureError::Config(
                "Redis port cannot be 0".to_string(),
            ));
        }

        // Validate Flash API URL
        if self.flash_api.url.is_empty() {
            return Err(InfrastructureError::Config(
                "Flash API URL cannot be empty".to_string(),
            ));
        }

        Ok(())
    }

    /// Check if running in production mode
    pub fn is_production(&self) -> bool {
        self.server.environment == "production"
    }

    /// Check if running in development mode
    pub fn is_development(&self) -> bool {
        self.server.environment == "development"
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server: ServerConfig {
                port: 3000,
                host: "0.0.0.0".to_string(),
                environment: "development".to_string(),
            },
            redis: RedisConfig {
                host: "localhost".to_string(),
                port: 6379,
                password: None,
                db: 0,
            },
            flash_api: FlashApiConfig {
                url: "https://api.flashapp.me/graphql".to_string(),
                auth_token: None,
            },
            whatsapp: WhatsAppConfig {
                enabled: false,
                phone_number_id: None,
                access_token: None,
            },
            discord: DiscordConfig {
                enabled: false,
                bot_token: None,
                application_id: None,
            },
        }
    }
}
