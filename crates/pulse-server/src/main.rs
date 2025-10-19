//! # Pulse Server
//!
//! Main entry point for the Pulse multi-platform Bitcoin wallet bot.
//! This binary initializes all services, sets up the HTTP server,
//! and orchestrates the application lifecycle.

mod discord;

use anyhow::Result;
use pulse_application::commands::CommandRouter;
use pulse_application::services::AuthService;
use pulse_infrastructure::{
    create_redis_pool, AppConfig, FlashApiAdapter, FlashApiClient, RedisSessionRepository,
};
use std::sync::Arc;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing subscriber for logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "pulse=info,tower_http=debug,axum=trace".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting Pulse v3.0.0 - Multi-Platform Bitcoin Wallet Bot");

    // Load configuration from environment
    let config = AppConfig::from_env()?;

    tracing::info!(
        environment = %config.server.environment,
        port = %config.server.port,
        host = %config.server.host,
        "Configuration loaded successfully"
    );

    tracing::info!(
        redis_host = %config.redis.host,
        redis_port = %config.redis.port,
        redis_db = %config.redis.db,
        "Redis configuration"
    );

    tracing::info!(
        flash_api_url = %config.flash_api.url,
        flash_api_configured = config.flash_api.auth_token.is_some(),
        "Flash API configuration"
    );

    tracing::info!(
        whatsapp_enabled = %config.whatsapp.enabled,
        "WhatsApp configuration"
    );

    tracing::info!(
        discord_enabled = %config.discord.enabled,
        "Discord configuration"
    );

    if config.is_production() {
        tracing::warn!("Running in PRODUCTION mode");
    } else {
        tracing::info!("Running in DEVELOPMENT mode");
    }

    // Initialize Redis connection pool
    tracing::info!("Initializing Redis connection pool...");
    let redis_pool = match create_redis_pool(&config.redis).await {
        Ok(pool) => {
            tracing::info!("Redis connection pool initialized successfully");
            Some(pool)
        }
        Err(e) => {
            tracing::warn!("Failed to initialize Redis pool: {}. Continuing without Redis.", e);
            tracing::warn!("Session persistence will not be available");
            None
        }
    };

    // Initialize services if Redis is available
    if let Some(pool) = redis_pool {
        tracing::info!("Initializing application services...");

        // Create session repository
        let session_repo: Arc<dyn pulse_application::ports::SessionRepository> =
            Arc::new(RedisSessionRepository::new(pool));

        // Create Flash API client
        let flash_client = FlashApiClient::new(&config.flash_api)?;
        let flash_adapter: Arc<dyn pulse_application::ports::FlashApiClient> =
            Arc::new(FlashApiAdapter::new(flash_client));

        // Create auth service
        let auth_service = Arc::new(AuthService::new(
            session_repo.clone(),
            flash_adapter.clone(),
        ));

        // Create command router
        let router = Arc::new(CommandRouter::new(
            auth_service.clone(),
            flash_adapter.clone(),
        ));

        tracing::info!(
            handler_count = router.handler_count(),
            "Command router initialized"
        );

        // Start Discord bot if enabled
        if config.discord.enabled {
            tracing::info!("Discord is enabled, starting bot...");

            if config.discord.bot_token.is_none() {
                tracing::error!("Discord is enabled but DISCORD_BOT_TOKEN is not set");
                return Err(anyhow::anyhow!("Discord bot token not configured"));
            }

            // Spawn Discord bot as a background task
            let discord_config = config.discord.clone();
            let discord_router = router.clone();
            let discord_auth_service = auth_service.clone();

            tokio::spawn(async move {
                if let Err(e) =
                    discord::DiscordBot::create_and_start(&discord_config, discord_router, discord_auth_service).await
                {
                    tracing::error!(error = %e, "Discord bot error");
                }
            });
        } else {
            tracing::info!("Discord is disabled");
        }

        tracing::info!("Pulse server initialization complete");
        tracing::info!(
            redis_available = true,
            discord_enabled = config.discord.enabled,
            whatsapp_enabled = config.whatsapp.enabled,
            "Ready to process messages"
        );

        // TODO: Initialize HTTP server for webhooks/API
        // For now, just wait for shutdown signal
        tokio::signal::ctrl_c().await?;

        tracing::info!("Received shutdown signal, gracefully shutting down...");
    } else {
        tracing::error!("Redis connection required but unavailable");
        tracing::error!("Cannot start services without Redis");
        return Err(anyhow::anyhow!("Redis connection required"));
    }

    tracing::info!("Shutdown complete");

    Ok(())
}
