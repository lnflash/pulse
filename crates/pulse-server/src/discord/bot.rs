//! Discord bot initialization and management

use poise::serenity_prelude as serenity;
use pulse_application::commands::CommandRouter;
use pulse_application::services::AuthService;
use pulse_infrastructure::config::DiscordConfig;
use std::sync::Arc;
use tracing::{error, info};

use super::commands::{self, Data};

pub struct DiscordBot {
    framework: poise::Framework<Data, Box<dyn std::error::Error + Send + Sync>>,
}

impl DiscordBot {
    /// Create and initialize a new Discord bot
    pub async fn new(
        config: &DiscordConfig,
        router: Arc<CommandRouter>,
        auth_service: Arc<AuthService>,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let _bot_token = config
            .bot_token
            .as_ref()
            .ok_or("Discord bot token not configured")?;

        info!("Initializing Discord bot...");

        // Create poise framework
        let framework = poise::Framework::builder()
            .options(poise::FrameworkOptions {
                commands: commands::commands(),
                prefix_options: poise::PrefixFrameworkOptions {
                    prefix: Some("!".into()),
                    ..Default::default()
                },
                on_error: |error| {
                    Box::pin(async move {
                        error!(error = ?error, "Discord command error");
                    })
                },
                ..Default::default()
            })
            .setup(move |ctx, _ready, framework| {
                Box::pin(async move {
                    info!("Discord bot is ready");
                    info!("Registering slash commands...");

                    poise::builtins::register_globally(ctx, &framework.options().commands)
                        .await?;

                    info!("Slash commands registered successfully");

                    Ok(Data { router, auth_service })
                })
            })
            .build();

        Ok(Self { framework })
    }

    /// Start the Discord bot
    pub async fn start(
        self,
        config: &DiscordConfig,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let bot_token = config
            .bot_token
            .as_ref()
            .ok_or("Discord bot token not configured")?;

        info!("Starting Discord bot...");

        // Configure gateway intents
        // For slash commands only, we just need GUILDS
        // For prefix commands (!help), also need MESSAGE_CONTENT (privileged intent)
        let intents = serenity::GatewayIntents::GUILDS;

        // Create Discord client
        let mut client = serenity::ClientBuilder::new(bot_token, intents)
            .framework(self.framework)
            .await?;

        info!("Discord client initialized, connecting...");

        // Start the client
        client.start().await?;

        Ok(())
    }

    /// Create and start Discord bot in one call
    pub async fn create_and_start(
        config: &DiscordConfig,
        router: Arc<CommandRouter>,
        auth_service: Arc<AuthService>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let bot = Self::new(config, router, auth_service).await?;
        bot.start(config).await
    }
}
