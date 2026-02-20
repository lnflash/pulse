/**
 * RedisContextAdapter — ContextStorePort implementation using Redis.
 *
 * Stores UserContext as JSON strings with configurable TTL.
 * Primary context store for production deployments.
 */

import type { Redis } from 'ioredis';
import { UserContextSchema, type UserContext } from '../../core/context/UserContext.js';
import type {
  ContextStorePort,
  ContextLookupResult,
  ContextStoreOptions,
} from '../../ports/ContextStorePort.js';
import { logger } from '../../config/logger.js';

/** Key prefix for all context entries in Redis. */
const KEY_PREFIX = 'pulse:ctx:v5:';

/**
 * RedisContextAdapter — stores UserContext in Redis as JSON.
 *
 * Key format: `pulse:ctx:v5:{phoneHash}`
 */
export class RedisContextAdapter implements ContextStorePort {
  private readonly redis: Redis;
  private readonly defaultTtlSeconds: number;

  constructor(redis: Redis, options: { defaultTtlSeconds?: number } = {}) {
    this.redis = redis;
    this.defaultTtlSeconds = options.defaultTtlSeconds ?? 86_400; // 24h
  }

  private key(phoneHash: string): string {
    return `${KEY_PREFIX}${phoneHash}`;
  }

  async loadContext(phoneHash: string): Promise<ContextLookupResult> {
    const key = this.key(phoneHash);

    try {
      const [raw, ttl] = await Promise.all([
        this.redis.get(key),
        this.redis.ttl(key),
      ]);

      if (!raw) {
        return { context: null, found: false };
      }

      const parsed = JSON.parse(raw, reviveDate);
      const context = UserContextSchema.parse(parsed);

      // Approximate age from TTL
      const ageSeconds =
        ttl > 0 ? Math.max(0, this.defaultTtlSeconds - ttl) : undefined;

      return { context, found: true, ageSeconds };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ phoneHash, error }, 'RedisContextAdapter: failed to load context');
      return { context: null, found: false };
    }
  }

  async saveContext(
    phoneHash: string,
    context: UserContext,
    options?: ContextStoreOptions,
  ): Promise<void> {
    const key = this.key(phoneHash);
    const ttl = options?.ttlSeconds ?? this.defaultTtlSeconds;
    const json = JSON.stringify(context);

    await this.redis.setex(key, ttl, json);
    logger.debug({ phoneHash, ttl }, 'RedisContextAdapter: context saved');
  }

  async deleteContext(phoneHash: string): Promise<void> {
    await this.redis.del(this.key(phoneHash));
    logger.debug({ phoneHash }, 'RedisContextAdapter: context deleted');
  }

  async hasContext(phoneHash: string): Promise<boolean> {
    const exists = await this.redis.exists(this.key(phoneHash));
    return exists === 1;
  }

  async touchContext(phoneHash: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.expire(this.key(phoneHash), ttlSeconds);
    return result === 1;
  }

  async patchContext(phoneHash: string, patch: Partial<UserContext>): Promise<void> {
    const { context } = await this.loadContext(phoneHash);
    if (!context) {
      throw new Error(`RedisContextAdapter: no context found for phoneHash ${phoneHash}`);
    }
    const merged = { ...context, ...patch, meta: { ...context.meta, ...patch.meta, updatedAt: new Date() } };
    await this.saveContext(phoneHash, UserContextSchema.parse(merged));
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}

/**
 * JSON.parse reviver that converts ISO date strings back to Date objects.
 */
function reviveDate(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date;
  }
  return value;
}
