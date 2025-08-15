import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OtpService } from '../../auth/services/otp.service';
import { SessionService } from '../../auth/services/session.service';
import { WhatsAppWebService } from '../../whatsapp/services/whatsapp-web.service';
import { AdminLoginDto, AdminVerifyOtpDto, AdminSessionDto } from '../dto/admin-auth.dto';

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);
  private readonly adminNumbers: string[];

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
    private readonly sessionService: SessionService,
    private readonly whatsappWebService: WhatsAppWebService,
  ) {
    // Load admin numbers from config
    const adminNumbersConfig = this.configService.get<string>('ADMIN_PHONE_NUMBERS', '');
    this.adminNumbers = adminNumbersConfig
      .split(',')
      .map((num) => num.trim())
      .filter((num) => num);
  }

  /**
   * Initiate admin login with phone number
   */
  async initiateLogin(loginDto: AdminLoginDto): Promise<{ message: string; sessionId: string }> {
    const { phoneNumber } = loginDto;

    // Validate phone number format
    const cleanNumber = this.cleanPhoneNumber(phoneNumber);

    // Check if phone number is an admin
    if (!this.isAdminNumber(cleanNumber)) {
      this.logger.warn(`Unauthorized admin login attempt from: ${cleanNumber}`);
      throw new UnauthorizedException('This phone number is not authorized for admin access');
    }

    // Create temporary session
    const sessionId = await this.createTempSession(cleanNumber);

    // Generate OTP
    const otp = await this.otpService.generateOtp(cleanNumber, sessionId);

    // Send OTP via WhatsApp if connected
    if (this.whatsappWebService.isClientReady()) {
      const message =
        `🔐 *Admin Dashboard Login*\n\n` +
        `Your verification code is: *${otp}*\n\n` +
        `This code expires in 5 minutes.\n` +
        `If you didn't request this, please ignore.`;

      try {
        await this.whatsappWebService.sendMessage(`${cleanNumber}@c.us`, message);
      } catch (error) {
        this.logger.error('Failed to send OTP via WhatsApp:', error);
      }
    }

    return {
      message: 'Verification code sent to your WhatsApp',
      sessionId,
    };
  }

  /**
   * Verify OTP and create admin session
   */
  async verifyOtp(verifyDto: AdminVerifyOtpDto): Promise<AdminSessionDto> {
    const { sessionId, otp } = verifyDto;

    // Get temp session
    const tempSession = await this.getTempSession(sessionId);
    if (!tempSession) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const { phoneNumber } = tempSession;

    // Verify OTP
    const isValid = await this.otpService.verifyOtp(sessionId, otp);
    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    // Create JWT token
    const payload = {
      phoneNumber,
      role: 'admin',
      type: 'admin-dashboard',
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '24h',
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d',
    });

    // Create admin session
    const session = await this.createAdminSession(phoneNumber, accessToken, refreshToken);

    // Clean up temp session
    await this.deleteTempSession(sessionId);

    return {
      accessToken,
      refreshToken,
      expiresIn: 86400, // 24 hours
      phoneNumber,
      sessionId: session.id,
    };
  }

  /**
   * Refresh admin session
   */
  async refreshSession(refreshToken: string): Promise<AdminSessionDto> {
    try {
      const payload = this.jwtService.verify(refreshToken);

      if (payload.type !== 'admin-dashboard') {
        throw new UnauthorizedException('Invalid token type');
      }

      const { phoneNumber } = payload;

      // Verify still an admin
      if (!this.isAdminNumber(phoneNumber)) {
        throw new UnauthorizedException('Admin access revoked');
      }

      // Generate new tokens
      const newPayload = {
        phoneNumber,
        role: 'admin',
        type: 'admin-dashboard',
      };

      const accessToken = this.jwtService.sign(newPayload, {
        expiresIn: '24h',
      });

      const newRefreshToken = this.jwtService.sign(newPayload, {
        expiresIn: '7d',
      });

      // Update session
      const session = await this.updateAdminSession(phoneNumber, accessToken, newRefreshToken);

      return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: 86400,
        phoneNumber,
        sessionId: session.id,
      };
    } catch (error) {
      // Re-throw UnauthorizedException with specific message
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // For JWT verify errors, throw generic message
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Logout admin session
   */
  async logout(sessionId: string): Promise<void> {
    await this.deleteAdminSession(sessionId);
  }

  /**
   * Validate admin access token
   */
  async validateToken(token: string): Promise<any> {
    try {
      const payload = this.jwtService.verify(token);

      if (payload.type !== 'admin-dashboard') {
        return null;
      }

      // Verify still an admin
      if (!this.isAdminNumber(payload.phoneNumber)) {
        return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Check if phone number is an admin
   */
  private isAdminNumber(phoneNumber: string): boolean {
    return this.adminNumbers.includes(phoneNumber);
  }

  /**
   * Clean phone number format
   */
  private cleanPhoneNumber(phoneNumber: string): string {
    // Remove all non-digits
    let cleaned = phoneNumber.replace(/\D/g, '');

    // Add country code if missing
    if (!cleaned.startsWith('1') && cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }

    return cleaned;
  }

  /**
   * Session management helpers
   */
  private async createTempSession(phoneNumber: string): Promise<string> {
    const sessionId = this.generateSessionId();
    await this.sessionService.set(
      `admin:temp:${sessionId}`,
      { phoneNumber, createdAt: Date.now() },
      300, // 5 minutes
    );
    return sessionId;
  }

  private async getTempSession(sessionId: string): Promise<any> {
    return this.sessionService.get(`admin:temp:${sessionId}`);
  }

  private async deleteTempSession(sessionId: string): Promise<void> {
    await this.sessionService.delete(`admin:temp:${sessionId}`);
  }

  private async createAdminSession(
    phoneNumber: string,
    accessToken: string,
    refreshToken: string,
  ): Promise<any> {
    const sessionId = this.generateSessionId();
    const session = {
      id: sessionId,
      phoneNumber,
      accessToken,
      refreshToken,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    await this.sessionService.set(
      `admin:session:${sessionId}`,
      session,
      604800, // 7 days
    );

    return session;
  }

  private async updateAdminSession(
    phoneNumber: string,
    accessToken: string,
    refreshToken: string,
  ): Promise<any> {
    // Find existing session
    const sessions = await this.sessionService.getByPattern(`admin:session:*`);

    for (const [key, session] of sessions) {
      if (session.phoneNumber === phoneNumber) {
        session.accessToken = accessToken;
        session.refreshToken = refreshToken;
        session.lastActivity = Date.now();

        await this.sessionService.set(key, session, 604800);
        return session;
      }
    }

    // Create new session if not found
    return this.createAdminSession(phoneNumber, accessToken, refreshToken);
  }

  private async deleteAdminSession(sessionId: string): Promise<void> {
    await this.sessionService.delete(`admin:session:${sessionId}`);
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}
