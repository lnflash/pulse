//! Poise command handlers that bridge to our CommandRouter
//!
//! This module provides Discord slash commands that delegate to our
//! existing command handlers, ensuring zero code duplication.

use pulse_application::commands::{CommandContext, CommandRouter};
use pulse_application::services::AuthService;
use pulse_domain::commands::CommandParser;
use pulse_domain::models::Platform;
use std::sync::Arc;
use tracing::{debug, error, warn};

/// Application context passed to all poise commands
pub struct Data {
    pub router: Arc<CommandRouter>,
    pub auth_service: Arc<AuthService>,
}

// Manual Debug implementation since these contain trait objects
impl std::fmt::Debug for Data {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Data")
            .field("router", &"CommandRouter { ... }")
            .field("auth_service", &"AuthService { ... }")
            .finish()
    }
}

type Error = Box<dyn std::error::Error + Send + Sync>;
type Context<'a> = poise::Context<'a, Data, Error>;

/// Convert a poise Context to our CommandContext
/// This loads the user's session if they have one
async fn to_command_context(ctx: &Context<'_>) -> CommandContext {
    let user_id = ctx.author().id.to_string();
    let platform = Platform::Discord;

    // Create base context
    let mut command_ctx = CommandContext::new(platform, user_id.clone(), false);

    // Try to load session
    match ctx.data().auth_service.get_or_create_session(
        platform,
        &user_id,
        &user_id, // Use user_id as identifier
    ).await {
        Ok(session) => {
            command_ctx = command_ctx.with_session(session);
        }
        Err(e) => {
            warn!(
                error = %e,
                platform = %platform,
                user_id = %user_id,
                "Failed to load session for Discord user"
            );
        }
    }

    command_ctx
}

/// Help command - shows available commands
#[poise::command(slash_command, prefix_command)]
pub async fn help(ctx: Context<'_>) -> Result<(), Error> {
    debug!(user = %ctx.author().name, "Discord /help command");

    let command_ctx = to_command_context(&ctx).await;

    match CommandParser::parse("help") {
        Ok(parsed_command) => {
            match ctx.data().router.route(&parsed_command, &command_ctx).await {
                Ok(response) => {
                    ctx.say(response.message).await?;
                }
                Err(e) => {
                    error!(error = %e, "Failed to execute help command");
                    ctx.say(format!("Error: {}", e)).await?;
                }
            }
        }
        Err(e) => {
            error!(error = %e, "Failed to parse help command");
            ctx.say(format!("Error: {}", e)).await?;
        }
    }

    Ok(())
}

/// Balance command - check your Flash wallet balance
#[poise::command(slash_command, prefix_command)]
pub async fn balance(ctx: Context<'_>) -> Result<(), Error> {
    debug!(user = %ctx.author().name, "Discord /balance command");

    // Defer reply immediately to avoid 3-second timeout
    ctx.defer().await?;

    let command_ctx = to_command_context(&ctx).await;

    match CommandParser::parse("balance") {
        Ok(parsed_command) => {
            match ctx.data().router.route(&parsed_command, &command_ctx).await {
                Ok(response) => {
                    ctx.say(response.message).await?;
                }
                Err(e) => {
                    error!(error = %e, "Failed to execute balance command");
                    ctx.say(format!("Error: {}", e)).await?;
                }
            }
        }
        Err(e) => {
            error!(error = %e, "Failed to parse balance command");
            ctx.say(format!("Error: {}", e)).await?;
        }
    }

    Ok(())
}

/// Price command - get current Bitcoin price
#[poise::command(slash_command, prefix_command)]
pub async fn price(ctx: Context<'_>) -> Result<(), Error> {
    debug!(user = %ctx.author().name, "Discord /price command");

    // Defer reply immediately to avoid 3-second timeout
    ctx.defer().await?;

    let command_ctx = to_command_context(&ctx).await;

    match CommandParser::parse("price") {
        Ok(parsed_command) => {
            match ctx.data().router.route(&parsed_command, &command_ctx).await {
                Ok(response) => {
                    ctx.say(response.message).await?;
                }
                Err(e) => {
                    error!(error = %e, "Failed to execute price command");
                    ctx.say(format!("Error: {}", e)).await?;
                }
            }
        }
        Err(e) => {
            error!(error = %e, "Failed to parse price command");
            ctx.say(format!("Error: {}", e)).await?;
        }
    }

    Ok(())
}

/// Link command - link your Flash account via phone + OTP
#[poise::command(slash_command, prefix_command)]
pub async fn link(
    ctx: Context<'_>,
    #[description = "Your phone number in international format (e.g., +1234567890)"] phone: String,
) -> Result<(), Error> {
    debug!(user = %ctx.author().name, phone = %phone, "Discord /link command");

    // Defer reply immediately to avoid 3-second timeout
    ctx.defer().await?;

    let command_ctx = to_command_context(&ctx).await;
    let command_text = format!("link {}", phone);

    match CommandParser::parse(&command_text) {
        Ok(parsed_command) => {
            match ctx.data().router.route(&parsed_command, &command_ctx).await {
                Ok(response) => {
                    ctx.say(response.message).await?;
                }
                Err(e) => {
                    error!(error = %e, "Failed to execute link command");
                    ctx.say(format!("Error: {}", e)).await?;
                }
            }
        }
        Err(e) => {
            error!(error = %e, "Failed to parse link command");
            ctx.say(format!("Error: {}", e)).await?;
        }
    }

    Ok(())
}

/// Verify command - verify OTP code to complete account linking
#[poise::command(slash_command, prefix_command)]
pub async fn verify(
    ctx: Context<'_>,
    #[description = "The 6-digit OTP code sent to your phone"] code: String,
) -> Result<(), Error> {
    debug!(user = %ctx.author().name, "Discord /verify command");

    // Defer reply immediately to avoid 3-second timeout
    ctx.defer().await?;

    let command_ctx = to_command_context(&ctx).await;
    let command_text = format!("verify {}", code);

    match CommandParser::parse(&command_text) {
        Ok(parsed_command) => {
            match ctx.data().router.route(&parsed_command, &command_ctx).await {
                Ok(response) => {
                    ctx.say(response.message).await?;
                }
                Err(e) => {
                    error!(error = %e, "Failed to execute verify command");
                    ctx.say(format!("Error: {}", e)).await?;
                }
            }
        }
        Err(e) => {
            error!(error = %e, "Failed to parse verify command");
            ctx.say(format!("Error: {}", e)).await?;
        }
    }

    Ok(())
}

/// Unlink command - unlink your Flash account
#[poise::command(slash_command, prefix_command)]
pub async fn unlink(ctx: Context<'_>) -> Result<(), Error> {
    debug!(user = %ctx.author().name, "Discord /unlink command");

    // Defer reply immediately to avoid 3-second timeout
    ctx.defer().await?;

    let command_ctx = to_command_context(&ctx).await;

    match CommandParser::parse("unlink") {
        Ok(parsed_command) => {
            match ctx.data().router.route(&parsed_command, &command_ctx).await {
                Ok(response) => {
                    ctx.say(response.message).await?;
                }
                Err(e) => {
                    error!(error = %e, "Failed to execute unlink command");
                    ctx.say(format!("Error: {}", e)).await?;
                }
            }
        }
        Err(e) => {
            error!(error = %e, "Failed to parse unlink command");
            ctx.say(format!("Error: {}", e)).await?;
        }
    }

    Ok(())
}

/// Send command - send Bitcoin via Lightning
#[poise::command(slash_command, prefix_command)]
pub async fn send(
    ctx: Context<'_>,
    #[description = "Amount to send"] amount: i64,
    #[description = "Recipient (Lightning address or invoice)"] recipient: String,
    #[description = "Optional memo"] memo: Option<String>,
) -> Result<(), Error> {
    debug!(user = %ctx.author().name, amount = %amount, "Discord /send command");

    // Defer reply immediately to avoid 3-second timeout
    ctx.defer().await?;

    let command_ctx = to_command_context(&ctx).await;
    let command_text = if let Some(m) = memo {
        format!("send {} sats to {} memo {}", amount, recipient, m)
    } else {
        format!("send {} sats to {}", amount, recipient)
    };

    match CommandParser::parse(&command_text) {
        Ok(parsed_command) => {
            match ctx.data().router.route(&parsed_command, &command_ctx).await {
                Ok(response) => {
                    ctx.say(response.message).await?;
                }
                Err(e) => {
                    error!(error = %e, "Failed to execute send command");
                    ctx.say(format!("Error: {}", e)).await?;
                }
            }
        }
        Err(e) => {
            error!(error = %e, "Failed to parse send command");
            ctx.say(format!("Error: {}", e)).await?;
        }
    }

    Ok(())
}

/// Get all commands to register with poise framework
pub fn commands() -> Vec<poise::Command<Data, Error>> {
    vec![help(), balance(), price(), link(), verify(), unlink(), send()]
}
