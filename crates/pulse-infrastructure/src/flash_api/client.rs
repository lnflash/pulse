//! Flash API GraphQL client implementation

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tracing::{debug, warn};

use crate::config::FlashApiConfig;
use crate::errors::InfrastructureError;
use pulse_application::dtos;
use super::queries::*;
use super::mutations::*;
use super::types::*;

/// Flash API GraphQL client
pub struct FlashApiClient {
    http_client: Client,
    api_url: String,
    default_auth_token: Option<String>,
}

impl FlashApiClient {
    /// Create a new Flash API client
    pub fn new(config: &FlashApiConfig) -> Result<Self, InfrastructureError> {
        let http_client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| InfrastructureError::Http(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            http_client,
            api_url: config.url.clone(),
            default_auth_token: config.auth_token.clone(),
        })
    }

    /// Execute a GraphQL query or mutation
    async fn execute<T>(
        &self,
        operation: &str,
        variables: Option<Value>,
        auth_token: Option<&str>,
    ) -> Result<GraphQLResponse<T>, InfrastructureError>
    where
        T: serde::de::DeserializeOwned,
    {
        let payload = json!({
            "query": operation,
            "variables": variables.unwrap_or(json!({}))
        });

        debug!(
            operation_type = if operation.contains("mutation") { "mutation" } else { "query" },
            "Executing GraphQL operation"
        );

        // Build headers
        let mut request = self.http_client.post(&self.api_url)
            .header("Content-Type", "application/json")
            .header("User-Agent", "Pulse-WhatsApp-Bot/3.0");

        // Add authorization
        if let Some(token) = auth_token.or(self.default_auth_token.as_deref()) {
            if !token.is_empty() {
                request = request.header(
                    "Authorization",
                    if token.starts_with("Bearer ") {
                        token.to_string()
                    } else {
                        format!("Bearer {}", token)
                    }
                );
            }
        }

        let response = request
            .json(&payload)
            .send()
            .await
            .map_err(|e| InfrastructureError::Http(format!("Request failed: {}", e)))?;

        let status = response.status();
        let body_text = response
            .text()
            .await
            .map_err(|e| InfrastructureError::Http(format!("Failed to read response: {}", e)))?;

        if !status.is_success() {
            return Err(InfrastructureError::GraphQL(format!(
                "GraphQL request failed with status {}: {}",
                status, body_text
            )));
        }

        let graphql_response: GraphQLResponse<T> = serde_json::from_str(&body_text)
            .map_err(|e| InfrastructureError::GraphQL(format!(
                "Failed to parse response: {} (body: {})",
                e, body_text
            )))?;

        if let Some(errors) = &graphql_response.errors {
            warn!(
                error_count = errors.len(),
                errors = ?errors,
                "GraphQL operation returned errors"
            );
        }

        Ok(graphql_response)
    }

    /// Get user information and wallets
    pub async fn get_me(
        &self,
        auth_token: Option<&str>,
    ) -> Result<Option<User>, InfrastructureError> {
        let response: GraphQLResponse<MeResponse> =
            self.execute(ME_WALLETS_QUERY, None, auth_token).await?;

        if let Some(errors) = response.errors {
            if !errors.is_empty() {
                return Err(InfrastructureError::GraphQL(format!(
                    "Failed to get user info: {}",
                    errors[0].message
                )));
            }
        }

        Ok(response.data.and_then(|d| d.me))
    }

    /// Get real-time BTC price
    pub async fn get_realtime_price(
        &self,
        currency: Option<&str>,
    ) -> Result<RealtimePrice, InfrastructureError> {
        let variables = json!({
            "currency": currency.unwrap_or("USD")
        });

        let response: GraphQLResponse<RealtimePriceResponse> =
            self.execute(REALTIME_PRICE_QUERY, Some(variables), None).await?;

        if let Some(errors) = response.errors {
            if !errors.is_empty() {
                return Err(InfrastructureError::GraphQL(format!(
                    "Failed to get price: {}",
                    errors[0].message
                )));
            }
        }

        response
            .data
            .map(|d| d.realtime_price)
            .ok_or_else(|| InfrastructureError::GraphQL("No price data returned".to_string()))
    }

    /// Send a lightning invoice payment
    pub async fn send_lightning_payment(
        &self,
        wallet_id: &str,
        payment_request: &str,
        memo: Option<&str>,
        auth_token: &str,
    ) -> Result<String, InfrastructureError> {
        let variables = json!({
            "input": {
                "walletId": wallet_id,
                "paymentRequest": payment_request,
                "memo": memo
            }
        });

        let response: GraphQLResponse<PaymentSendResponse> =
            self.execute(LN_INVOICE_PAYMENT_SEND_MUTATION, Some(variables), Some(auth_token)).await?;

        // Check for errors
        if let Some(data) = &response.data {
            if let Some(payload) = &data.ln_invoice_payment_send {
                if !payload.errors.is_empty() {
                    return Err(InfrastructureError::GraphQL(format!(
                        "Payment failed: {}",
                        payload.errors[0].message
                    )));
                }

                return Ok(payload.status.clone().unwrap_or_else(|| "UNKNOWN".to_string()));
            }
        }

        Err(InfrastructureError::GraphQL("No payment response data".to_string()))
    }

    /// Send an intra-ledger payment (to another Flash user)
    pub async fn send_intraledger_payment(
        &self,
        wallet_id: &str,
        recipient_wallet_id: &str,
        amount: i64,
        memo: Option<&str>,
        auth_token: &str,
    ) -> Result<String, InfrastructureError> {
        let variables = json!({
            "input": {
                "walletId": wallet_id,
                "recipientWalletId": recipient_wallet_id,
                "amount": amount,
                "memo": memo
            }
        });

        let response: GraphQLResponse<PaymentSendResponse> =
            self.execute(INTRA_LEDGER_PAYMENT_SEND_MUTATION, Some(variables), Some(auth_token)).await?;

        // Check for errors
        if let Some(data) = &response.data {
            if let Some(payload) = &data.intra_ledger_payment_send {
                if !payload.errors.is_empty() {
                    return Err(InfrastructureError::GraphQL(format!(
                        "Payment failed: {}",
                        payload.errors[0].message
                    )));
                }

                return Ok(payload.status.clone().unwrap_or_else(|| "UNKNOWN".to_string()));
            }
        }

        Err(InfrastructureError::GraphQL("No payment response data".to_string()))
    }

    /// Request OTP auth code for phone number
    /// Returns true if OTP was sent successfully
    /// Note: Captcha is disabled in production, so we use dummy geetest values
    pub async fn request_auth_code(
        &self,
        phone: &str,
    ) -> Result<bool, InfrastructureError> {
        // Since captcha is disabled, we provide dummy geetest values
        // These fields are required by the API but not validated when captcha is off
        let variables = json!({
            "input": {
                "phone": phone,
                "challengeCode": "000000",   // geetestChallenge (dummy)
                "validationCode": "000000",  // geetestValidate (dummy)
                "secCode": "000000",         // geetestSeccode (dummy)
                "channel": "WHATSAPP",            // Optional: SMS or WHATSAPP
            }
        });

        let response: GraphQLResponse<CaptchaRequestAuthCodeResponse> =
            self.execute(CAPTCHA_REQUEST_AUTH_CODE_MUTATION, Some(variables), None).await?;

        if let Some(data) = response.data {
            let payload = data.captcha_request_auth_code;

            if !payload.errors.is_empty() {
                return Err(InfrastructureError::GraphQL(format!(
                    "Failed to request auth code: {}",
                    payload.errors[0].message
                )));
            }

            Ok(payload.success.unwrap_or(false))
        } else {
            Err(InfrastructureError::GraphQL("No response data from auth code request".to_string()))
        }
    }

    /// Login with phone number and OTP code
    /// Returns auth token on success
    pub async fn user_login(
        &self,
        phone: &str,
        code: &str,
    ) -> Result<String, InfrastructureError> {
        let variables = json!({
            "input": {
                "phone": phone,
                "code": code,
            }
        });

        let response: GraphQLResponse<UserLoginResponse> =
            self.execute(USER_LOGIN_MUTATION, Some(variables), None).await?;

        if let Some(data) = response.data {
            let payload = data.user_login;

            if !payload.errors.is_empty() {
                return Err(InfrastructureError::GraphQL(format!(
                    "Login failed: {}",
                    payload.errors[0].message
                )));
            }

            payload.auth_token.ok_or_else(|| {
                InfrastructureError::GraphQL("No auth token returned".to_string())
            })
        } else {
            Err(InfrastructureError::GraphQL("No response data from login".to_string()))
        }
    }

    /// Create a Lightning invoice
    pub async fn create_invoice(
        &self,
        auth_token: &str,
        amount_sats: Option<i64>,
        memo: Option<String>,
    ) -> Result<dtos::InvoiceDto, InfrastructureError> {
        use crate::flash_api::queries::{LN_INVOICE_CREATE_MUTATION, LN_NO_AMOUNT_INVOICE_CREATE_MUTATION};

        // First, get the user's default wallet ID
        let user_response: GraphQLResponse<MeResponse> =
            self.execute(ME_WALLETS_QUERY, None, Some(auth_token)).await?;

        let wallet_id = if let Some(data) = user_response.data {
            let user = data.me.ok_or_else(|| {
                InfrastructureError::GraphQL("No user data".to_string())
            })?;
            let account = user.default_account.ok_or_else(|| {
                InfrastructureError::GraphQL("No default account".to_string())
            })?;
            account.default_wallet_id
        } else {
            return Err(InfrastructureError::GraphQL("No response data".to_string()));
        };

        // Create invoice based on whether amount is specified
        if let Some(amount) = amount_sats {
            // Create invoice with fixed amount
            let variables = json!({
                "input": {
                    "walletId": wallet_id,
                    "amount": amount,
                    "memo": memo,
                }
            });

            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct InvoiceCreateResponse {
                ln_invoice_create: InvoicePayload,
            }

            #[derive(Deserialize)]
            struct InvoicePayload {
                errors: Vec<GraphQLError>,
                invoice: Option<Invoice>,
            }

            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Invoice {
                payment_request: String,
                payment_hash: String,
                satoshis: Option<i64>,
            }

            let response: GraphQLResponse<InvoiceCreateResponse> =
                self.execute(LN_INVOICE_CREATE_MUTATION, Some(variables), Some(auth_token)).await?;

            if let Some(data) = response.data {
                let payload = data.ln_invoice_create;

                if !payload.errors.is_empty() {
                    return Err(InfrastructureError::GraphQL(format!(
                        "Invoice creation failed: {}",
                        payload.errors[0].message
                    )));
                }

                let invoice = payload.invoice.ok_or_else(|| {
                    InfrastructureError::GraphQL("No invoice returned".to_string())
                })?;

                Ok(dtos::InvoiceDto {
                    payment_request: invoice.payment_request,
                    payment_hash: invoice.payment_hash,
                    amount_sats: invoice.satoshis,
                })
            } else {
                Err(InfrastructureError::GraphQL("No response data from invoice creation".to_string()))
            }
        } else {
            // Create invoice without amount
            let variables = json!({
                "input": {
                    "walletId": wallet_id,
                    "memo": memo,
                }
            });

            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct NoAmountInvoiceCreateResponse {
                ln_no_amount_invoice_create: NoAmountInvoicePayload,
            }

            #[derive(Deserialize)]
            struct NoAmountInvoicePayload {
                errors: Vec<GraphQLError>,
                invoice: Option<NoAmountInvoice>,
            }

            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct NoAmountInvoice {
                payment_request: String,
                payment_hash: String,
            }

            let response: GraphQLResponse<NoAmountInvoiceCreateResponse> =
                self.execute(LN_NO_AMOUNT_INVOICE_CREATE_MUTATION, Some(variables), Some(auth_token)).await?;

            if let Some(data) = response.data {
                let payload = data.ln_no_amount_invoice_create;

                if !payload.errors.is_empty() {
                    return Err(InfrastructureError::GraphQL(format!(
                        "Invoice creation failed: {}",
                        payload.errors[0].message
                    )));
                }

                let invoice = payload.invoice.ok_or_else(|| {
                    InfrastructureError::GraphQL("No invoice returned".to_string())
                })?;

                Ok(dtos::InvoiceDto {
                    payment_request: invoice.payment_request,
                    payment_hash: invoice.payment_hash,
                    amount_sats: None,
                })
            } else {
                Err(InfrastructureError::GraphQL("No response data from invoice creation".to_string()))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_flash_api_client_creation() {
        let config = FlashApiConfig {
            url: "https://api.flashapp.me/graphql".to_string(),
            auth_token: None,
        };

        let client = FlashApiClient::new(&config);
        assert!(client.is_ok());
    }
}
