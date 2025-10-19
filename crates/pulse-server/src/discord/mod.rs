//! Discord integration module
//!
//! This module provides Discord bot functionality using the poise framework,
//! integrating seamlessly with our multi-platform command architecture.

pub mod adapter;
pub mod bot;
pub mod commands;
pub mod utils;

pub use bot::DiscordBot;
