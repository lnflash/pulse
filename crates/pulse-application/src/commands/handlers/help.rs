//! Help command handler

use async_trait::async_trait;
use pulse_domain::commands::ParsedCommand;

use crate::commands::{CommandContext, CommandHandler, CommandResponse};
use crate::errors::ApplicationError;

pub struct HelpHandler;

#[async_trait]
impl CommandHandler for HelpHandler {
    async fn handle(
        &self,
        _command: &ParsedCommand,
        context: &CommandContext,
    ) -> Result<CommandResponse, ApplicationError> {
        let help_text = if context.is_authenticated() {
            // Authenticated user - show all commands
            r#"*Available commands:*

💰 *Financial*
• `balance` - Check your wallet balance
• `send <amount> <unit> <recipient>` - Send payment
• `receive <amount>` - Generate payment invoice
• `history` - View transaction history
• `price` - Check current BTC price

🔐 *Account*
• `link <phone>` - Link your Flash account
• `unlink` - Unlink your account
• `username` - View or set your username

ℹ️ *Help*
• `help` - Show this message

*Examples:*
• send 1000 sats to john
• receive 5 usd
• balance"#
        } else {
            // Unauthenticated user - show limited commands
            r#"*Welcome to Pulse!* 🚀

To get started, you need to link your Flash account:

• `link <phone>` - Link your Flash account

*Example:*
• link +1234567890

After linking, you'll have access to:
• Check balance
• Send/receive payments
• View transaction history
• And more!

Need help? Just type `help` anytime."#
        };

        Ok(CommandResponse::text(help_text))
    }

    fn command_name(&self) -> &str {
        "help"
    }
}
