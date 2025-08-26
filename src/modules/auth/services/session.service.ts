import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { UserSession } from '../interfaces/user-session.interface';
import { GroupAuthService } from './group-auth.service';
import * as crypto from 'crypto';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessionExpiry: number;
  private readonly mfaExpiry: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => GroupAuthService))
    private readonly groupAuthService?: GroupAuthService,
  ) {
    this.sessionExpiry = this.configService.get<number>('security.sessionExpiry') || 86400; // Default 24 hours
    this.mfaExpiry = this.configService.get<number>('security.mfaExpiry') || 300; // Default 5 minutes
  }

  /**
   * Create a new user session
   */
  async createSession(
    whatsappId: string,
    phoneNumber: string,
    flashUserId?: string,
  ): Promise<UserSession> {
    try {
      const sessionId = this.generateSessionId();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.sessionExpiry * 1000);

      const session: UserSession = {
        sessionId,
        whatsappId,
        phoneNumber,
        flashUserId,
        isVerified: !!flashUserId, // Verified if flashUserId is provided
        createdAt: now,
        expiresAt,
        lastActivity: now,
        mfaVerified: false,
        consentGiven: false,
      };

      // Store in Redis with encryption
      const sessionKey = `session:${sessionId}`;
      await this.redisService.setEncrypted(sessionKey, session, this.sessionExpiry);

      // Create secondary index for whatsappId to sessionId mapping (using hashed key)
      const whatsappKey = this.redisService.hashKey('whatsapp', whatsappId);
      await this.redisService.set(whatsappKey, sessionId, this.sessionExpiry);

      return session;
    } catch (error) {
      this.logger.error(`Error creating session: ${error.message}`, error.stack);
      throw new Error('Failed to create user session');
    }
  }

  /**
   * Get a session by session ID
   */
  async getSession(sessionId: string): Promise<UserSession | null> {
    try {
      const sessionKey = `session:${sessionId}`;
      const session = await this.redisService.getEncrypted(sessionKey);

      if (!session) {
        return null;
      }

      return session as UserSession;
    } catch (error) {
      // Check if this is a decryption error
      if (error.message?.includes('decrypt') || error.message?.includes('Decryption failed')) {
        this.logger.warn(
          `Session ${sessionId} cannot be decrypted (possibly created with old encryption keys). Consider running cleanup script.`,
        );
        // Return null instead of throwing to prevent repeated errors
        return null;
      }

      this.logger.error(`Error getting session: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Get session by WhatsApp ID
   */
  async getSessionByWhatsappId(whatsappId: string): Promise<UserSession | null> {
    try {
      const whatsappKey = this.redisService.hashKey('whatsapp', whatsappId);
      let sessionId = await this.redisService.get(whatsappKey);

      // If no session found and this is an @lid format, check for group auth mapping
      if (!sessionId && whatsappId.includes('@lid') && this.groupAuthService) {
        this.logger.debug(`Checking group auth mapping for @lid: ${whatsappId}`);

        const realId = await this.groupAuthService.getRealIdForLid(whatsappId);
        if (realId) {
          this.logger.debug(`Found mapping for @lid: ${whatsappId} -> ${realId}`);
          // Try again with the real ID
          const realWhatsappKey = this.redisService.hashKey('whatsapp', realId);
          sessionId = await this.redisService.get(realWhatsappKey);
        } else {
          this.logger.debug(
            `No mapping found for @lid format: ${whatsappId} - user needs to link from DM first`,
          );
          return null;
        }
      }

      if (!sessionId) {
        return null;
      }

      return this.getSession(sessionId);
    } catch (error) {
      this.logger.error(`Error getting session by WhatsApp ID: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Update session data
   */
  async updateSession(
    sessionId: string,
    updates: Partial<UserSession>,
  ): Promise<UserSession | null> {
    try {
      const session = await this.getSession(sessionId);

      if (!session) {
        return null;
      }

      const now = new Date();
      const updatedSession = {
        ...session,
        ...updates,
        lastActivity: now,
      };

      // Extend session expiry on activity
      updatedSession.expiresAt = new Date(now.getTime() + this.sessionExpiry * 1000);

      const sessionKey = `session:${sessionId}`;
      await this.redisService.setEncrypted(sessionKey, updatedSession, this.sessionExpiry);

      // Also update the whatsappId mapping TTL
      const whatsappKey = this.redisService.hashKey('whatsapp', session.whatsappId);
      await this.redisService.expire(whatsappKey, this.sessionExpiry);

      return updatedSession;
    } catch (error) {
      this.logger.error(`Error updating session: ${error.message}`, error.stack);
      throw new Error('Failed to update session');
    }
  }

  /**
   * Set MFA verification status for a session
   */
  async setMfaVerified(sessionId: string, isVerified: boolean): Promise<UserSession | null> {
    try {
      const session = await this.getSession(sessionId);

      if (!session) {
        return null;
      }

      const now = new Date();
      const mfaExpiresAt = isVerified ? new Date(now.getTime() + this.mfaExpiry * 1000) : undefined;

      return this.updateSession(sessionId, {
        mfaVerified: isVerified,
        mfaExpiresAt,
      });
    } catch (error) {
      this.logger.error(`Error setting MFA status: ${error.message}`, error.stack);
      throw new Error('Failed to update MFA status');
    }
  }

  /**
   * Set consent status for a session
   */
  async setConsent(sessionId: string, consentGiven: boolean): Promise<UserSession | null> {
    try {
      const session = await this.getSession(sessionId);

      if (!session) {
        return null;
      }

      const consentTimestamp = consentGiven ? new Date() : undefined;

      return this.updateSession(sessionId, {
        consentGiven,
        consentTimestamp,
      });
    } catch (error) {
      this.logger.error(`Error setting consent: ${error.message}`, error.stack);
      throw new Error('Failed to update consent status');
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);

      if (!session) {
        return false;
      }

      const sessionKey = `session:${sessionId}`;
      const whatsappKey = `whatsapp:${session.whatsappId}`;

      await this.redisService.del(sessionKey);
      await this.redisService.del(whatsappKey);

      return true;
    } catch (error) {
      this.logger.error(`Error deleting session: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Check if MFA is validated for a session
   */
  async isMfaValidated(sessionId: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);

      if (!session) {
        return false;
      }

      if (!session.mfaVerified || !session.mfaExpiresAt) {
        return false;
      }

      const now = new Date();
      const expiryDate = new Date(session.mfaExpiresAt);

      return now < expiryDate;
    } catch (error) {
      this.logger.error(`Error checking MFA status: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Check if a session is valid and not expired
   */
  async isSessionValid(sessionId: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);

      if (!session) {
        return false;
      }

      const now = new Date();
      const expiryDate = new Date(session.expiresAt);

      if (now > expiryDate) {
        // Clean up expired session
        await this.deleteSession(sessionId);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Error validating session: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Store username to WhatsApp ID mapping
   */
  async storeUsernameMapping(username: string, whatsappId: string): Promise<void> {
    try {
      const usernameKey = `username:${username.toLowerCase()}`;
      await this.redisService.set(usernameKey, whatsappId, this.sessionExpiry);
    } catch (error) {
      this.logger.error(`Error storing username mapping: ${error.message}`, error.stack);
    }
  }

  /**
   * Get WhatsApp ID by username
   */
  async getWhatsappIdByUsername(username: string): Promise<string | null> {
    try {
      const usernameKey = `username:${username.toLowerCase()}`;
      return await this.redisService.get(usernameKey);
    } catch (error) {
      this.logger.error(`Error getting WhatsApp ID by username: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Get session by username
   */
  async getSessionByUsername(username: string): Promise<UserSession | null> {
    try {
      const whatsappId = await this.getWhatsappIdByUsername(username);
      if (!whatsappId) {
        return null;
      }
      return await this.getSessionByWhatsappId(whatsappId);
    } catch (error) {
      this.logger.error(`Error getting session by username: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Get all active sessions
   */
  async getAllActiveSessions(): Promise<UserSession[]> {
    try {
      const sessions: UserSession[] = [];
      const pattern = 'session:*';
      const keys = await this.redisService.keys(pattern);

      for (const key of keys) {
        try {
          const sessionData = (await this.redisService.getEncrypted(key)) as UserSession | null;
          if (sessionData) {
            // Only include verified sessions with auth tokens
            if (sessionData.isVerified && sessionData.flashAuthToken) {
              sessions.push(sessionData);
            }
          }
        } catch {
          // Skip sessions that can't be decrypted (old encryption keys)
        }
      }

      return sessions;
    } catch (error) {
      this.logger.error('Error getting all active sessions:', error);
      return [];
    }
  }

  /**
   * Get all sessions (including unlinked ones) for admin purposes
   */
  async getAllSessions(): Promise<UserSession[]> {
    try {
      const sessions: UserSession[] = [];
      const pattern = 'session:*';
      const keys = await this.redisService.keys(pattern);

      for (const key of keys) {
        try {
          const sessionData = (await this.redisService.getEncrypted(key)) as UserSession | null;
          if (sessionData) {
            sessions.push(sessionData);
          }
        } catch {
          // Skip sessions that can't be decrypted (old encryption keys)
        }
      }

      return sessions;
    } catch (error) {
      this.logger.error('Error getting all sessions:', error);
      return [];
    }
  }

  /**
   * Generic key-value operations for admin dashboard
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.redisService.setEncrypted(key, value, ttl);
  }

  async get(key: string): Promise<any> {
    return this.redisService.getEncrypted(key);
  }

  async delete(key: string): Promise<void> {
    await this.redisService.del(key);
  }

  async getByPattern(pattern: string): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    const keys = await this.redisService.keys(pattern);

    for (const key of keys) {
      try {
        const value = await this.redisService.getEncrypted(key);
        if (value) {
          results.set(key, value);
        }
      } catch {
        // Skip values that can't be decrypted
      }
    }

    return results;
  }
}
