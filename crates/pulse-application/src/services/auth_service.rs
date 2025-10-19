//! Authentication service
//!
//! Handles user authentication flows including OTP generation,
//! account linking, and session management

use pulse_domain::models::Session;
use std::sync::Arc;
use tracing::{debug, info, warn};

use crate::errors::ApplicationError;
use crate::ports::{FlashApiClient as FlashApiPort, SessionRepository};

/// Authentication service for managing user sessions and Flash account linking
pub struct AuthService {
    session_repo: Arc<dyn SessionRepository>,
    flash_api: Arc<dyn FlashApiPort>,
}

impl AuthService {
    pub fn new(
        session_repo: Arc<dyn SessionRepository>,
        flash_api: Arc<dyn FlashApiPort>,
    ) -> Self {
        Self {
            session_repo,
            flash_api,
        }
    }

    /// Get or create a session for a platform user
    pub async fn get_or_create_session(
        &self,
        platform: pulse_domain::models::Platform,
        platform_user_id: &str,
        platform_identifier: &str,
    ) -> Result<Session, ApplicationError> {
        // Try to find existing session
        if let Some(session) = self.session_repo.find_by_platform_user(platform, platform_user_id).await? {
            if !session.is_expired() {
                debug!(
                    session_id = %session.id,
                    platform = %platform,
                    platform_user_id = %platform_user_id,
                    "Found existing valid session"
                );
                return Ok(session);
            } else {
                // Session expired, delete it
                warn!(
                    session_id = %session.id,
                    platform = %platform,
                    platform_user_id = %platform_user_id,
                    "Session expired, deleting"
                );
                self.session_repo
                    .delete(&session.id.to_string())
                    .await?;
            }
        }

        // Create new session
        let session = Session::new(platform, platform_user_id.to_string(), platform_identifier.to_string());

        info!(
            session_id = %session.id,
            platform = %platform,
            platform_user_id = %platform_user_id,
            "Created new session"
        );

        self.session_repo.save(&session).await?;

        Ok(session)
    }

    /// Link a platform user to their Flash account using an auth token
    pub async fn link_account(
        &self,
        platform: pulse_domain::models::Platform,
        platform_user_id: &str,
        auth_token: &str,
    ) -> Result<Session, ApplicationError> {
        // Get existing session
        let mut session = self
            .session_repo
            .find_by_platform_user(platform, platform_user_id)
            .await?
            .ok_or_else(|| {
                ApplicationError::NotFound(format!(
                    "No session found for {} user: {}",
                    platform, platform_user_id
                ))
            })?;

        // Verify token by fetching user info from Flash API
        let user = self
            .flash_api
            .get_me(Some(auth_token))
            .await?
            .ok_or_else(|| {
                ApplicationError::Authentication("Invalid Flash auth token".to_string())
            })?;

        info!(
            platform = %platform,
            platform_user_id = %platform_user_id,
            flash_user_id = %user.id,
            flash_username = ?user.username,
            "Successfully verified Flash account"
        );

        // Update session with Flash account info
        session.flash_user_id = Some(user.id.clone());
        session.flash_auth_token = Some(auth_token.to_string());
        session.is_verified = true;
        session.updated_at = chrono::Utc::now();

        // Save updated session
        self.session_repo.save(&session).await?;

        info!(
            session_id = %session.id,
            platform = %platform,
            platform_user_id = %platform_user_id,
            flash_user_id = %user.id,
            "Account linked successfully"
        );

        Ok(session)
    }

    /// Verify MFA code for a session
    pub async fn verify_mfa(
        &self,
        platform: pulse_domain::models::Platform,
        platform_user_id: &str,
        _mfa_code: &str,
    ) -> Result<Session, ApplicationError> {
        // Get existing session
        let mut session = self
            .session_repo
            .find_by_platform_user(platform, platform_user_id)
            .await?
            .ok_or_else(|| {
                ApplicationError::NotFound(format!(
                    "No session found for {} user: {}",
                    platform, platform_user_id
                ))
            })?;

        // TODO: Implement actual MFA verification logic
        // For now, we'll just mark as verified
        session.mfa_verified = true;
        session.mfa_expires_at = Some(chrono::Utc::now() + chrono::Duration::hours(1));
        session.updated_at = chrono::Utc::now();

        self.session_repo.save(&session).await?;

        info!(
            session_id = %session.id,
            platform = %platform,
            platform_user_id = %platform_user_id,
            "MFA verified"
        );

        Ok(session)
    }

    /// Record user consent for a session
    pub async fn record_consent(
        &self,
        platform: pulse_domain::models::Platform,
        platform_user_id: &str,
    ) -> Result<Session, ApplicationError> {
        // Get existing session
        let mut session = self
            .session_repo
            .find_by_platform_user(platform, platform_user_id)
            .await?
            .ok_or_else(|| {
                ApplicationError::NotFound(format!(
                    "No session found for {} user: {}",
                    platform, platform_user_id
                ))
            })?;

        session.consent_given = true;
        session.consent_timestamp = Some(chrono::Utc::now());
        session.updated_at = chrono::Utc::now();

        self.session_repo.save(&session).await?;

        info!(
            session_id = %session.id,
            platform = %platform,
            platform_user_id = %platform_user_id,
            "Consent recorded"
        );

        Ok(session)
    }

    /// Check if a session is fully authenticated and ready for operations
    pub async fn is_authenticated(
        &self,
        platform: pulse_domain::models::Platform,
        platform_user_id: &str,
    ) -> Result<bool, ApplicationError> {
        let session = self
            .session_repo
            .find_by_platform_user(platform, platform_user_id)
            .await?;

        Ok(session
            .map(|s| !s.is_expired() && s.is_verified && s.flash_auth_token.is_some())
            .unwrap_or(false))
    }

    /// Get the Flash auth token for an authenticated session
    pub async fn get_auth_token(
        &self,
        platform: pulse_domain::models::Platform,
        platform_user_id: &str,
    ) -> Result<String, ApplicationError> {
        let session = self
            .session_repo
            .find_by_platform_user(platform, platform_user_id)
            .await?
            .ok_or_else(|| {
                ApplicationError::NotFound(format!(
                    "No session found for {} user: {}",
                    platform, platform_user_id
                ))
            })?;

        if session.is_expired() {
            return Err(ApplicationError::Authentication(
                "Session has expired".to_string(),
            ));
        }

        session.flash_auth_token.ok_or_else(|| {
            ApplicationError::Authentication("No Flash auth token found in session".to_string())
        })
    }

    /// Invalidate a session (logout)
    pub async fn logout(
        &self,
        platform: pulse_domain::models::Platform,
        platform_user_id: &str,
    ) -> Result<(), ApplicationError> {
        if let Some(session) = self.session_repo.find_by_platform_user(platform, platform_user_id).await? {
            info!(
                session_id = %session.id,
                platform = %platform,
                platform_user_id = %platform_user_id,
                "Logging out user"
            );
            self.session_repo.delete(&session.id.to_string()).await?;
        }

        Ok(())
    }

    /// Request OTP code for phone number
    /// Stores the phone number in the session's pending_phone field
    pub async fn request_otp_code(
        &self,
        platform: pulse_domain::models::Platform,
        platform_user_id: &str,
        phone: &str,
    ) -> Result<(), ApplicationError> {
        // Get or create session
        let mut session = match self
            .session_repo
            .find_by_platform_user(platform, platform_user_id)
            .await?
        {
            Some(s) => s,
            None => {
                // Create new session - use platform_user_id as identifier for now
                let new_session = Session::new(
                    platform,
                    platform_user_id.to_string(),
                    platform_user_id.to_string(), // Use user ID as identifier
                );
                self.session_repo.save(&new_session).await?;
                new_session
            }
        };

        // Request OTP from Flash API
        let success = self.flash_api.request_auth_code(phone).await?;

        if !success {
            return Err(ApplicationError::External(
                "Failed to send OTP code to phone number".to_string()
            ));
        }

        info!(
            platform = %platform,
            platform_user_id = %platform_user_id,
            phone = %phone,
            "OTP code requested successfully"
        );

        // Store pending phone number in session
        session.pending_phone = Some(phone.to_string());
        session.updated_at = chrono::Utc::now();

        self.session_repo.save(&session).await?;

        Ok(())
    }

    /// Verify OTP code and complete account linking
    pub async fn verify_otp_and_link(
        &self,
        platform: pulse_domain::models::Platform,
        platform_user_id: &str,
        otp_code: &str,
    ) -> Result<Session, ApplicationError> {
        // Get existing session
        let mut session = self
            .session_repo
            .find_by_platform_user(platform, platform_user_id)
            .await?
            .ok_or_else(|| {
                ApplicationError::NotFound(format!(
                    "No session found for {} user: {}",
                    platform, platform_user_id
                ))
            })?;

        // Get pending phone number
        let phone = session.pending_phone.as_ref().ok_or_else(|| {
            ApplicationError::Authentication(
                "No pending phone number. Please use 'link <phone>' first.".to_string()
            )
        })?;

        info!(
            platform = %platform,
            platform_user_id = %platform_user_id,
            phone = %phone,
            "Attempting to verify OTP and login"
        );

        // Login with OTP code to get auth token
        let auth_token = self.flash_api.user_login(phone, otp_code).await?;

        // Verify token by fetching user info
        let user = self
            .flash_api
            .get_me(Some(&auth_token))
            .await?
            .ok_or_else(|| {
                ApplicationError::Authentication("Failed to get user info after login".to_string())
            })?;

        info!(
            platform = %platform,
            platform_user_id = %platform_user_id,
            flash_user_id = %user.id,
            flash_username = ?user.username,
            "Successfully verified OTP and authenticated with Flash"
        );

        // Update session with Flash account info
        session.flash_user_id = Some(user.id.clone());
        session.flash_auth_token = Some(auth_token);
        session.is_verified = true;
        session.pending_phone = None; // Clear pending phone
        session.updated_at = chrono::Utc::now();

        // Save updated session
        self.session_repo.save(&session).await?;

        info!(
            session_id = %session.id,
            platform = %platform,
            platform_user_id = %platform_user_id,
            flash_user_id = %user.id,
            "Account linked successfully via OTP"
        );

        Ok(session)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // TODO: Add unit tests with mock repositories
}
