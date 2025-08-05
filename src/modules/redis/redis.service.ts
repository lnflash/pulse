import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CryptoService } from '../../common/crypto/crypto.service';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redisClient: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(
    private configService: ConfigService,
    private cryptoService: CryptoService,
  ) {}

  async onModuleInit() {
    const redisConfig = this.configService.get('redis');

    this.redisClient = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
    });

    this.redisClient.on('error', (err) => {
      this.logger.error('Redis client error:', err);
    });
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }

  /**
   * Get Redis client instance
   */
  getClient(): Redis {
    return this.redisClient;
  }

  /**
   * Set key with expiry
   */
  async set(key: string, value: string, expiryInSeconds?: number): Promise<void> {
    if (expiryInSeconds) {
      await this.redisClient.set(key, value, 'EX', expiryInSeconds);
    } else {
      await this.redisClient.set(key, value);
    }
  }

  /**
   * Get value by key
   */
  async get(key: string): Promise<string | null> {
    return this.redisClient.get(key);
  }

  /**
   * Set key with expiry only if it doesn't exist
   */
  async setNX(key: string, value: string, expiryInSeconds: number): Promise<boolean> {
    const result = await this.redisClient.set(key, value, 'EX', expiryInSeconds, 'NX');
    return result === 'OK';
  }

  /**
   * Add member to a set
   */
  async addToSet(key: string, member: string): Promise<void> {
    await this.redisClient.sadd(key, member);
  }

  /**
   * Get all members of a set
   */
  async getSetMembers(key: string): Promise<string[]> {
    return this.redisClient.smembers(key);
  }

  /**
   * Get keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    return this.redisClient.keys(pattern);
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.redisClient.exists(key);
    return result === 1;
  }

  /**
   * Increment a counter
   */
  async incr(key: string): Promise<number> {
    return this.redisClient.incr(key);
  }

  /**
   * Set expiry on key
   */
  async expire(key: string, seconds: number): Promise<void> {
    await this.redisClient.expire(key, seconds);
  }

  /**
   * Get time to live for a key
   */
  async ttl(key: string): Promise<number> {
    return this.redisClient.ttl(key);
  }

  /**
   * Publish a message to a channel
   */
  async publish(channel: string, message: string): Promise<number> {
    return this.redisClient.publish(channel, message);
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    const subscriber = this.redisClient.duplicate();

    await subscriber.subscribe(channel);

    subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        callback(message);
      }
    });
  }

  // ============= ENCRYPTED STORAGE METHODS =============

  /**
   * Set encrypted value with optional expiry
   */
  async setEncrypted(key: string, value: any, expiryInSeconds?: number): Promise<void> {
    try {
      const jsonString = JSON.stringify(value);
      const encrypted = this.cryptoService.encrypt(jsonString);

      if (expiryInSeconds) {
        await this.redisClient.set(key, encrypted, 'EX', expiryInSeconds);
      } else {
        await this.redisClient.set(key, encrypted);
      }
    } catch (error) {
      this.logger.error(`Failed to set encrypted value for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get and decrypt value
   */
  async getEncrypted(key: string): Promise<any | null> {
    try {
      const encrypted = await this.redisClient.get(key);
      if (!encrypted) return null;

      const decrypted = this.cryptoService.decrypt(encrypted);
      return JSON.parse(decrypted);
    } catch (error) {
      this.logger.error(`Failed to get encrypted value for key ${key}:`);
      this.logger.error(error);

      // Delete the corrupted key to prevent repeated errors
      await this.redisClient.del(key);

      return null;
    }
  }

  /**
   * Set encrypted value with NX (only if not exists)
   */
  async setNXEncrypted(key: string, value: any, expiryInSeconds: number): Promise<boolean> {
    try {
      const jsonString = JSON.stringify(value);
      const encrypted = this.cryptoService.encrypt(jsonString);

      const result = await this.redisClient.set(key, encrypted, 'EX', expiryInSeconds, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.error(`Failed to setNX encrypted value for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Add encrypted member to a set
   */
  async addToSetEncrypted(key: string, member: any): Promise<void> {
    try {
      const jsonString = JSON.stringify(member);
      const encrypted = this.cryptoService.encrypt(jsonString);
      await this.redisClient.sadd(key, encrypted);
    } catch (error) {
      this.logger.error(`Failed to add encrypted member to set ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get all members of an encrypted set
   */
  async getSetMembersEncrypted(key: string): Promise<any[]> {
    try {
      const encryptedMembers = await this.redisClient.smembers(key);
      const decryptedMembers = [];

      for (const encrypted of encryptedMembers) {
        try {
          const decrypted = this.cryptoService.decrypt(encrypted);
          decryptedMembers.push(JSON.parse(decrypted));
        } catch (error) {
          this.logger.warn(`Failed to decrypt member in set ${key}:`, error);
        }
      }

      return decryptedMembers;
    } catch (error) {
      this.logger.error(`Failed to get encrypted set members for ${key}:`, error);
      return [];
    }
  }

  /**
   * Hash a key for privacy (useful for phone numbers, emails)
   */
  hashKey(prefix: string, identifier: string): string {
    return `${prefix}:${this.cryptoService.hash(identifier)}`;
  }

  /**
   * Get Redis info
   */
  async info(section?: string): Promise<string> {
    if (section) {
      return this.redisClient.info(section);
    }
    return this.redisClient.info();
  }

  /**
   * Get connection status
   */
  get status(): string {
    return this.redisClient.status;
  }

  /**
   * Create a pipeline for batch operations
   */
  pipeline(): any {
    return this.redisClient.pipeline();
  }

  /**
   * Get multiple values at once
   */
  async mget(...keys: string[]): Promise<(string | null)[]> {
    return this.redisClient.mget(...keys);
  }

  /**
   * Delete multiple keys
   */
  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.redisClient.del(...keys);
  }

  /**
   * Hash get
   */
  async hget(key: string, field: string): Promise<string | null> {
    return this.redisClient.hget(key, field);
  }

  /**
   * Hash set
   */
  async hset(key: string, field: string, value: string): Promise<number> {
    return this.redisClient.hset(key, field, value);
  }

  /**
   * Set add
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.redisClient.sadd(key, ...members);
  }

  /**
   * Set remove
   */
  async srem(key: string, ...members: string[]): Promise<number> {
    return this.redisClient.srem(key, ...members);
  }
}
