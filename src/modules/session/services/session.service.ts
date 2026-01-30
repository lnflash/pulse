import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/redis/redis.service';
import { CryptoService } from '../../../common/crypto/crypto.service';
import { Session, SessionPort } from '../../../core/ports/session.port';
import { UserId } from '../../../core/types';

@Injectable()
export class SessionService implements SessionPort {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessionTtl: number;

  constructor(
    private readonly redis: RedisService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {
    this.sessionTtl = this.config.get<number>('security.sessionExpiry') || 86400;
  }

  private sessionKey(userId: UserId): string {
    return `session:${userId.value}`;
  }

  private encryptToken(token: string): string {
    return this.crypto.encrypt(token);
  }

  private decryptToken(encrypted: string): string {
    return this.crypto.decrypt(encrypted);
  }

  private serialize(session: Session): string {
    const toStore = {
      ...session,
      userId: session.userId.value,
      lastActivity: session.lastActivity.toISOString(),
      flashAuthToken: session.flashAuthToken
        ? this.encryptToken(session.flashAuthToken)
        : undefined,
    };
    return JSON.stringify(toStore);
  }

  private deserialize(raw: string): Session {
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      userId: UserId.create(parsed.userId),
      lastActivity: new Date(parsed.lastActivity),
      flashAuthToken: parsed.flashAuthToken ? this.decryptToken(parsed.flashAuthToken) : undefined,
    };
  }

  async getSession(userId: UserId): Promise<Session | null> {
    const key = this.sessionKey(userId);
    const raw = await this.redis.get(key);
    if (!raw) return null;

    try {
      return this.deserialize(raw);
    } catch (error) {
      this.logger.warn(`Failed to deserialize session for ${userId.value}: ${error.message}`);
      return null;
    }
  }

  async getOrCreateSession(userId: UserId): Promise<Session> {
    const existing = await this.getSession(userId);
    if (existing) {
      await this.updateSession(userId, { lastActivity: new Date() });
      return (await this.getSession(userId))!;
    }

    const session: Session = {
      userId,
      lastActivity: new Date(),
    };

    const key = this.sessionKey(userId);
    await this.redis.set(key, this.serialize(session), this.sessionTtl);
    this.logger.log(`Created session for user ${userId.value}`);
    return session;
  }

  async updateSession(userId: UserId, update: Partial<Session>): Promise<void> {
    const existing = await this.getSession(userId);
    if (!existing) {
      throw new Error(`Session not found for user ${userId.value}`);
    }

    const updated: Session = {
      ...existing,
      ...update,
      userId: existing.userId,
      lastActivity: update.lastActivity ?? new Date(),
    };

    const key = this.sessionKey(userId);
    await this.redis.set(key, this.serialize(updated), this.sessionTtl);
  }

  async deleteSession(userId: UserId): Promise<void> {
    const key = this.sessionKey(userId);
    await this.redis.del(key);
  }
}
