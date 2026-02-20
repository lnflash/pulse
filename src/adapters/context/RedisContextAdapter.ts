/**
 * RedisContextAdapter — ContextStorePort implementation using ioredis.
 *
 * Stores UserContext as JSON strings with configurable TTL.
 * Primary (hot) context cache for production deployments.
 *
 * Key format: `{keyPrefix}{phoneHash}` (default: `pulse:context:{phoneHash}`)
 */

import { Redis as IoRedis } from 'ioredis';
import { UserContextSchema, type UserContext } from '../../core/context/UserContext.js';
import type {
  ContextStorePort,
  ContextLookupResult,
  ContextStoreOptions,
} from '../../ports/ContextStorePort.js';
import { logger } from '../../config/logger.js';

/** Constructor options for RedisContextAdapter. */
export interface RedisContextAdapterOptions {
  /** Redis connection URL, e.g. `redis://localhost:6379` or `rediss://user:pass@host:6380` */
  url: string;
  /** TTL for stored contexts in seconds. Default: 86400 (24 hours). */
  ttlSeconds?: number;
  /** Key prefix. Default: `pulse:context:` */
  keyPrefix?: string;
}

/**
 * RedisContextAdapter — stores UserContext in Redis as JSON with TTL.
 *
 * Errors are caught and logged; all methods return safe fallback values
 * on connection failure so the application degrades gracefully.
 */
export class RedisContextAdapter implements ContextStorePort {
  private readonly redis: IoRedis;
  private readonly defaultTtlSeconds: number;
  private readonly keyPrefix: string;

  constructor(options: RedisContextAdapterOptions) {
    this.defaultTtlSeconds = options.ttlSeconds ?? 86_400; // 24 h
    this.keyPrefix = options.keyPrefix ?? 'pulse:context:';

    this.redis = new IoRedis(options.url, {
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      commandTimeout: 3_000,
    });

    this.redis.on('error', (err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ error: errMsg }, 'RedisContextAdapter: connection error');
    });

    this.redis.on('connect', () => {
      logger.debug('RedisContextAdapter: connected');
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private key(phoneHash: string): string {
    return `${this.keyPrefix}${phoneHash}`;
  }

  // ---------------------------------------------------------------------------
  // ContextStorePort implementation
  // ---------------------------------------------------------------------------

  async loadContext(phoneHash: string): Promise<ContextLookupResult> {
    try {
      const k = this.key(phoneHash);
      const [raw, ttl] = await Promise.all([
        this.redis.get(k),
        this.redis.ttl(k),
      ]);

      if (!raw) {
        return { context: null, found: false };
      }

      const parsed = JSON.parse(raw, reviveDate);
      const context = UserContextSchema.parse(parsed);

      // Approximate age: if TTL is known, age ≈ configured TTL − remaining TTL
      const ageSeconds = ttl > 0
        ? Math.max(0, this.defaultTtlSeconds - ttl)
        : undefined;

      logger.debug({ phoneHash, ageSeconds }, 'RedisContextAdapter: context loaded');
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
    try {
      const ttl = options?.ttlSeconds ?? this.defaultTtlSeconds;
      const json = JSON.stringify(context);
      await this.redis.setex(this.key(phoneHash), ttl, json);
      logger.debug({ phoneHash, ttl }, 'RedisContextAdapter: context saved');
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ phoneHash, error }, 'RedisContextAdapter: failed to save context');
      // Don't rethrow — caller should fall back to cold store
    }
  }

  async deleteContext(phoneHash: string): Promise<void> {
    try {
      await this.redis.del(this.key(phoneHash));
      logger.debug({ phoneHash }, 'RedisContextAdapter: context deleted');
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ phoneHash, error }, 'RedisContextAdapter: failed to delete context');
    }
  }

  async hasContext(phoneHash: string): Promise<boolean> {
    try {
      const exists = await this.redis.exists(this.key(phoneHash));
      return exists === 1;
    } catch {
      return false;
    }
  }

  async touchContext(phoneHash: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.redis.expire(this.key(phoneHash), ttlSeconds);
      return result === 1;
    } catch {
      return false;
    }
  }

  async patchContext(phoneHash: string, patch: Partial<UserContext>): Promise<void> {
    const { context } = await this.loadContext(phoneHash);
    if (!context) {
      throw new Error(`RedisContextAdapter: no context found for phoneHash ${phoneHash}`);
    }
    const merged = UserContextSchema.parse({
      ...context,
      ...patch,
      meta: { ...context.meta, ...patch.meta, updatedAt: new Date() },
    });
    await this.saveContext(phoneHash, merged);
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /** Gracefully close the Redis connection. Call during application shutdown. */
  async disconnect(): Promise<void> {
    try {
      await this.redis.quit();
      logger.debug('RedisContextAdapter: disconnected');
    } catch {
      // ignore — process may be shutting down
    }
  }
}

// ---------------------------------------------------------------------------
// JSON reviver — restore ISO 8601 strings to Date objects
// ---------------------------------------------------------------------------

function reviveDate(_key: string, value: unknown): unknown {
  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)
  ) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date;
  }
  return value;
}
