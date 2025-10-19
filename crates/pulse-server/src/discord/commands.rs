//! Poise command handlers that bridge to our CommandRouter
//!
//! This module provides Discord slash commands that delegate to our
//! existing command handlers, ensuring zero code duplication.

use pulse_application::commands::{CommandContext, CommandRouter};
use pulse_application::services::AuthService;
use pulse_domain::commands::CommandParser;
use pulse_domain::models::Platform;
use poise::serenity_prelude as serenity;
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, error, warn};

use super::utils;

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

/// Send command - send Bitcoin via Lightning with payment confirmation
#[poise::command(slash_command)]
pub async fn send(
    ctx: Context<'_>,
    #[description = "Amount to send in sats"] amount: i64,
    #[description = "Recipient (Lightning address or invoice)"] recipient: String,
    #[description = "Optional memo"] memo: Option<String>,
) -> Result<(), Error> {
    debug!(user = %ctx.author().name, amount = %amount, "Discord /send command");

    // Load user session
    let command_ctx = to_command_context(&ctx).await;

    // Check if user is authenticated
    if !command_ctx.is_verified() {
        ctx.send(
            poise::CreateReply::default()
                .content("You need to link your account first. Use `/link <phone-number>` to get started.")
                .ephemeral(true),
        )
        .await?;
        return Ok(());
    }

    // Validate amount
    if amount <= 0 {
        ctx.send(
            poise::CreateReply::default()
                .content("Amount must be greater than 0.")
                .ephemeral(true),
        )
        .await?;
        return Ok(());
    }

    // Build payment confirmation embed
    let embed = utils::build_payment_confirmation_embed(
        amount,
        &recipient,
        memo.as_deref(),
        None, // TODO: Add fee estimation
    );

    // Create confirm/cancel buttons
    let buttons = utils::create_confirm_cancel_buttons("send_payment");

    // Send ephemeral confirmation message
    let reply = ctx
        .send(
            poise::CreateReply::default()
                .embed(embed)
                .components(vec![buttons])
                .ephemeral(true),
        )
        .await?;

    // Wait for button interaction with 30 second timeout
    let interaction = reply
        .message()
        .await?
        .await_component_interaction(ctx.serenity_context())
        .timeout(Duration::from_secs(30))
        .await;

    match interaction {
        Some(interaction) => {
            let custom_id = &interaction.data.custom_id;

            if custom_id == "send_payment_confirm" {
                // User confirmed - execute payment
                interaction
                    .create_response(
                        ctx.serenity_context(),
                        serenity::CreateInteractionResponse::UpdateMessage(
                            serenity::CreateInteractionResponseMessage::new()
                                .embed(
                                    serenity::CreateEmbed::default()
                                        .title(format!("{} Processing Payment...", utils::emojis::PENDING))
                                        .description("Please wait while we process your payment.")
                                        .color(utils::colors::PENDING),
                                )
                                .components(vec![]), // Remove buttons
                        ),
                    )
                    .await?;

                // Execute payment via command router
                let command_text = if let Some(m) = memo {
                    format!("send {} sats to {} memo {}", amount, recipient, m)
                } else {
                    format!("send {} sats to {}", amount, recipient)
                };

                match CommandParser::parse(&command_text) {
                    Ok(parsed_command) => {
                        match ctx.data().router.route(&parsed_command, &command_ctx).await {
                            Ok(_response) => {
                                // Update with success message
                                interaction
                                    .edit_response(
                                        ctx.serenity_context(),
                                        serenity::EditInteractionResponse::new().embed(
                                            utils::build_success_embed(
                                                "Payment Sent!",
                                                &format!(
                                                    "**Amount:** {} sats\n**To:** {}\n\nYour payment has been processed successfully.",
                                                    utils::format_sats(amount),
                                                    recipient
                                                ),
                                            ),
                                        ),
                                    )
                                    .await?;
                            }
                            Err(e) => {
                                error!(error = %e, "Failed to execute payment");
                                interaction
                                    .edit_response(
                                        ctx.serenity_context(),
                                        serenity::EditInteractionResponse::new().embed(
                                            utils::build_error_embed(
                                                "Payment Failed",
                                                &format!(
                                                    "Unable to send payment: {}\n\n\
                                                    Please check:\n\
                                                    • You have sufficient balance\n\
                                                    • The recipient address is valid\n\
                                                    • Your connection is stable",
                                                    e
                                                ),
                                            ),
                                        ),
                                    )
                                    .await?;
                            }
                        }
                    }
                    Err(e) => {
                        error!(error = %e, "Failed to parse send command");
                        interaction
                            .edit_response(
                                ctx.serenity_context(),
                                serenity::EditInteractionResponse::new()
                                    .embed(utils::build_error_embed("Error", &format!("Failed to parse command: {}", e))),
                            )
                            .await?;
                    }
                }
            } else if custom_id == "send_payment_cancel" {
                // User cancelled
                interaction
                    .create_response(
                        ctx.serenity_context(),
                        serenity::CreateInteractionResponse::UpdateMessage(
                            serenity::CreateInteractionResponseMessage::new()
                                .embed(
                                    serenity::CreateEmbed::default()
                                        .title("Payment Cancelled")
                                        .description("The payment has been cancelled.")
                                        .color(utils::colors::INFO),
                                )
                                .components(vec![]),
                        ),
                    )
                    .await?;
            }
        }
        None => {
            // Timeout - update message
            reply
                .edit(
                    ctx,
                    poise::CreateReply::default()
                        .embed(
                            serenity::CreateEmbed::default()
                                .title("Confirmation Expired")
                                .description("The payment confirmation has expired. Please try again.")
                                .color(utils::colors::WARNING),
                        )
                        .components(vec![]),
                )
                .await?;
        }
    }

    Ok(())
}

/// Receive command - create Lightning invoice with QR code
#[poise::command(slash_command)]
pub async fn receive(
    ctx: Context<'_>,
    #[description = "Amount to receive in sats (optional for any-amount invoice)"] amount: Option<i64>,
    #[description = "Optional memo for the invoice"] memo: Option<String>,
) -> Result<(), Error> {
    debug!(user = %ctx.author().name, amount = ?amount, "Discord /receive command");

    // Load user session
    let command_ctx = to_command_context(&ctx).await;

    // Check if user is authenticated
    if !command_ctx.is_verified() {
        ctx.send(
            poise::CreateReply::default()
                .content("You need to link your account first. Use `/link <phone-number>` to get started.")
                .ephemeral(true),
        )
        .await?;
        return Ok(());
    }

    // Build command text for parser
    let command_text = if let Some(amt) = amount {
        format!("receive {} sats", amt)
    } else {
        "receive".to_string()
    };

    match CommandParser::parse(&command_text) {
        Ok(mut parsed_command) => {
            // Add memo to args if provided
            if let Some(m) = memo.as_ref() {
                parsed_command.args.insert("memo".to_string(), m.clone());
            }

            match ctx.data().router.route(&parsed_command, &command_ctx).await {
                Ok(response) => {
                    // Parse invoice JSON from response message
                    if response.message.starts_with("INVOICE:") {
                        let parts: Vec<&str> = response.message.splitn(2, "\n\n").collect();
                        if parts.len() < 2 {
                            ctx.send(
                                poise::CreateReply::default()
                                    .content("Failed to parse invoice response")
                                    .ephemeral(true),
                            )
                            .await?;
                            return Ok(());
                        }

                        let json_str = parts[0].strip_prefix("INVOICE:").unwrap_or("");

                        #[derive(serde::Deserialize)]
                        struct InvoiceData {
                            payment_request: String,
                            payment_hash: String,
                            amount_sats: Option<i64>,
                        }

                        let invoice_data: InvoiceData = match serde_json::from_str(json_str) {
                            Ok(data) => data,
                            Err(e) => {
                                error!(error = %e, "Failed to parse invoice JSON");
                                ctx.send(
                                    poise::CreateReply::default()
                                        .embed(utils::build_error_embed(
                                            "Parse Error",
                                            &format!("Failed to parse invoice data: {}", e),
                                        ))
                                        .ephemeral(true),
                                )
                                .await?;
                                return Ok(());
                            }
                        };

                        let payment_request = &invoice_data.payment_request;
                        let amount_sats = invoice_data.amount_sats;

                        // Generate QR code
                        let qr_bytes = match utils::generate_qr_code_png(payment_request) {
                            Ok(bytes) => bytes,
                            Err(e) => {
                                error!(error = %e, "Failed to generate QR code");
                                ctx.send(
                                    poise::CreateReply::default()
                                        .embed(utils::build_error_embed(
                                            "QR Code Generation Failed",
                                            &format!("Failed to generate QR code: {}", e),
                                        ))
                                        .ephemeral(true),
                                )
                                .await?;
                                return Ok(());
                            }
                        };

                        // Build invoice embed
                        let embed = match utils::build_invoice_embed(
                            amount_sats.unwrap_or(0),
                            payment_request,
                            memo.as_deref(),
                        ) {
                            Ok(embed) => embed,
                            Err(e) => {
                                error!(error = %e, "Failed to build invoice embed");
                                ctx.send(
                                    poise::CreateReply::default()
                                        .embed(utils::build_error_embed(
                                            "Embed Creation Failed",
                                            &format!("Failed to create invoice embed: {}", e),
                                        ))
                                        .ephemeral(true),
                                )
                                .await?;
                                return Ok(());
                            }
                        };

                        // Create QR code attachment
                        let attachment = serenity::CreateAttachment::bytes(qr_bytes, "invoice_qr.png");

                        // Send invoice with QR code
                        ctx.send(
                            poise::CreateReply::default()
                                .embed(embed)
                                .attachment(attachment)
                                .ephemeral(true),
                        )
                        .await?;
                    } else {
                        // Fallback to text response if no metadata
                        ctx.send(
                            poise::CreateReply::default()
                                .content(response.message)
                                .ephemeral(true),
                        )
                        .await?;
                    }
                }
                Err(e) => {
                    error!(error = %e, "Failed to execute receive command");
                    ctx.send(
                        poise::CreateReply::default()
                            .embed(utils::build_error_embed("Invoice Creation Failed", &format!("{}", e)))
                            .ephemeral(true),
                    )
                    .await?;
                }
            }
        }
        Err(e) => {
            error!(error = %e, "Failed to parse receive command");
            ctx.send(
                poise::CreateReply::default()
                    .embed(utils::build_error_embed("Error", &format!("Failed to parse command: {}", e)))
                    .ephemeral(true),
            )
            .await?;
        }
    }

    Ok(())
}

/// Pay Lightning invoice command - pay a Lightning invoice
#[poise::command(slash_command)]
pub async fn pay(
    ctx: Context<'_>,
    #[description = "Lightning invoice (starts with lnbc or lntb)"] invoice: String,
) -> Result<(), Error> {
    debug!(user = %ctx.author().name, invoice_prefix = &invoice[..15.min(invoice.len())], "Discord /pay command");

    // Load user session
    let command_ctx = to_command_context(&ctx).await;

    // Check if user is authenticated
    if !command_ctx.is_verified() {
        ctx.send(
            poise::CreateReply::default()
                .content("You need to link your account first. Use `/link <phone-number>` to get started.")
                .ephemeral(true),
        )
        .await?;
        return Ok(());
    }

    // Basic validation - check invoice format
    let invoice_lower = invoice.to_lowercase();
    if !invoice_lower.starts_with("lnbc") && !invoice_lower.starts_with("lntb") {
        ctx.send(
            poise::CreateReply::default()
                .embed(utils::build_error_embed(
                    "Invalid Invoice",
                    "The provided string doesn't appear to be a valid Lightning invoice.\n\n\
                    Lightning invoices start with 'lnbc' (mainnet) or 'lntb' (testnet).\n\n\
                    Please check the invoice and try again.",
                ))
                .ephemeral(true),
        )
        .await?;
        return Ok(());
    }

    // Build invoice payment confirmation embed
    let embed = serenity::CreateEmbed::default()
        .title(format!("{} Confirm Lightning Payment", utils::emojis::LIGHTNING))
        .description(format!(
            "**Invoice:**\n```{}```\n\n\
            You are about to pay this Lightning invoice.\n\n\
            {} **Warning:** This action cannot be undone. Make sure you trust the invoice source.",
            &invoice[..60.min(invoice.len())],
            utils::emojis::INFO
        ))
        .color(utils::colors::WARNING)
        .footer(serenity::CreateEmbedFooter::new("Click Confirm to proceed with payment"));

    // Create confirm/cancel buttons
    let buttons = utils::create_confirm_cancel_buttons("pay_invoice");

    // Send ephemeral confirmation message
    let reply = ctx
        .send(
            poise::CreateReply::default()
                .embed(embed)
                .components(vec![buttons])
                .ephemeral(true),
        )
        .await?;

    // Wait for button interaction with 30 second timeout
    let interaction = reply
        .message()
        .await?
        .await_component_interaction(ctx.serenity_context())
        .timeout(Duration::from_secs(30))
        .await;

    match interaction {
        Some(interaction) => {
            let custom_id = &interaction.data.custom_id;

            if custom_id == "pay_invoice_confirm" {
                // User confirmed - execute payment
                interaction
                    .create_response(
                        ctx.serenity_context(),
                        serenity::CreateInteractionResponse::UpdateMessage(
                            serenity::CreateInteractionResponseMessage::new()
                                .embed(
                                    serenity::CreateEmbed::default()
                                        .title(format!("{} Processing Payment...", utils::emojis::PENDING))
                                        .description("Please wait while we process your Lightning payment.")
                                        .color(utils::colors::PENDING),
                                )
                                .components(vec![]), // Remove buttons
                        ),
                    )
                    .await?;

                // Execute payment via command router
                let command_text = format!("pay {}", invoice);

                match CommandParser::parse(&command_text) {
                    Ok(parsed_command) => {
                        match ctx.data().router.route(&parsed_command, &command_ctx).await {
                            Ok(_response) => {
                                // Update with success message
                                interaction
                                    .edit_response(
                                        ctx.serenity_context(),
                                        serenity::EditInteractionResponse::new().embed(
                                            utils::build_success_embed(
                                                "Payment Sent!",
                                                &format!(
                                                    "**Invoice:** {}...\n\n\
                                                    {} Your Lightning payment has been processed successfully.",
                                                    &invoice[..20.min(invoice.len())],
                                                    utils::emojis::CHECK
                                                ),
                                            ),
                                        ),
                                    )
                                    .await?;
                            }
                            Err(e) => {
                                error!(error = %e, "Failed to pay invoice");
                                interaction
                                    .edit_response(
                                        ctx.serenity_context(),
                                        serenity::EditInteractionResponse::new().embed(
                                            utils::build_error_embed(
                                                "Payment Failed",
                                                &format!(
                                                    "Unable to pay invoice: {}\n\n\
                                                    Please check:\n\
                                                    • You have sufficient balance\n\
                                                    • The invoice is valid and not expired\n\
                                                    • Your connection is stable",
                                                    e
                                                ),
                                            ),
                                        ),
                                    )
                                    .await?;
                            }
                        }
                    }
                    Err(e) => {
                        error!(error = %e, "Failed to parse pay command");
                        interaction
                            .edit_response(
                                ctx.serenity_context(),
                                serenity::EditInteractionResponse::new()
                                    .embed(utils::build_error_embed("Error", &format!("Failed to parse command: {}", e))),
                            )
                            .await?;
                    }
                }
            } else if custom_id == "pay_invoice_cancel" {
                // User cancelled
                interaction
                    .create_response(
                        ctx.serenity_context(),
                        serenity::CreateInteractionResponse::UpdateMessage(
                            serenity::CreateInteractionResponseMessage::new()
                                .embed(
                                    serenity::CreateEmbed::default()
                                        .title("Payment Cancelled")
                                        .description("The Lightning payment has been cancelled.")
                                        .color(utils::colors::INFO),
                                )
                                .components(vec![]),
                        ),
                    )
                    .await?;
            }
        }
        None => {
            // Timeout - update message
            reply
                .edit(
                    ctx,
                    poise::CreateReply::default()
                        .embed(
                            serenity::CreateEmbed::default()
                                .title("Confirmation Expired")
                                .description("The payment confirmation has expired. Please try again.")
                                .color(utils::colors::WARNING),
                        )
                        .components(vec![]),
                )
                .await?;
        }
    }

    Ok(())
}

/// Transaction history command - display recent transactions
#[poise::command(slash_command)]
pub async fn history(
    ctx: Context<'_>,
    #[description = "Number of transactions to display (default: 10)"] limit: Option<i32>,
) -> Result<(), Error> {
    debug!(user = %ctx.author().name, limit = ?limit, "Discord /history command");

    // Load user session
    let command_ctx = to_command_context(&ctx).await;

    // Check if user is authenticated
    if !command_ctx.is_verified() {
        ctx.send(
            poise::CreateReply::default()
                .content("You need to link your account first. Use `/link <phone-number>` to get started.")
                .ephemeral(true),
        )
        .await?;
        return Ok(());
    }

    // Build command text for parser
    let command_text = if let Some(lim) = limit {
        format!("history {}", lim)
    } else {
        "history".to_string()
    };

    match CommandParser::parse(&command_text) {
        Ok(parsed_command) => {
            match ctx.data().router.route(&parsed_command, &command_ctx).await {
                Ok(response) => {
                    // Parse transaction JSON from response message
                    if response.message.starts_with("TRANSACTIONS:") {
                        let parts: Vec<&str> = response.message.splitn(2, "\n\n").collect();
                        if parts.len() < 2 {
                            ctx.send(
                                poise::CreateReply::default()
                                    .content("Failed to parse transaction history")
                                    .ephemeral(true),
                            )
                            .await?;
                            return Ok(());
                        }

                        let json_str = parts[0].strip_prefix("TRANSACTIONS:").unwrap_or("");

                        #[derive(serde::Deserialize)]
                        struct TransactionData {
                            id: String,
                            status: String,
                            direction: String,
                            memo: Option<String>,
                            settlement_amount: i64,
                            settlement_currency: String,
                            created_at: i64,
                        }

                        let transactions: Vec<TransactionData> = match serde_json::from_str(json_str) {
                            Ok(data) => data,
                            Err(e) => {
                                error!(error = %e, "Failed to parse transaction JSON");
                                ctx.send(
                                    poise::CreateReply::default()
                                        .embed(utils::build_error_embed(
                                            "Parse Error",
                                            &format!("Failed to parse transaction data: {}", e),
                                        ))
                                        .ephemeral(true),
                                )
                                .await?;
                                return Ok(());
                            }
                        };

                        if transactions.is_empty() {
                            ctx.send(
                                poise::CreateReply::default()
                                    .embed(utils::build_info_embed(
                                        "Transaction History",
                                        "No transactions found."
                                    ))
                                    .ephemeral(true),
                            )
                            .await?;
                            return Ok(());
                        }

                        // Build transaction history embed
                        let mut embed = serenity::CreateEmbed::default()
                            .title(format!("{} Transaction History", utils::emojis::MONEY))
                            .description(format!("Last {} transactions", transactions.len()))
                            .color(utils::colors::INFO);

                        for tx in transactions.iter().take(10) {
                            let direction_emoji = if tx.direction == "SEND" { "📤" } else { "📥" };
                            let amount_display = if tx.direction == "SEND" {
                                format!("-{} sats", utils::format_sats(tx.settlement_amount))
                            } else {
                                format!("+{} sats", utils::format_sats(tx.settlement_amount))
                            };

                            let timestamp = chrono::DateTime::from_timestamp(tx.created_at, 0)
                                .map(|dt| format!("<t:{}:R>", tx.created_at))
                                .unwrap_or_else(|| "Unknown".to_string());

                            let memo_text = tx.memo.as_deref().unwrap_or("_No memo_");
                            let status_emoji = match tx.status.as_str() {
                                "SUCCESS" => "✅",
                                "PENDING" => "⏳",
                                "FAILED" => "❌",
                                _ => "❔",
                            };

                            embed = embed.field(
                                format!("{} {} {}", direction_emoji, amount_display, status_emoji),
                                format!("{}\n{}", memo_text, timestamp),
                                false,
                            );
                        }

                        ctx.send(
                            poise::CreateReply::default()
                                .embed(embed)
                                .ephemeral(true),
                        )
                        .await?;
                    } else {
                        // Fallback if no JSON found
                        ctx.send(
                            poise::CreateReply::default()
                                .content(response.message)
                                .ephemeral(true),
                        )
                        .await?;
                    }
                }
                Err(e) => {
                    error!(error = %e, "Failed to execute history command");
                    ctx.send(
                        poise::CreateReply::default()
                            .embed(utils::build_error_embed("History Fetch Failed", &format!("{}", e)))
                            .ephemeral(true),
                    )
                    .await?;
                }
            }
        }
        Err(e) => {
            error!(error = %e, "Failed to parse history command");
            ctx.send(
                poise::CreateReply::default()
                    .embed(utils::build_error_embed("Error", &format!("Failed to parse command: {}", e)))
                    .ephemeral(true),
            )
            .await?;
        }
    }

    Ok(())
}

/// Request payment command - create payment request with QR code
#[poise::command(slash_command)]
pub async fn request(
    ctx: Context<'_>,
    #[description = "Amount to request in sats (optional for any-amount request)"] amount: Option<i64>,
    #[description = "Optional memo for the request"] memo: Option<String>,
) -> Result<(), Error> {
    debug!(user = %ctx.author().name, amount = ?amount, "Discord /request command");

    // Load user session
    let command_ctx = to_command_context(&ctx).await;

    // Check if user is authenticated
    if !command_ctx.is_verified() {
        ctx.send(
            poise::CreateReply::default()
                .content("You need to link your account first. Use `/link <phone-number>` to get started.")
                .ephemeral(true),
        )
        .await?;
        return Ok(());
    }

    // Build command text for parser
    let command_text = if let Some(amt) = amount {
        format!("request {} sats", amt)
    } else {
        "request".to_string()
    };

    match CommandParser::parse(&command_text) {
        Ok(mut parsed_command) => {
            // Add memo to args if provided
            if let Some(m) = memo.as_ref() {
                parsed_command.args.insert("memo".to_string(), m.clone());
            }

            match ctx.data().router.route(&parsed_command, &command_ctx).await {
                Ok(response) => {
                    // Parse request JSON from response message
                    if response.message.starts_with("REQUEST:") {
                        let parts: Vec<&str> = response.message.splitn(2, "\n\n").collect();
                        if parts.len() < 2 {
                            ctx.send(
                                poise::CreateReply::default()
                                    .content("Failed to parse payment request response")
                                    .ephemeral(true),
                            )
                            .await?;
                            return Ok(());
                        }

                        let json_str = parts[0].strip_prefix("REQUEST:").unwrap_or("");

                        #[derive(serde::Deserialize)]
                        struct RequestData {
                            payment_request: String,
                            payment_hash: String,
                            amount_sats: Option<i64>,
                        }

                        let request_data: RequestData = match serde_json::from_str(json_str) {
                            Ok(data) => data,
                            Err(e) => {
                                error!(error = %e, "Failed to parse request JSON");
                                ctx.send(
                                    poise::CreateReply::default()
                                        .embed(utils::build_error_embed(
                                            "Parse Error",
                                            &format!("Failed to parse payment request data: {}", e),
                                        ))
                                        .ephemeral(true),
                                )
                                .await?;
                                return Ok(());
                            }
                        };

                        let payment_request = &request_data.payment_request;
                        let amount_sats = request_data.amount_sats;

                        // Generate QR code
                        let qr_bytes = match utils::generate_qr_code_png(payment_request) {
                            Ok(bytes) => bytes,
                            Err(e) => {
                                error!(error = %e, "Failed to generate QR code");
                                ctx.send(
                                    poise::CreateReply::default()
                                        .embed(utils::build_error_embed(
                                            "QR Code Generation Failed",
                                            &format!("Failed to generate QR code: {}", e),
                                        ))
                                        .ephemeral(true),
                                )
                                .await?;
                                return Ok(());
                            }
                        };

                        // Create payment request embed
                        let embed = match utils::build_invoice_embed(
                            amount_sats.unwrap_or(0),
                            payment_request,
                            memo.as_deref(),
                        ) {
                            Ok(embed) => embed,
                            Err(e) => {
                                error!(error = %e, "Failed to build payment request embed");
                                ctx.send(
                                    poise::CreateReply::default()
                                        .embed(utils::build_error_embed(
                                            "Embed Creation Failed",
                                            &format!("Failed to create payment request embed: {}", e),
                                        ))
                                        .ephemeral(true),
                                )
                                .await?;
                                return Ok(());
                            }
                        };

                        // Create attachment
                        let attachment = serenity::CreateAttachment::bytes(qr_bytes, "payment_request_qr.png");

                        ctx.send(
                            poise::CreateReply::default()
                                .embed(embed)
                                .attachment(attachment)
                                .ephemeral(true),
                        )
                        .await?;
                    } else {
                        // Fallback if no JSON found
                        ctx.send(
                            poise::CreateReply::default()
                                .content(response.message)
                                .ephemeral(true),
                        )
                        .await?;
                    }
                }
                Err(e) => {
                    error!(error = %e, "Failed to execute request command");
                    ctx.send(
                        poise::CreateReply::default()
                            .embed(utils::build_error_embed("Payment Request Failed", &format!("{}", e)))
                            .ephemeral(true),
                    )
                    .await?;
                }
            }
        }
        Err(e) => {
            error!(error = %e, "Failed to parse request command");
            ctx.send(
                poise::CreateReply::default()
                    .embed(utils::build_error_embed("Error", &format!("Failed to parse command: {}", e)))
                    .ephemeral(true),
            )
            .await?;
        }
    }

    Ok(())
}

/// Get all commands to register with poise framework
pub fn commands() -> Vec<poise::Command<Data, Error>> {
    vec![help(), balance(), price(), link(), verify(), unlink(), send(), receive(), request(), pay(), history()]
}
