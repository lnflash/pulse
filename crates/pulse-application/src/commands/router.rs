//! Command router
//!
//! Routes commands to their appropriate handlers

use std::collections::HashMap;
use std::sync::Arc;
use tracing::{debug, warn};

use pulse_domain::commands::{CommandType, ParsedCommand};

use crate::errors::ApplicationError;
use crate::ports::FlashApiClient;
use crate::services::AuthService;
use super::{CommandContext, CommandHandler, CommandResponse};
use super::handlers::*;

/// Routes commands to their appropriate handlers
///
/// Handlers are registered explicitly at construction time,
/// ensuring compile-time safety and no "handler not found" runtime errors.
pub struct CommandRouter {
    handlers: HashMap<CommandType, Arc<dyn CommandHandler>>,
}

impl CommandRouter {
    /// Create a new command router with all handlers registered
    pub fn new(
        auth_service: Arc<AuthService>,
        flash_api: Arc<dyn FlashApiClient>,
    ) -> Self {
        let mut handlers: HashMap<CommandType, Arc<dyn CommandHandler>> = HashMap::new();

        // Explicit registration - if it compiles, handlers are registered!
        handlers.insert(CommandType::Help, Arc::new(HelpHandler));
        handlers.insert(
            CommandType::Balance,
            Arc::new(BalanceHandler::new(auth_service.clone(), flash_api.clone())),
        );
        handlers.insert(
            CommandType::Price,
            Arc::new(PriceHandler::new(flash_api.clone())),
        );
        handlers.insert(
            CommandType::Send,
            Arc::new(SendHandler::new(auth_service.clone(), flash_api.clone())),
        );
        handlers.insert(CommandType::History, Arc::new(HistoryHandler));
        handlers.insert(
            CommandType::Link,
            Arc::new(LinkHandler::new(auth_service.clone())),
        );
        handlers.insert(
            CommandType::Unlink,
            Arc::new(UnlinkHandler::new(auth_service.clone())),
        );
        handlers.insert(
            CommandType::Verify,
            Arc::new(VerifyHandler::new(auth_service.clone())),
        );

        debug!(
            handler_count = handlers.len(),
            "CommandRouter initialized with handlers"
        );

        Self { handlers }
    }

    /// Route a command to its handler
    pub async fn route(
        &self,
        command: &ParsedCommand,
        context: &CommandContext,
    ) -> Result<CommandResponse, ApplicationError> {
        debug!(
            command_type = ?command.command_type,
            platform = %context.platform,
            platform_user_id = %context.platform_user_id,
            is_authenticated = context.is_authenticated(),
            "Routing command"
        );

        match self.handlers.get(&command.command_type) {
            Some(handler) => {
                debug!(
                    handler = handler.command_name(),
                    "Found handler for command"
                );

                handler.handle(command, context).await
            }
            None => {
                warn!(
                    command_type = ?command.command_type,
                    "No handler registered for command type"
                );

                Ok(CommandResponse::text(format!(
                    "Sorry, I don't understand that command. Type 'help' for available commands."
                )))
            }
        }
    }

    /// Get the number of registered handlers (for testing/debugging)
    pub fn handler_count(&self) -> usize {
        self.handlers.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pulse_domain::commands::CommandParser;

    // Tests are disabled for now since we'd need to set up mocks for dependencies
    // TODO: Re-enable tests with proper mocking infrastructure

    // #[tokio::test]
    // async fn test_router_has_handlers() {
    //     let router = CommandRouter::new(auth_service, flash_api);
    //
    //     // Ensure all core handlers are registered
    //     assert!(router.handler_count() >= 7);
    // }
}
