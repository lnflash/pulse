/**
 * SessionRecovery — tracks and recovers pending actions for interrupted conversations.
 *
 * When a user initiates a multi-step action (e.g., a payment awaiting confirmation)
 * and the session is interrupted, this module persists the pending action in Redis
 * so it can be resumed on reconnect.
 *
 * TTL is 5 minutes by default. Actions not confirmed within that window are discarded.
 *
 * Key format: `{keyPrefix}{phoneHash}`
 */

import { Redis as IoRedis } from 'ioredis';
import { z } from 'zod';
import { logger } from '../../config/logger.js';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** Schema for a serialised pending action stored in Redis. */
const PendingActionSchema = z.object({
  /** Phone hash of the user this action belongs to. */
  phoneHash: z.string(),
  /** Action type identifier, e.g. 'payment.confirm', 'kyc.verify'. */
  type: z.string(),
  /** Action-specific payload (amounts, destinations, OTP seeds, etc.). */
  payload: z.record(z.unknown()),
  /** ISO-8601 timestamp when the action was created. */
  createdAt: z.string(),
  /** ISO-8601 timestamp when the action expires. */
  expiresAt: z.string(),
});

export type PendingAction = z.infer<typeof PendingActionSchema>;

/** The input required to save a new pending action. */
export interface PendingActionInput {
  type: string;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SessionRecoveryConfig {
  /** Redis connection URL. */
  redisUrl: string;
  /** Key prefix. Default: `pulse:session:pending:`. */
  keyPrefix?: string;
  /** Timeout for stale actions in seconds. Default: 300 (5 minutes). */
  timeoutSeconds?: number;
}

// ---------------------------------------------------------------------------
// SessionRecovery
// ---------------------------------------------------------------------------

/**
 * SessionRecovery — Redis-backed pending action store.
 *
 * Usage:
 * ```typescript
 * const recovery = new SessionRecovery({ redisUrl: 'redis://localhost:6379' });
 *
 * // Before asking the user to confirm a payment:
 * await recovery.savePendingAction(phoneHash, {
 *   type: 'payment.confirm',
 *   payload: { amountSats: 50000, destination: 'bob@flash.me' },
 * });
 *
 * // On next message from the user:
 * const pending = await recovery.getPendingAction(phoneHash);
 * if (pending?.type === 'payment.confirm') { ... }
 * await recovery.clearPendingAction(phoneHash);
 * ```
 */
export class SessionRecovery {
  private readonly redis: IoRedis;
  private readonly keyPrefix: string;
  private readonly timeoutSeconds: number;

  constructor(config: SessionRecoveryConfig) {
    this.keyPrefix = config.keyPrefix ?? 'pulse:session:pending:';
    this.timeoutSeconds = config.timeoutSeconds ?? 300;

    this.redis = new IoRedis(config.redisUrl, {
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      commandTimeout: 3_000,
    });

    this.redis.on('error', (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ error: msg }, 'SessionRecovery: Redis connection error');
    });

    this.redis.on('connect', () => {
      logger.debug('SessionRecovery: Redis connected');
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private key(phoneHash: string): string {
    return `${this.keyPrefix}${phoneHash}`;
  }

  // ---------------------------------------------------------------------------
  // Public interface
  // ---------------------------------------------------------------------------

  /**
   * Persist a pending action for a user.
   * Overwrites any existing pending action for the same phoneHash.
   *
   * @param phoneHash  SHA-256 hash of the user's E.164 phone number.
   * @param action     Action type + payload to persist.
   */
  async savePendingAction(
    phoneHash: string,
    action: PendingActionInput,
  ): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.timeoutSeconds * 1_000);

    const pending: PendingAction = {
      phoneHash,
      type: action.type,
      payload: action.payload,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    try {
      await this.redis.setex(
        this.key(phoneHash),
        this.timeoutSeconds,
        JSON.stringify(pending),
      );
      logger.debug(
        { phoneHash, actionType: action.type, expiresAt: expiresAt.toISOString() },
        'SessionRecovery: pending action saved',
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ phoneHash, error }, 'SessionRecovery: failed to save pending action');
    }
  }

  /**
   * Retrieve a pending action for a user.
   * Returns null if no action exists or if the action has expired.
   *
   * @param phoneHash  SHA-256 hash of the user's E.164 phone number.
   */
  async getPendingAction(phoneHash: string): Promise<PendingAction | null> {
    try {
      const raw = await this.redis.get(this.key(phoneHash));
      if (!raw) {
        return null;
      }

      // Parse and validate the stored data
      const parsed: unknown = JSON.parse(raw);
      const result = PendingActionSchema.safeParse(parsed);

      if (!result.success) {
        logger.warn(
          { phoneHash, issues: result.error.issues },
          'SessionRecovery: stored action failed schema validation — discarding',
        );
        await this.clearPendingAction(phoneHash);
        return null;
      }

      // Belt-and-suspenders expiry check (Redis TTL is the primary mechanism)
      if (new Date(result.data.expiresAt) <= new Date()) {
        logger.debug(
          { phoneHash, expiresAt: result.data.expiresAt },
          'SessionRecovery: stale pending action — discarding',
        );
        await this.clearPendingAction(phoneHash);
        return null;
      }

      logger.debug(
        { phoneHash, actionType: result.data.type },
        'SessionRecovery: pending action retrieved',
      );
      return result.data;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ phoneHash, error }, 'SessionRecovery: failed to get pending action');
      return null;
    }
  }

  /**
   * Delete a pending action for a user.
   * No-op if no action exists.
   *
   * @param phoneHash  SHA-256 hash of the user's E.164 phone number.
   */
  async clearPendingAction(phoneHash: string): Promise<void> {
    try {
      await this.redis.del(this.key(phoneHash));
      logger.debug({ phoneHash }, 'SessionRecovery: pending action cleared');
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ phoneHash, error }, 'SessionRecovery: failed to clear pending action');
    }
  }

  /**
   * Scan all pending action keys and remove any that have expired.
   *
   * Redis TTL handles expiry automatically; this is a safety net for any keys
   * that may have been written without a TTL.
   *
   * @returns Number of stale entries removed.
   */
  async cleanupStale(): Promise<number> {
    let cleaned = 0;

    try {
      let cursor = '0';

      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          `${this.keyPrefix}*`,
          'COUNT',
          100,
        );
        cursor = nextCursor;

        for (const k of keys) {
          const raw = await this.redis.get(k).catch(() => null);
          if (!raw) continue;

          let shouldDelete = false;

          try {
            const parsed: unknown = JSON.parse(raw);
            const result = PendingActionSchema.safeParse(parsed);
            if (!result.success || new Date(result.data.expiresAt) <= new Date()) {
              shouldDelete = true;
            }
          } catch {
            // Corrupt data — remove it
            shouldDelete = true;
          }

          if (shouldDelete) {
            await this.redis.del(k).catch(() => {});
            cleaned++;
          }
        }
      } while (cursor !== '0');

      if (cleaned > 0) {
        logger.info({ cleaned }, 'SessionRecovery: stale action cleanup complete');
      } else {
        logger.debug('SessionRecovery: cleanup complete — no stale actions found');
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ error }, 'SessionRecovery: cleanupStale failed');
    }

    return cleaned;
  }

  /**
   * Gracefully close the Redis connection.
   * Call during application shutdown.
   */
  async disconnect(): Promise<void> {
    try {
      await this.redis.quit();
      logger.debug('SessionRecovery: Redis disconnected');
    } catch {
      // Ignore — process may be shutting down
    }
  }

  /**
   * Health check — returns true if Redis is reachable.
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}
