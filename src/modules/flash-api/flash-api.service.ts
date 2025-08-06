import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash as _createHash, createHmac as _createHmac } from 'crypto';

@Injectable()
export class FlashApiService {
  private readonly logger = new Logger(FlashApiService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl = this.configService.get<string>('flashApi.url') || '';
    this.apiKey = this.configService.get<string>('flashApi.apiKey') || '';
    this.apiSecret = this.configService.get<string>('flashApi.apiSecret') || '';

    if (!this.apiUrl) {
      this.logger.warn('Flash API URL not configured. Flash API functionality will be limited.');
    }
  }

  /**
   * Execute a GraphQL query against the Flash API
   */
  async executeQuery<T>(
    query: string,
    variables: Record<string, any> = {},
    authToken?: string,
  ): Promise<T> {
    try {
      const timestamp = Date.now().toString();
      const headers = this.generateSecureHeaders(query, variables, timestamp, authToken);

      // Only log non-sensitive request info

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query,
          variables,
        }),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // Handle 401 errors specifically - this means backend auth is invalid
        if (response.status === 401) {
          this.logger.warn('Backend auth token invalid or expired (401 error). Users must request codes via the Flash mobile app.');
          // Return a specific error that the auth service can handle
          return {
            data: {
              userPhoneRegistrationInitiate: {
                success: false,
                errors: [{ message: 'REQUIRES_MOBILE_APP' }]
              }
            }
          } as T;
        }
        
        throw new Error(`Flash API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      if (data.errors && data.errors.length > 0) {
        throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
      }

      return data.data as T;
    } catch (error) {
      // Handle connection errors more gracefully
      if (error.name === 'AbortError' || error.message?.includes('fetch failed')) {
        this.logger.error(`Flash API connection failed: ${error.message}`);
        throw new Error('Flash API is currently unreachable. Please try again later.');
      }
      this.logger.error(`Error executing Flash API query: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Generate secure headers for Flash API requests
   */
  private generateSecureHeaders(
    query: string,
    variables: Record<string, any>,
    timestamp: string,
    authToken?: string,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add auth token if provided
    if (authToken) {
      // Check if the token already includes "Bearer" prefix
      if (authToken.startsWith('Bearer ')) {
        headers['Authorization'] = authToken;
      } else {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
    } else {
      // When no auth token, the mobile app sets an empty Authorization header
      headers['Authorization'] = '';
    }

    // The mobile app uses an "Appcheck" header for security
    // For a server-side service, we might not have this, but let's try adding a user agent
    headers['User-Agent'] = 'Flash-WhatsApp-Service/1.0';

    return headers;
  }

  /**
   * Initiate phone registration/login - sends OTP via WhatsApp
   */
  async initiatePhoneVerification(
    phoneNumber: string,
  ): Promise<{ success: boolean; errors?: any[] }> {
    try {
      // If API URL is not configured, throw error
      if (!this.apiUrl) {
        throw new Error('Flash API URL not configured');
      }

      // Check if we have a backend auth token configured
      const backendAuthToken = this.apiKey; // Using apiKey as the backend auth token

      if (!backendAuthToken) {
        this.logger.warn(
          `No backend auth token configured. Users must request codes via the Flash mobile app.`,
        );
        return {
          success: true,
          errors: [
            {
              message: 'REQUIRES_MOBILE_APP',
            },
          ],
        };
      }

      // Use userPhoneRegistrationInitiate with the backend auth token
      const mutation = `
        mutation userPhoneRegistrationInitiate($input: UserPhoneRegistrationInitiateInput!) {
          userPhoneRegistrationInitiate(input: $input) {
            success
            errors {
              message
            }
          }
        }
      `;

      const variables = {
        input: {
          phone: phoneNumber,
          channel: 'WHATSAPP',
        },
      };

      // Execute with the backend auth token
      const result = await this.executeQuery<{
        userPhoneRegistrationInitiate: { success: boolean; errors?: Array<{ message: string }> };
      }>(mutation, variables, backendAuthToken);

      if (!result.userPhoneRegistrationInitiate.success) {
        this.logger.warn(
          `Failed to send verification code: ${JSON.stringify(result.userPhoneRegistrationInitiate.errors)}`,
        );
      }

      return result.userPhoneRegistrationInitiate;
    } catch (error) {
      this.logger.error(`Error initiating phone verification: ${error.message}`, error.stack);

      // If it fails with auth error, fall back to mobile app flow
      if (
        error.message.includes('Not authorized') ||
        error.message.includes('Unauthorized') ||
        error.message.includes('401')
      ) {
        this.logger.warn(
          `Backend auth token invalid or expired (401 error). Users must request codes via the Flash mobile app.`,
        );
        return {
          success: true,
          errors: [
            {
              message: 'REQUIRES_MOBILE_APP',
            },
          ],
        };
      }

      throw error;
    }
  }

  /**
   * Validate phone verification code and get auth token
   */
  async validatePhoneVerification(
    phoneNumber: string,
    code: string,
  ): Promise<{ authToken?: string; errors?: any[] }> {
    try {
      // Try login first (for existing users)
      const loginMutation = `
        mutation userLogin($input: UserLoginInput!) {
          userLogin(input: $input) {
            authToken
            errors {
              message
            }
          }
        }
      `;

      const variables = {
        input: {
          phone: phoneNumber,
          code: code,
        },
      };

      // If API URL is not configured, return error
      if (!this.apiUrl) {
        throw new Error('Flash API URL not configured');
      }

      // Use userLogin mutation which is public and doesn't require auth
      const loginResult = await this.executeQuery<{
        userLogin: {
          authToken?: string;
          totpRequired?: boolean;
          errors?: Array<{ message: string }>;
        };
      }>(loginMutation, variables);

      return loginResult.userLogin;
    } catch (error) {
      this.logger.error(`Error validating phone verification: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get user details using auth token
   */
  async getUserDetails(
    authToken: string,
  ): Promise<{ id: string; phone: string; username?: string }> {
    try {
      const query = `
        query me {
          me {
            id
            phone
            username
          }
        }
      `;

      // If API URL is not configured, throw error
      if (!this.apiUrl) {
        throw new Error('Flash API URL not configured');
      }

      const result = await this.executeQuery<{
        me: { id: string; phone: string; username?: string };
      }>(query, {}, authToken);

      return result.me;
    } catch (error) {
      this.logger.error(`Error getting user details: ${error.message}`, error.stack);
      throw error;
    }
  }
}
