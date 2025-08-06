import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { SessionService } from './session.service';
import { OtpService } from './otp.service';
import { FlashApiService } from '../../flash-api/flash-api.service';
import { AccountLinkRequestDto } from '../dto/account-link-request.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { UserSession } from '../interfaces/user-session.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly sessionService: SessionService,
    private readonly otpService: OtpService,
    private readonly flashApiService: FlashApiService,
  ) {}

  /**
   * Start the account linking process
   */
  async initiateAccountLinking(
    linkRequest: AccountLinkRequestDto,
  ): Promise<{ sessionId: string; otpSent: boolean }> {
    try {
      const { whatsappId, phoneNumber } = linkRequest;

      // Ensure phone number has country code
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

      this.logger.log(
        `Initiating account linking for WhatsApp ID: ${whatsappId}, Phone: ${formattedPhone}`,
      );

      // Check if there's an existing session
      let session = await this.sessionService.getSessionByWhatsappId(whatsappId);

      if (session && session.isVerified) {
        // Already verified
        return { sessionId: session.sessionId, otpSent: false };
      }

      // Create or update session
      if (!session) {
        session = await this.sessionService.createSession(whatsappId, formattedPhone);
      } else {
        session = await this.sessionService.updateSession(session.sessionId, {
          phoneNumber: formattedPhone,
        });
      }

      if (!session) {
        throw new Error('Failed to create or update session');
      }

      // Send OTP via Flash API (to WhatsApp)
      this.logger.debug(`Sending OTP to ${formattedPhone} via Flash API`);
      const result = await this.flashApiService.initiatePhoneVerification(formattedPhone);

      // Check if this requires the mobile app (even if technically "successful")
      if (
        result.errors &&
        result.errors.length > 0 &&
        result.errors[0].message === 'REQUIRES_MOBILE_APP'
      ) {
        // Don't actually send OTP from backend, user needs to use mobile app
        this.logger.log('Backend cannot send OTP. User must use Flash mobile app.');
        // Return success but with otpSent: false to indicate manual process needed
        return { sessionId: session.sessionId, otpSent: false };
      }

      // Check for actual failure
      if (!result.success) {
        const errorMessage = result.errors?.[0]?.message || 'Failed to send verification code';
        throw new BadRequestException(errorMessage);
      }

      // Log any warnings
      if (result.errors && result.errors.length > 0) {
        this.logger.warn(`Phone verification initiated with warning: ${result.errors[0].message}`);
      }

      return { sessionId: session.sessionId, otpSent: true };
    } catch (error) {
      this.logger.error(`Error initiating account linking: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Verify an OTP code for account linking
   */
  async verifyAccountLinking(verifyDto: VerifyOtpDto): Promise<UserSession> {
    try {
      const { sessionId, otpCode } = verifyDto;

      // Verify session exists
      const session = await this.sessionService.getSession(sessionId);
      if (!session) {
        throw new UnauthorizedException('Invalid or expired session');
      }

      // Validate OTP with Flash API and get auth token
      const result = await this.flashApiService.validatePhoneVerification(
        session.phoneNumber,
        otpCode,
      );

      if (!result.authToken) {
        const errorMessage = result.errors?.[0]?.message || 'Invalid or expired verification code';
        throw new UnauthorizedException(errorMessage);
      }

      // Get user details using the auth token
      const userDetails = await this.flashApiService.getUserDetails(result.authToken);

      // Update session with Flash user ID and auth token
      const updatedSession = await this.sessionService.updateSession(sessionId, {
        flashUserId: userDetails.id,
        flashAuthToken: result.authToken,
        isVerified: true,
        mfaVerified: true,
        mfaExpiresAt: new Date(Date.now() + 300000), // 5 minutes
        consentGiven: true, // Auto-grant consent for linked users
        consentTimestamp: new Date(),
        profileName: userDetails.username || undefined, // Store the username for welcome message
      });

      if (!updatedSession) {
        throw new Error('Failed to update session after verification');
      }

      return updatedSession;
    } catch (error) {
      this.logger.error(`Error verifying account linking: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get the Flash auth token from session
   */
  async getFlashAuthToken(sessionId: string): Promise<string | null> {
    try {
      const session = await this.sessionService.getSession(sessionId);
      return session?.flashAuthToken || null;
    } catch (error) {
      this.logger.error(`Error getting Flash auth token: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Validate MFA for a sensitive operation
   */
  async validateMfa(sessionId: string): Promise<boolean> {
    try {
      return this.sessionService.isMfaValidated(sessionId);
    } catch (error) {
      this.logger.error(`Error validating MFA: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Request MFA verification for a session
   */
  async requestMfaVerification(sessionId: string): Promise<{ otpSent: boolean }> {
    try {
      const session = await this.sessionService.getSession(sessionId);

      if (!session) {
        throw new UnauthorizedException('Invalid or expired session');
      }

      if (!session.isVerified || !session.flashUserId) {
        throw new UnauthorizedException('Account not linked');
      }

      // Generate and send OTP
      const _otp = await this.otpService.generateOtp(session.phoneNumber, sessionId);

      // In a real implementation, we would send this OTP via the Flash API or SMS

      return { otpSent: true };
    } catch (error) {
      this.logger.error(`Error requesting MFA verification: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Verify MFA OTP
   */
  async verifyMfa(verifyDto: VerifyOtpDto): Promise<{ verified: boolean }> {
    try {
      const { sessionId, otpCode } = verifyDto;

      // Verify session exists
      const session = await this.sessionService.getSession(sessionId);
      if (!session) {
        throw new UnauthorizedException('Invalid or expired session');
      }

      if (!session.isVerified || !session.flashUserId) {
        throw new UnauthorizedException('Account not linked');
      }

      // Verify OTP
      const isValid = await this.otpService.verifyOtp(sessionId, otpCode);
      if (!isValid) {
        throw new UnauthorizedException('Invalid or expired OTP code');
      }

      // Update MFA status
      await this.sessionService.setMfaVerified(sessionId, true);

      return { verified: true };
    } catch (error) {
      this.logger.error(`Error verifying MFA: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Record user consent
   */
  async recordConsent(sessionId: string, consentGiven: boolean): Promise<UserSession | null> {
    try {
      return this.sessionService.setConsent(sessionId, consentGiven);
    } catch (error) {
      this.logger.error(`Error recording consent: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Unlink WhatsApp account from Flash
   */
  async unlinkAccount(whatsappId: string): Promise<void> {
    try {
      // Get session by WhatsApp ID
      const session = await this.sessionService.getSessionByWhatsappId(whatsappId);

      if (!session) {
        throw new BadRequestException('No linked account found');
      }

      // Delete the session
      await this.sessionService.deleteSession(session.sessionId);
    } catch (error) {
      this.logger.error(`Error unlinking account: ${error.message}`, error.stack);
      throw error;
    }
  }
}
