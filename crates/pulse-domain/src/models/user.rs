//! User domain model

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub phone_number: String,
    pub whatsapp_id: String,
    pub flash_user_id: Option<String>,
    pub username: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl User {
    pub fn new(phone_number: String, whatsapp_id: String) -> Self {
        let now = chrono::Utc::now();
        Self {
            id: Uuid::new_v4(),
            phone_number,
            whatsapp_id,
            flash_user_id: None,
            username: None,
            created_at: now,
            updated_at: now,
        }
    }
}
