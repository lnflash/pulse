//! CLI test harness for testing commands interactively
//!
//! This tool allows you to test command parsing and handling without platform integration.
//! Run with: `cargo run --bin test-commands`

use pulse_application::commands::{CommandContext, CommandRouter};
use pulse_application::services::AuthService;
use pulse_domain::commands::CommandParser;
use pulse_domain::models::{Platform, Session};
use pulse_infrastructure::{create_redis_pool, AppConfig, FlashApiAdapter, FlashApiClient, RedisSessionRepository};
use std::io::{self, Write};
use std::sync::Arc;
use tracing_subscriber;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter("pulse=debug,test_commands=debug")
        .init();

    // Load configuration
    let config = AppConfig::from_env()?;

    // Initialize Redis (optional for test harness)
    let redis_pool = create_redis_pool(&config.redis).await.ok();

    // Create session repository
    let session_repo: Arc<dyn pulse_application::ports::SessionRepository> = if let Some(pool) = redis_pool {
        Arc::new(RedisSessionRepository::new(pool))
    } else {
        eprintln!("Warning: Running without Redis. Session management will not work.");
        eprintln!("Set up Redis or use REDIS_HOST/REDIS_PORT environment variables.");
        // For now, we'll just create a dummy implementation
        // TODO: Create an in-memory session repository for testing
        return Err("Redis required for test harness".into());
    };

    // Create Flash API client
    let flash_client = FlashApiClient::new(&config.flash_api)?;
    let flash_adapter = Arc::new(FlashApiAdapter::new(flash_client));

    // Create auth service
    let auth_service = Arc::new(AuthService::new(
        session_repo.clone(),
        flash_adapter.clone(),
    ));

    println!("\n═══════════════════════════════════════════════════════");
    println!("  Pulse Command Test Harness");
    println!("═══════════════════════════════════════════════════════\n");
    println!("Commands are parsed and routed to their handlers.");
    println!("Type 'quit' or 'exit' to stop.\n");
    println!("Available test modes:");
    println!("  1. Unauthenticated (default)");
    println!("  2. Authenticated (with mock session)");
    println!("  3. Authenticated + MFA verified\n");

    // Select mode
    print!("Select mode [1-3] (default: 1): ");
    io::stdout().flush()?;

    let mut mode_input = String::new();
    io::stdin().read_line(&mut mode_input)?;
    let mode = mode_input.trim().parse::<u8>().unwrap_or(1);

    // Create context based on mode
    let mut context = CommandContext::new(Platform::WhatsApp, "+1234567890@c.us".to_string(), false);

    if mode >= 2 {
        // Create mock session
        let mut session = Session::new(
            Platform::WhatsApp,
            "+1234567890@c.us".to_string(),
            "+1234567890".to_string(),
        );
        session.is_verified = true;
        session.flash_user_id = Some("user_123".to_string());
        session.flash_auth_token = Some("mock_token_123".to_string());

        if mode == 3 {
            // Add MFA verification
            session.mfa_verified = true;
            session.mfa_expires_at = Some(chrono::Utc::now() + chrono::TimeDelta::hours(1));
        }

        context = context.with_session(session);
    }

    println!("\nMode: {}", match mode {
        1 => "Unauthenticated",
        2 => "Authenticated (no MFA)",
        3 => "Authenticated + MFA verified",
        _ => "Unknown",
    });
    println!("Platform: {:?}", context.platform);
    println!("Platform User ID: {}", context.platform_user_id);
    println!("Authenticated: {}", context.is_authenticated());
    println!("MFA Valid: {}\n", context.is_mfa_valid());

    // Create router with dependencies
    let router = CommandRouter::new(auth_service.clone(), flash_adapter.clone());

    println!("Router initialized with {} handlers\n", router.handler_count());
    println!("═══════════════════════════════════════════════════════\n");
    println!("Type a command (e.g., 'help', 'balance', 'send 1000 sats to john'):\n");

    // Interactive loop
    loop {
        print!("> ");
        io::stdout().flush()?;

        let mut input = String::new();
        io::stdin().read_line(&mut input)?;

        let input = input.trim();

        if input.is_empty() {
            continue;
        }

        if input.eq_ignore_ascii_case("quit") || input.eq_ignore_ascii_case("exit") {
            println!("\nGoodbye!\n");
            break;
        }

        // Parse command
        match CommandParser::parse(input) {
            Ok(command) => {
                println!("  └─ Parsed: {:?}", command.command_type);

                // Route command
                match router.route(&command, &context).await {
                    Ok(response) => {
                        println!("\n{}", "─".repeat(55));
                        println!("{}", response.message);
                        if let Some(media) = response.media {
                            println!("\n[Media attached: {:?}]", media);
                        }
                        println!("{}\n", "─".repeat(55));
                    }
                    Err(e) => {
                        println!("\n❌ Error: {}\n", e);
                    }
                }
            }
            Err(e) => {
                println!("\n❌ Parse error: {}\n", e);
            }
        }
    }

    Ok(())
}
