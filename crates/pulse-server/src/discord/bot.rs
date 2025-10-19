//! Discord bot initialization and management

use poise::serenity_prelude as serenity;
use pulse_application::commands::CommandRouter;
use pulse_application::services::AuthService;
use pulse_infrastructure::config::DiscordConfig;
use std::sync::Arc;
use tracing::{error, info};
use uuid::Uuid;

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
        invoice_repo: Arc<dyn pulse_application::ports::InvoiceRepository>,
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
                event_handler: |ctx, event, _framework, data| {
                    Box::pin(async move {
                        if let poise::serenity_prelude::FullEvent::InteractionCreate { interaction } = event {
                            handle_interaction(ctx, interaction, data).await;
                        }
                        Ok(())
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

                    Ok(Data { router, auth_service, invoice_repo })
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
        invoice_repo: Arc<dyn pulse_application::ports::InvoiceRepository>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let bot = Self::new(config, router, auth_service, invoice_repo).await?;
        bot.start(config).await
    }
}

/// Handle button interactions
async fn handle_interaction(
    ctx: &serenity::Context,
    interaction: &serenity::Interaction,
    data: &commands::Data,
) {
    use pulse_application::commands::CommandContext;
    use pulse_domain::commands::CommandParser;
    use pulse_domain::models::Platform;

    // Only handle message component interactions (buttons)
    let component = match interaction {
        serenity::Interaction::Component(component) => component,
        _ => return,
    };

    let custom_id = &component.data.custom_id;

    // Check if this is a "pay_invoice" button
    if let Some(invoice_id_str) = custom_id.strip_prefix("pay_invoice:") {
        info!(
            user = %component.user.id,
            invoice_id = %invoice_id_str,
            "Pay invoice button clicked"
        );

        // Parse invoice ID
        let invoice_id = match Uuid::parse_str(invoice_id_str) {
            Ok(id) => id,
            Err(e) => {
                error!(error = %e, "Invalid invoice ID format");
                if let Err(e) = component
                    .create_response(
                        &ctx.http,
                        serenity::CreateInteractionResponse::Message(
                            serenity::CreateInteractionResponseMessage::new()
                                .content("Invalid invoice ID")
                                .ephemeral(true),
                        ),
                    )
                    .await
                {
                    error!(error = %e, "Failed to send error response");
                }
                return;
            }
        };

        // Retrieve invoice from repository
        let invoice = match data.invoice_repo.find_by_id(&invoice_id).await {
            Ok(Some(inv)) => inv,
            Ok(None) => {
                error!(invoice_id = %invoice_id, "Invoice not found");
                if let Err(e) = component
                    .create_response(
                        &ctx.http,
                        serenity::CreateInteractionResponse::Message(
                            serenity::CreateInteractionResponseMessage::new()
                                .content("Invoice not found or expired")
                                .ephemeral(true),
                        ),
                    )
                    .await
                {
                    error!(error = %e, "Failed to send error response");
                }
                return;
            }
            Err(e) => {
                error!(error = %e, "Failed to retrieve invoice");
                if let Err(e) = component
                    .create_response(
                        &ctx.http,
                        serenity::CreateInteractionResponse::Message(
                            serenity::CreateInteractionResponseMessage::new()
                                .content("Failed to retrieve invoice")
                                .ephemeral(true),
                        ),
                    )
                    .await
                {
                    error!(error = %e, "Failed to send error response");
                }
                return;
            }
        };

        // Check if invoice is still valid
        if !invoice.is_valid() {
            if let Err(e) = component
                .create_response(
                    &ctx.http,
                    serenity::CreateInteractionResponse::Message(
                        serenity::CreateInteractionResponseMessage::new()
                            .content("This invoice has expired or has already been paid")
                            .ephemeral(true),
                    ),
                )
                .await
            {
                error!(error = %e, "Failed to send expired invoice response");
            }
            return;
        }

        // Create command context for the paying user
        let user_id = component.user.id.to_string();
        let mut command_ctx = CommandContext::new(Platform::Discord, user_id.clone(), false);

        // Try to load session for payer
        match data
            .auth_service
            .get_or_create_session(Platform::Discord, &user_id, &user_id)
            .await
        {
            Ok(session) => {
                command_ctx = command_ctx.with_session(session);
            }
            Err(e) => {
                error!(error = %e, "Failed to get user session");
            }
        }

        // Check if user is authenticated
        if !command_ctx.is_verified() {
            if let Err(e) = component
                .create_response(
                    &ctx.http,
                    serenity::CreateInteractionResponse::Message(
                        serenity::CreateInteractionResponseMessage::new()
                            .content("You need to link your account first. Use `/link <phone-number>` to get started.")
                            .ephemeral(true),
                    ),
                )
                .await
            {
                error!(error = %e, "Failed to send auth required response");
            }
            return;
        }

        // Build pay command
        let command_text = format!("pay {}", invoice.payment_request);

        match CommandParser::parse(&command_text) {
            Ok(parsed_command) => {
                // Execute payment via command router
                match data.router.route(&parsed_command, &command_ctx).await {
                    Ok(response) => {
                        // Send success response
                        if let Err(e) = component
                            .create_response(
                                &ctx.http,
                                serenity::CreateInteractionResponse::Message(
                                    serenity::CreateInteractionResponseMessage::new()
                                        .content(response.message)
                                        .ephemeral(true),
                                ),
                            )
                            .await
                        {
                            error!(error = %e, "Failed to send payment response");
                        }
                    }
                    Err(e) => {
                        error!(error = %e, "Payment command failed");
                        if let Err(e) = component
                            .create_response(
                                &ctx.http,
                                serenity::CreateInteractionResponse::Message(
                                    serenity::CreateInteractionResponseMessage::new()
                                        .content(format!("Payment failed: {}", e))
                                        .ephemeral(true),
                                ),
                            )
                            .await
                        {
                            error!(error = %e, "Failed to send error response");
                        }
                    }
                }
            }
            Err(e) => {
                error!(error = %e, "Failed to parse pay command");
                if let Err(e) = component
                    .create_response(
                        &ctx.http,
                        serenity::CreateInteractionResponse::Message(
                            serenity::CreateInteractionResponseMessage::new()
                                .content("Failed to process payment")
                                .ephemeral(true),
                        ),
                    )
                    .await
                {
                    error!(error = %e, "Failed to send error response");
                }
            }
        }
    }
}
