//! Command domain model

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::commands::{CommandType, ParsedCommand};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Command {
    pub id: Uuid,
    pub whatsapp_id: String,
    pub command_type: CommandType,
    pub raw_text: String,
    pub args: std::collections::HashMap<String, String>,
    pub is_voice_input: bool,
    pub processed: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl Command {
    pub fn from_parsed(
        whatsapp_id: String,
        parsed: ParsedCommand,
        is_voice_input: bool,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            whatsapp_id,
            command_type: parsed.command_type,
            raw_text: parsed.raw_text,
            args: parsed.args,
            is_voice_input,
            processed: false,
            created_at: chrono::Utc::now(),
        }
    }
}
