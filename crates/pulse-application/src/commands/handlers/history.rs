//! Transaction history command handler

use async_trait::async_trait;
use pulse_domain::commands::ParsedCommand;

use crate::commands::{CommandContext, CommandHandler, CommandResponse};
use crate::errors::ApplicationError;

pub struct HistoryHandler;

#[async_trait]
impl CommandHandler for HistoryHandler {
    async fn handle(
        &self,
        command: &ParsedCommand,
        context: &CommandContext,
    ) -> Result<CommandResponse, ApplicationError> {
        // Check if user is authenticated
        if !context.is_authenticated() {
            return Ok(CommandResponse::text(
                "You need to link your account first. Type 'link <phone>' to get started."
            ));
        }

        let limit = command.args.get("limit").map(|s| s.as_str()).unwrap_or("10");

        // TODO: Fetch actual transaction history from Flash API
        // For now, return a placeholder response
        Ok(CommandResponse::text(format!(
            "*Transaction History* (last {})\n\n\
            _Loading..._\n\n\
            _(This command will fetch your real transaction history from Flash API once integrated)_",
            limit
        )))
    }

    fn command_name(&self) -> &str {
        "history"
    }
}
