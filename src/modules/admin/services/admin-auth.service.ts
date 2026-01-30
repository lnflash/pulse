import { Injectable, UnauthorizedException, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../../../common/redis/redis.service';
import { MESSAGE_TRANSPORT } from '../../queue/queue.module';
import { MessageTransport } from '../../../core/ports/message-transport.port';
import {
  OutboundMessage,
  OutboundTextContent,
  FormattedText,
  ChatId,
  Platform,
} from '../../../core/types';
import { AdminLoginDto, AdminVerifyOtpDto, AdminSessionDto } from '../dto/admin-auth.dto';
import * as crypto from 'crypto';

interface TempSession {
  phoneNumber: string;
  createdAt: number;
}

interface AdminSession {
  id: string;
  phoneNumber: string;
  accessToken: string;
  refreshToken: string;
  createdAt: number;
  lastActivity: number;
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);
  private readonly adminNumbers: string[];
  private readonly otpExpiry = 300; // 5 minutes

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    @Inject(MESSAGE_TRANSPORT) private readonly messageTransport: MessageTransport,
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
    const otp = await this.generateOtp(sessionId);

    // Send OTP via MessageTransport (platform-agnostic)
    await this.sendOtpMessage(cleanNumber, otp);

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
    const isValid = await this.verifyOtpCode(sessionId, otp);
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
   * Send OTP via MessageTransport (platform-agnostic)
   */
  private async sendOtpMessage(phoneNumber: string, otp: string): Promise<void> {
    try {
      const formattedText: FormattedText = [
        { type: 'text', value: '🔐 ' },
        { type: 'bold', value: 'Admin Dashboard Login' },
        { type: 'newline' },
        { type: 'newline' },
        { type: 'text', value: 'Your verification code is: ' },
        { type: 'bold', value: otp },
        { type: 'newline' },
        { type: 'newline' },
        { type: 'text', value: 'This code expires in 5 minutes.' },
        { type: 'newline' },
        { type: 'text', value: "If you didn't request this, please ignore." },
      ];

      const content: OutboundTextContent = {
        type: 'text',
        body: formattedText,
      };

      const outboundMessage: OutboundMessage = {
        to: ChatId.create({
          platform: Platform.WhatsAppCloud,
          platformChatId: phoneNumber,
          isGroup: false,
        }),
        content,
      };

      await this.messageTransport.publishOutbound(outboundMessage);
    } catch (error) {
      this.logger.error('Failed to send OTP via MessageTransport:', error);
      throw new Error('Failed to send OTP');
    }
  }

  /**
   * Generate OTP
   */
  private async generateOtp(sessionId: string): Promise<string> {
    const otp = this.generateNumericOtp(6);
    const otpKey = `admin:otp:${sessionId}`;
    const otpHash = this.hashOtp(otp);

    await this.redisService.set(otpKey, otpHash, this.otpExpiry);

    return otp;
  }

  /**
   * Verify OTP code
   */
  private async verifyOtpCode(sessionId: string, otpCode: string): Promise<boolean> {
    const otpKey = `admin:otp:${sessionId}`;
    const storedHash = await this.redisService.get(otpKey);

    if (!storedHash) {
      return false;
    }

    const providedHash = this.hashOtp(otpCode);
    const isValid = storedHash === providedHash;

    if (isValid) {
      // Delete OTP to prevent reuse
      await this.redisService.del(otpKey);
    }

    return isValid;
  }

  /**
   * Generate numeric OTP
   */
  private generateNumericOtp(length: number): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;

    const randomBytes = crypto.randomBytes(4);
    const randomNumber = min + (randomBytes.readUInt32BE(0) % (max - min + 1));

    return randomNumber.toString().padStart(length, '0');
  }

  /**
   * Hash OTP for secure storage
   */
  private hashOtp(otp: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(otp + this.configService.get<string>('security.jwtSecret'));
    return hash.digest('hex');
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
    const tempSession: TempSession = {
      phoneNumber,
      createdAt: Date.now(),
    };

    await this.redisService.set(
      `admin:temp:${sessionId}`,
      JSON.stringify(tempSession),
      300, // 5 minutes
    );

    return sessionId;
  }

  private async getTempSession(sessionId: string): Promise<TempSession | null> {
    const data = await this.redisService.get(`admin:temp:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  private async deleteTempSession(sessionId: string): Promise<void> {
    await this.redisService.del(`admin:temp:${sessionId}`);
  }

  private async createAdminSession(
    phoneNumber: string,
    accessToken: string,
    refreshToken: string,
  ): Promise<AdminSession> {
    const sessionId = this.generateSessionId();
    const session: AdminSession = {
      id: sessionId,
      phoneNumber,
      accessToken,
      refreshToken,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    await this.redisService.set(
      `admin:session:${sessionId}`,
      JSON.stringify(session),
      604800, // 7 days
    );

    return session;
  }

  private async updateAdminSession(
    phoneNumber: string,
    accessToken: string,
    refreshToken: string,
  ): Promise<AdminSession> {
    const pattern = 'admin:session:*';
    let cursor = '0';
    const keys: string[] = [];

    do {
      const [nextCursor, matchedKeys] = await this.redisService.scan(cursor, pattern, 100);
      keys.push(...matchedKeys);
      cursor = nextCursor;
    } while (cursor !== '0');

    for (const key of keys) {
      const data = await this.redisService.get(key);
      if (data) {
        const session: AdminSession = JSON.parse(data);
        if (session.phoneNumber === phoneNumber) {
          session.accessToken = accessToken;
          session.refreshToken = refreshToken;
          session.lastActivity = Date.now();

          await this.redisService.set(key, JSON.stringify(session), 604800);
          return session;
        }
      }
    }

    return this.createAdminSession(phoneNumber, accessToken, refreshToken);
  }

  private async deleteAdminSession(sessionId: string): Promise<void> {
    await this.redisService.del(`admin:session:${sessionId}`);
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}
