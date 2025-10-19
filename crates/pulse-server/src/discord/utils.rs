//! Discord UI utilities for rich embeds, buttons, and components

use poise::serenity_prelude as serenity;
use qrcode::QrCode;
use image::{ImageBuffer, ImageEncoder, Luma};
use base64::{Engine as _, engine::general_purpose};
use std::io::Cursor;

/// Colors for different message types (Discord color codes)
pub mod colors {
    pub const SUCCESS: u32 = 0x00FF00; // Green
    pub const ERROR: u32 = 0xFF0000;   // Red
    pub const WARNING: u32 = 0xFFA500; // Orange
    pub const INFO: u32 = 0x0099FF;    // Blue
    pub const PENDING: u32 = 0xFFFF00; // Yellow
    pub const BITCOIN: u32 = 0xF7931A; // Bitcoin orange
}

/// Emojis for consistent iconography
pub mod emojis {
    pub const CHECK: &str = "✅";
    pub const CROSS: &str = "❌";
    pub const MONEY: &str = "💰";
    pub const SEND: &str = "📤";
    pub const RECEIVE: &str = "📥";
    pub const PENDING: &str = "⏳";
    pub const BITCOIN: &str = "₿";
    pub const LIGHTNING: &str = "⚡";
    pub const REFRESH: &str = "🔄";
    pub const SETTINGS: &str = "⚙️";
    pub const HELP: &str = "❓";
    pub const INFO: &str = "ℹ️";
    pub const PREV: &str = "◀️";
    pub const NEXT: &str = "▶️";
    pub const LINK: &str = "🔗";
    pub const UNLINK: &str = "🔓";
}

/// Build a payment confirmation embed
pub fn build_payment_confirmation_embed(
    amount_sats: i64,
    recipient: &str,
    memo: Option<&str>,
    fee_estimate: Option<i64>,
) -> serenity::CreateEmbed {
    let mut embed = serenity::CreateEmbed::default();

    embed = embed
        .title(format!("{} Payment Confirmation", emojis::MONEY))
        .color(colors::WARNING)
        .field("Amount", format!("{} sats", format_sats(amount_sats)), true)
        .field("Recipient", recipient, true);

    if let Some(fee) = fee_estimate {
        embed = embed.field("Network Fee", format!("{} sats", fee), true);
    }

    if let Some(m) = memo {
        embed = embed.field("Memo", m, false);
    }

    embed = embed
        .footer(serenity::CreateEmbedFooter::new("This confirmation will expire in 30 seconds"))
        .timestamp(serenity::Timestamp::now());

    embed
}

/// Build a transaction receipt embed
pub fn build_transaction_receipt_embed(
    amount_sats: i64,
    recipient: &str,
    tx_id: &str,
    status: &str,
) -> serenity::CreateEmbed {
    let (color, status_emoji) = match status.to_lowercase().as_str() {
        "success" | "completed" => (colors::SUCCESS, emojis::CHECK),
        "failed" | "error" => (colors::ERROR, emojis::CROSS),
        _ => (colors::PENDING, emojis::PENDING),
    };

    serenity::CreateEmbed::default()
        .title(format!("{} Payment {}", status_emoji, status))
        .color(color)
        .field("Amount", format!("{} sats", format_sats(amount_sats)), true)
        .field("Recipient", recipient, true)
        .field("Transaction ID", format!("`{}`", tx_id), false)
        .timestamp(serenity::Timestamp::now())
}

/// Build an invoice embed with QR code
pub fn build_invoice_embed(
    amount_sats: i64,
    invoice: &str,
    memo: Option<&str>,
) -> Result<serenity::CreateEmbed, String> {
    let mut embed = serenity::CreateEmbed::default();

    embed = embed
        .title(format!("{} Lightning Invoice", emojis::LIGHTNING))
        .color(colors::BITCOIN)
        .field("Amount", format!("{} sats", format_sats(amount_sats)), true)
        .field("Status", format!("{} Awaiting payment", emojis::PENDING), true);

    if let Some(m) = memo {
        embed = embed.field("Memo", m, false);
    }

    // Add truncated invoice
    let truncated = if invoice.len() > 50 {
        format!("{}...{}", &invoice[..25], &invoice[invoice.len()-25..])
    } else {
        invoice.to_string()
    };
    embed = embed.field("Invoice", format!("`{}`", truncated), false);

    embed = embed
        .footer(serenity::CreateEmbedFooter::new("Scan QR code or copy invoice to pay"))
        .timestamp(serenity::Timestamp::now());

    Ok(embed)
}

/// Build a balance embed
pub fn build_balance_embed(
    balance_sats: i64,
    btc_price_usd: f64,
    wallet_type: &str,
    last_updated: chrono::DateTime<chrono::Utc>,
) -> serenity::CreateEmbed {
    let balance_btc = balance_sats as f64 / 100_000_000.0;
    let balance_usd = balance_btc * btc_price_usd;

    serenity::CreateEmbed::default()
        .title(format!("{} Wallet Balance", emojis::BITCOIN))
        .color(colors::BITCOIN)
        .field("Sats", format!("{} sats", format_sats(balance_sats)), true)
        .field("BTC", format!("₿ {:.8}", balance_btc), true)
        .field("USD", format!("${:.2}", balance_usd), true)
        .field("Wallet Type", wallet_type, false)
        .footer(serenity::CreateEmbedFooter::new(format!(
            "Last updated: {}",
            format_timestamp(&last_updated)
        )))
        .timestamp(serenity::Timestamp::now())
}

/// Create confirm/cancel action row
pub fn create_confirm_cancel_buttons(custom_id_prefix: &str) -> serenity::CreateActionRow {
    serenity::CreateActionRow::Buttons(vec![
        serenity::CreateButton::new(format!("{}_confirm", custom_id_prefix))
            .label("Confirm")
            .style(serenity::ButtonStyle::Success)
            .emoji(serenity::ReactionType::Unicode(emojis::CHECK.to_string())),
        serenity::CreateButton::new(format!("{}_cancel", custom_id_prefix))
            .label("Cancel")
            .style(serenity::ButtonStyle::Danger)
            .emoji(serenity::ReactionType::Unicode(emojis::CROSS.to_string())),
    ])
}

/// Create pagination buttons
pub fn create_pagination_buttons(
    custom_id_prefix: &str,
    has_prev: bool,
    has_next: bool,
    current_page: usize,
    total_pages: usize,
) -> serenity::CreateActionRow {
    serenity::CreateActionRow::Buttons(vec![
        serenity::CreateButton::new(format!("{}_prev", custom_id_prefix))
            .label("Previous")
            .style(serenity::ButtonStyle::Secondary)
            .emoji(serenity::ReactionType::Unicode(emojis::PREV.to_string()))
            .disabled(!has_prev),
        serenity::CreateButton::new(format!("{}_page", custom_id_prefix))
            .label(format!("Page {}/{}", current_page + 1, total_pages))
            .style(serenity::ButtonStyle::Secondary)
            .disabled(true),
        serenity::CreateButton::new(format!("{}_next", custom_id_prefix))
            .label("Next")
            .style(serenity::ButtonStyle::Secondary)
            .emoji(serenity::ReactionType::Unicode(emojis::NEXT.to_string()))
            .disabled(!has_next),
    ])
}

/// Create a "Pay Now" button for an invoice
pub fn create_pay_invoice_button(invoice_id: &str) -> serenity::CreateActionRow {
    serenity::CreateActionRow::Buttons(vec![
        serenity::CreateButton::new(format!("pay_invoice:{}", invoice_id))
            .label("Pay Now")
            .style(serenity::ButtonStyle::Primary)
            .emoji(serenity::ReactionType::Unicode(emojis::LIGHTNING.to_string())),
    ])
}

/// Generate QR code as PNG bytes
pub fn generate_qr_code_png(data: &str) -> Result<Vec<u8>, String> {
    // Generate QR code
    let code = QrCode::new(data)
        .map_err(|e| format!("Failed to generate QR code: {}", e))?;

    // Render as image
    let image_buffer = code.render::<Luma<u8>>()
        .min_dimensions(400, 400)
        .max_dimensions(800, 800)
        .build();

    // Convert to PNG bytes
    let mut png_bytes = Vec::new();
    let mut cursor = Cursor::new(&mut png_bytes);

    image::codecs::png::PngEncoder::new(&mut cursor)
        .write_image(
            image_buffer.as_raw(),
            image_buffer.width(),
            image_buffer.height(),
            image::ColorType::L8,
        )
        .map_err(|e| format!("Failed to encode PNG: {}", e))?;

    Ok(png_bytes)
}

/// Format satoshis with comma separators
pub fn format_sats(sats: i64) -> String {
    let s = sats.to_string();
    let mut result = String::new();
    let mut count = 0;

    for c in s.chars().rev() {
        if count > 0 && count % 3 == 0 {
            result.insert(0, ',');
        }
        result.insert(0, c);
        count += 1;
    }

    result
}

/// Format timestamp for Discord
pub fn format_timestamp(dt: &chrono::DateTime<chrono::Utc>) -> String {
    format!("<t:{}:R>", dt.timestamp())
}

/// Build an error embed
pub fn build_error_embed(title: &str, description: &str) -> serenity::CreateEmbed {
    serenity::CreateEmbed::default()
        .title(format!("{} {}", emojis::CROSS, title))
        .description(description)
        .color(colors::ERROR)
        .timestamp(serenity::Timestamp::now())
}

/// Build a success embed
pub fn build_success_embed(title: &str, description: &str) -> serenity::CreateEmbed {
    serenity::CreateEmbed::default()
        .title(format!("{} {}", emojis::CHECK, title))
        .description(description)
        .color(colors::SUCCESS)
        .timestamp(serenity::Timestamp::now())
}

/// Build an info embed
pub fn build_info_embed(title: &str, description: &str) -> serenity::CreateEmbed {
    serenity::CreateEmbed::default()
        .title(format!("{} {}", emojis::INFO, title))
        .description(description)
        .color(colors::INFO)
        .timestamp(serenity::Timestamp::now())
}
