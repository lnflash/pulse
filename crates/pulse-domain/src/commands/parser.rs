//! Command parser for converting text messages into structured commands

use regex::Regex;
use std::collections::HashMap;
use once_cell::sync::Lazy;

use super::{CommandType, ParsedCommand};
use crate::errors::DomainError;

/// Command parser that converts text into structured commands
pub struct CommandParser;

// Regex patterns for command parsing (compiled once at startup)
static BALANCE_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(balance|bal|check balance|what'?s? my balance|how much|funds?)$").unwrap()
});

static HELP_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(help|menu|commands?|start|how|what can you do)$").unwrap()
});

static PRICE_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(price|btc price|bitcoin price|rate|exchange rate|current price)$").unwrap()
});

static LINK_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(?:link|connect|register|signup)\s+(\+?[0-9\s\-\(\)]+)$").unwrap()
});

static UNLINK_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(unlink|disconnect|logout|signout|remove account)$").unwrap()
});

static SEND_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)^(?:send|pay|transfer)\s+(\d+(?:\.\d+)?)\s*(sats?|satoshis?|btc|bitcoin|usd?|\$)?\s+(?:to\s+)?(.+)$"
    ).unwrap()
});

static HISTORY_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(history|transactions?|txs?|recent|activity)(?:\s+(\d+))?$").unwrap()
});

static RECEIVE_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(?:receive|invoice|request)\s+(\d+(?:\.\d+)?)\s*(sats?|satoshis?|btc|bitcoin|usd?|\$)?$").unwrap()
});

static USERNAME_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(?:username|set username|my username)\s*(.*)$").unwrap()
});

static VERIFY_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(?:verify|otp|code)\s+(\d{6})$").unwrap()
});

static CONSENT_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(consent|agree|accept|yes|i agree|confirm)$").unwrap()
});

static PENDING_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(pending|pending payments?|awaiting)$").unwrap()
});

impl CommandParser {
    /// Parse a text message into a structured command
    pub fn parse(text: &str) -> Result<ParsedCommand, DomainError> {
        let text = text.trim();

        if text.is_empty() {
            return Err(DomainError::InvalidCommand("Empty message".to_string()));
        }

        // Try to match against known patterns
        if HELP_PATTERN.is_match(text) {
            return Ok(Self::create_command(CommandType::Help, text));
        }

        if BALANCE_PATTERN.is_match(text) {
            return Ok(Self::create_command(CommandType::Balance, text));
        }

        if PRICE_PATTERN.is_match(text) {
            return Ok(Self::create_command(CommandType::Price, text));
        }

        if let Some(caps) = LINK_PATTERN.captures(text) {
            let phone = caps.get(1).unwrap().as_str().trim();
            let mut args = HashMap::new();
            args.insert("phone".to_string(), Self::normalize_phone(phone));

            return Ok(ParsedCommand {
                command_type: CommandType::Link,
                args,
                raw_text: text.to_string(),
            });
        }

        if UNLINK_PATTERN.is_match(text) {
            return Ok(Self::create_command(CommandType::Unlink, text));
        }

        if let Some(caps) = SEND_PATTERN.captures(text) {
            let amount = caps.get(1).unwrap().as_str();
            let unit = caps.get(2).map(|m| m.as_str()).unwrap_or("sats");
            let recipient = caps.get(3).unwrap().as_str().trim();

            let mut args = HashMap::new();
            args.insert("amount".to_string(), amount.to_string());
            args.insert("unit".to_string(), Self::normalize_unit(unit));
            args.insert("recipient".to_string(), recipient.to_string());

            return Ok(ParsedCommand {
                command_type: CommandType::Send,
                args,
                raw_text: text.to_string(),
            });
        }

        if let Some(caps) = RECEIVE_PATTERN.captures(text) {
            let amount = caps.get(1).unwrap().as_str();
            let unit = caps.get(2).map(|m| m.as_str()).unwrap_or("sats");

            let mut args = HashMap::new();
            args.insert("amount".to_string(), amount.to_string());
            args.insert("unit".to_string(), Self::normalize_unit(unit));

            return Ok(ParsedCommand {
                command_type: CommandType::Receive,
                args,
                raw_text: text.to_string(),
            });
        }

        if let Some(caps) = HISTORY_PATTERN.captures(text) {
            let limit = caps.get(2).map(|m| m.as_str()).unwrap_or("10");

            let mut args = HashMap::new();
            args.insert("limit".to_string(), limit.to_string());

            return Ok(ParsedCommand {
                command_type: CommandType::History,
                args,
                raw_text: text.to_string(),
            });
        }

        if let Some(caps) = VERIFY_PATTERN.captures(text) {
            let code = caps.get(1).unwrap().as_str();

            let mut args = HashMap::new();
            args.insert("code".to_string(), code.to_string());

            return Ok(ParsedCommand {
                command_type: CommandType::Verify,
                args,
                raw_text: text.to_string(),
            });
        }

        if CONSENT_PATTERN.is_match(text) {
            return Ok(Self::create_command(CommandType::Consent, text));
        }

        if PENDING_PATTERN.is_match(text) {
            return Ok(Self::create_command(CommandType::Pending, text));
        }

        if let Some(caps) = USERNAME_PATTERN.captures(text) {
            let username_value = caps.get(1).unwrap().as_str().trim();

            if username_value.is_empty() {
                // Just querying username
                return Ok(Self::create_command(CommandType::Username, text));
            } else {
                // Setting username
                let mut args = HashMap::new();
                args.insert("username".to_string(), username_value.to_string());

                return Ok(ParsedCommand {
                    command_type: CommandType::Username,
                    args,
                    raw_text: text.to_string(),
                });
            }
        }

        // If no pattern matched, return Unknown command
        Ok(ParsedCommand {
            command_type: CommandType::Unknown,
            args: HashMap::new(),
            raw_text: text.to_string(),
        })
    }

    /// Create a simple command with no arguments
    fn create_command(command_type: CommandType, text: &str) -> ParsedCommand {
        ParsedCommand {
            command_type,
            args: HashMap::new(),
            raw_text: text.to_string(),
        }
    }

    /// Normalize phone number (remove spaces, dashes, parentheses)
    fn normalize_phone(phone: &str) -> String {
        phone
            .chars()
            .filter(|c| c.is_numeric() || *c == '+')
            .collect()
    }

    /// Normalize currency unit to standard form
    fn normalize_unit(unit: &str) -> String {
        let lower = unit.to_lowercase();
        match lower.as_str() {
            "sat" | "sats" | "satoshi" | "satoshis" => "sats".to_string(),
            "btc" | "bitcoin" => "btc".to_string(),
            "$" | "usd" | "dollar" | "dollars" => "usd".to_string(),
            _ => "sats".to_string(), // default
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_balance() {
        let variations = vec![
            "balance",
            "Balance",
            "BALANCE",
            "bal",
            "check balance",
            "what's my balance",
            "whats my balance",
            "how much",
            "funds",
        ];

        for text in variations {
            let result = CommandParser::parse(text).unwrap();
            assert_eq!(result.command_type, CommandType::Balance, "Failed for: {}", text);
        }
    }

    #[test]
    fn test_parse_help() {
        let variations = vec!["help", "HELP", "menu", "commands", "start", "how", "what can you do"];

        for text in variations {
            let result = CommandParser::parse(text).unwrap();
            assert_eq!(result.command_type, CommandType::Help, "Failed for: {}", text);
        }
    }

    #[test]
    fn test_parse_price() {
        let variations = vec![
            "price",
            "btc price",
            "bitcoin price",
            "rate",
            "exchange rate",
            "current price",
        ];

        for text in variations {
            let result = CommandParser::parse(text).unwrap();
            assert_eq!(result.command_type, CommandType::Price, "Failed for: {}", text);
        }
    }

    #[test]
    fn test_parse_link() {
        let result = CommandParser::parse("link +1234567890").unwrap();
        assert_eq!(result.command_type, CommandType::Link);
        assert_eq!(result.args.get("phone").unwrap(), "+1234567890");

        let result = CommandParser::parse("register +1 (234) 567-8900").unwrap();
        assert_eq!(result.command_type, CommandType::Link);
        assert_eq!(result.args.get("phone").unwrap(), "+12345678900");
    }

    #[test]
    fn test_parse_send() {
        // Send with sats
        let result = CommandParser::parse("send 1000 sats to john").unwrap();
        assert_eq!(result.command_type, CommandType::Send);
        assert_eq!(result.args.get("amount").unwrap(), "1000");
        assert_eq!(result.args.get("unit").unwrap(), "sats");
        assert_eq!(result.args.get("recipient").unwrap(), "john");

        // Send with USD
        let result = CommandParser::parse("pay 5 $ to +1234567890").unwrap();
        assert_eq!(result.command_type, CommandType::Send);
        assert_eq!(result.args.get("amount").unwrap(), "5");
        assert_eq!(result.args.get("unit").unwrap(), "usd");
        assert_eq!(result.args.get("recipient").unwrap(), "+1234567890");

        // Send without unit (defaults to sats)
        let result = CommandParser::parse("transfer 500 alice").unwrap();
        assert_eq!(result.command_type, CommandType::Send);
        assert_eq!(result.args.get("amount").unwrap(), "500");
        assert_eq!(result.args.get("unit").unwrap(), "sats");

        // Decimal amounts
        let result = CommandParser::parse("send 0.001 btc to bob").unwrap();
        assert_eq!(result.args.get("amount").unwrap(), "0.001");
        assert_eq!(result.args.get("unit").unwrap(), "btc");
    }

    #[test]
    fn test_parse_receive() {
        let result = CommandParser::parse("receive 1000 sats").unwrap();
        assert_eq!(result.command_type, CommandType::Receive);
        assert_eq!(result.args.get("amount").unwrap(), "1000");
        assert_eq!(result.args.get("unit").unwrap(), "sats");

        let result = CommandParser::parse("invoice 10 usd").unwrap();
        assert_eq!(result.command_type, CommandType::Receive);
        assert_eq!(result.args.get("amount").unwrap(), "10");
        assert_eq!(result.args.get("unit").unwrap(), "usd");
    }

    #[test]
    fn test_parse_history() {
        let result = CommandParser::parse("history").unwrap();
        assert_eq!(result.command_type, CommandType::History);
        assert_eq!(result.args.get("limit").unwrap(), "10"); // default

        let result = CommandParser::parse("transactions 20").unwrap();
        assert_eq!(result.command_type, CommandType::History);
        assert_eq!(result.args.get("limit").unwrap(), "20");
    }

    #[test]
    fn test_parse_verify() {
        let result = CommandParser::parse("verify 123456").unwrap();
        assert_eq!(result.command_type, CommandType::Verify);
        assert_eq!(result.args.get("code").unwrap(), "123456");

        let result = CommandParser::parse("otp 654321").unwrap();
        assert_eq!(result.command_type, CommandType::Verify);
        assert_eq!(result.args.get("code").unwrap(), "654321");
    }

    #[test]
    fn test_parse_username() {
        let result = CommandParser::parse("username").unwrap();
        assert_eq!(result.command_type, CommandType::Username);
        assert!(result.args.is_empty());

        let result = CommandParser::parse("set username alice123").unwrap();
        assert_eq!(result.command_type, CommandType::Username);
        assert_eq!(result.args.get("username").unwrap(), "alice123");
    }

    #[test]
    fn test_parse_unknown() {
        let result = CommandParser::parse("this is random text").unwrap();
        assert_eq!(result.command_type, CommandType::Unknown);

        let result = CommandParser::parse("xyz123").unwrap();
        assert_eq!(result.command_type, CommandType::Unknown);
    }

    #[test]
    fn test_parse_empty() {
        let result = CommandParser::parse("");
        assert!(result.is_err());

        let result = CommandParser::parse("   ");
        assert!(result.is_err());
    }

    #[test]
    fn test_normalize_phone() {
        assert_eq!(CommandParser::normalize_phone("+1 (234) 567-8900"), "+12345678900");
        assert_eq!(CommandParser::normalize_phone("1234567890"), "1234567890");
        assert_eq!(CommandParser::normalize_phone("+44 20 1234 5678"), "+442012345678");
    }

    #[test]
    fn test_normalize_unit() {
        assert_eq!(CommandParser::normalize_unit("sat"), "sats");
        assert_eq!(CommandParser::normalize_unit("satoshis"), "sats");
        assert_eq!(CommandParser::normalize_unit("BTC"), "btc");
        assert_eq!(CommandParser::normalize_unit("$"), "usd");
        assert_eq!(CommandParser::normalize_unit("USD"), "usd");
        assert_eq!(CommandParser::normalize_unit("unknown"), "sats");
    }
}
