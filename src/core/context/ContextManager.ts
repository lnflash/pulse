/**
 * ContextManager — loads, caches, and persists UserContext via ContextStorePort.
 *
 * Implements a two-tier write-through cache pattern:
 *
 *   Read path:  memory LRU → hotCache (Redis) → coldStore (filesystem) → create default
 *   Write path: memory LRU + hotCache (Redis) + coldStore (filesystem)
 *
 * The hotCache (Redis) is the primary operational store with TTL.
 * The coldStore (filesystem) is the durable backing store with no TTL.
 *
 * If only one store is provided it acts as both hot and cold
 * (useful in development without Redis).
 */

import { createHash } from 'crypto';
import {
  createDefaultContext,
  patchContext,
  type UserContext,
} from './UserContext.js';
import type { ContextStorePort } from '../../ports/ContextStorePort.js';
import { logger } from '../../config/logger.js';

/** Options for ContextManager. */
export interface ContextManagerOptions {
  /** Default TTL for stored contexts in seconds. Default: 86400 (24 hours). */
  defaultTtlSeconds?: number;
  /** Whether to use in-memory LRU cache. Default: true. */
  enableCache?: boolean;
  /** Max entries in the in-memory cache. Default: 1000. */
  cacheMaxSize?: number;
}

/**
 * ContextManager — primary service for loading and saving user contexts.
 *
 * Usage:
 * ```typescript
 * const mgr = new ContextManager(redisAdapter, persistentAdapter);
 * const ctx = await mgr.load(phoneNumber);
 * const updated = patchContext(ctx, { session: { ... } });
 * await mgr.save(phoneNumber, updated);
 * ```
 */
export class ContextManager {
  private readonly hotCache: ContextStorePort;
  private readonly coldStore: ContextStorePort;
  private readonly options: Required<ContextManagerOptions>;
  /** Simple in-memory cache: phoneHash → { context, cachedAt } */
  private readonly memCache: Map<string, { context: UserContext; cachedAt: number }>;

  /**
   * @param hotCache  Primary (fast) context store — typically Redis.
   * @param coldStore Durable backing store — typically filesystem. Falls back to
   *                  hotCache if omitted (single-store mode).
   * @param options   Tuning options.
   */
  constructor(
    hotCache: ContextStorePort,
    coldStore?: ContextStorePort,
    options: ContextManagerOptions = {},
  ) {
    this.hotCache = hotCache;
    this.coldStore = coldStore ?? hotCache;
    this.options = {
      defaultTtlSeconds: options.defaultTtlSeconds ?? 86_400,
      enableCache: options.enableCache ?? true,
      cacheMaxSize: options.cacheMaxSize ?? 1_000,
    };
    this.memCache = new Map();
  }

  // ---------------------------------------------------------------------------
  // Static helpers
  // ---------------------------------------------------------------------------

  /**
   * Hash a phone number for use as a storage key.
   * @param phoneNumber E.164 format phone number.
   * @returns SHA-256 hex digest.
   */
  static hashPhone(phoneNumber: string): string {
    return createHash('sha256').update(phoneNumber.trim()).digest('hex');
  }

  // ---------------------------------------------------------------------------
  // Core methods — phoneHash-based (low-level)
  // ---------------------------------------------------------------------------

  /**
   * Load the context for a phoneHash, creating a default context if new.
   *
   * Read order: memory LRU → hotCache → coldStore → create default
   *
   * @param phoneHash SHA-256 hash of the E.164 phone number.
   * @returns Hydrated UserContext (may have defaults if new user).
   */
  async loadContext(phoneHash: string): Promise<UserContext> {
    // 1. Memory LRU cache
    if (this.options.enableCache) {
      const cached = this.memCache.get(phoneHash);
      if (cached && Date.now() - cached.cachedAt < 1_800_000) { // 30 minutes
        logger.debug({ phoneHash }, 'ContextManager: context loaded from memory cache');
        return cached.context;
      }
      this.memCache.delete(phoneHash);
    }

    // 2. Hot cache (Redis)
    const hotResult = await this.hotCache.loadContext(phoneHash);
    if (hotResult.found && hotResult.context) {
      logger.debug(
        { phoneHash, ageSeconds: hotResult.ageSeconds },
        'ContextManager: context loaded from hot cache',
      );
      this.setMemCache(phoneHash, hotResult.context);
      // Refresh TTL so active users don't expire
      await this.hotCache
        .touchContext(phoneHash, this.options.defaultTtlSeconds)
        .catch(() => {});
      return hotResult.context;
    }

    // 3. Cold store (filesystem)
    const coldResult = await this.coldStore.loadContext(phoneHash);
    if (coldResult.found && coldResult.context) {
      logger.info(
        { phoneHash },
        'ContextManager: context loaded from cold store — warming hot cache',
      );
      // Warm up hot cache
      await this.hotCache
        .saveContext(phoneHash, coldResult.context, {
          ttlSeconds: this.options.defaultTtlSeconds,
        })
        .catch(() => {});
      this.setMemCache(phoneHash, coldResult.context);
      return coldResult.context;
    }

    // 4. New user — create default context
    logger.info({ phoneHash }, 'ContextManager: new user — creating default context');
    const context = createDefaultContext(phoneHash);
    await this.saveContext(context);
    return context;
  }

  /**
   * Persist a context.
   *
   * Write-through: writes to both hotCache AND coldStore concurrently.
   *
   * @param context The UserContext to persist. phoneHash is taken from
   *                `context.identity.phoneHash`.
   */
  async saveContext(context: UserContext): Promise<void> {
    const phoneHash = context.identity.phoneHash;

    // Always update the in-memory cache first — this ensures the context is
    // available for the next turn even if durable writes fail.
    this.setMemCache(phoneHash, context);

    // Write to both stores concurrently; cold store is authoritative
    const opts = { ttlSeconds: this.options.defaultTtlSeconds };
    const [hotResult, coldResult] = await Promise.allSettled([
      this.hotCache.saveContext(phoneHash, context, opts),
      this.coldStore.saveContext(phoneHash, context, opts),
    ]);

    const hotErr = hotResult.status === 'rejected' ? hotResult.reason : null;
    const coldErr = coldResult.status === 'rejected' ? coldResult.reason : null;

    if (hotErr) {
      logger.warn(
        { phoneHash, error: String(hotErr) },
        'ContextManager: hot cache write failed (memory cache still valid)',
      );
    }

    if (coldErr) {
      logger.error(
        { phoneHash, error: String(coldErr) },
        'ContextManager: cold store write failed (memory cache still valid)',
      );
      // Surface the error so callers know persistence failed,
      // but session remains available via in-memory cache.
      throw coldErr as Error;
    }

    logger.debug({ phoneHash }, 'ContextManager: context saved (write-through)');
  }

  // ---------------------------------------------------------------------------
  // Convenience methods — phoneNumber-based (public API)
  // ---------------------------------------------------------------------------

  /**
   * Load the context for a phone number, creating a default context if new.
   * @param phoneNumber E.164 format phone number.
   * @returns Hydrated UserContext (may have defaults if new user).
   */
  async load(phoneNumber: string): Promise<UserContext> {
    const phoneHash = ContextManager.hashPhone(phoneNumber);
    const context = await this.loadContext(phoneHash);

    // Back-fill phoneNumber if missing (first-time load with phone context)
    if (!context.identity.phoneNumber && phoneNumber) {
      const updated: UserContext = {
        ...context,
        identity: { ...context.identity, phoneNumber },
      };
      // Save the updated context with the phone number filled in
      await this.saveContext(updated).catch(() => {});
      return updated;
    }

    return context;
  }

  /**
   * Save a context for a phone number.
   * @param phoneNumber E.164 format phone number.
   * @param context UserContext to persist.
   */
  async save(phoneNumber: string, context: UserContext): Promise<void> {
    // Ensure the phoneHash is consistent with the phoneNumber we were given
    const phoneHash = ContextManager.hashPhone(phoneNumber);
    const normalized: UserContext = {
      ...context,
      identity: { ...context.identity, phoneHash },
    };
    await this.saveContext(normalized);
  }

  /**
   * Patch a context for a phone number (load → merge → save).
   * @param phoneNumber E.164 format phone number.
   * @param patch Partial context to merge.
   * @returns Updated UserContext.
   */
  async patch(phoneNumber: string, patch: Partial<UserContext>): Promise<UserContext> {
    const current = await this.load(phoneNumber);
    const updated = patchContext(current, patch);
    await this.save(phoneNumber, updated);
    return updated;
  }

  /**
   * Delete the context for a phone number (e.g. user opt-out / GDPR erasure).
   * Deletes from both hot cache and cold store.
   */
  async delete(phoneNumber: string): Promise<void> {
    const phoneHash = ContextManager.hashPhone(phoneNumber);
    await Promise.allSettled([
      this.hotCache.deleteContext(phoneHash),
      this.coldStore.deleteContext(phoneHash),
    ]);
    this.memCache.delete(phoneHash);
    logger.info({ phoneHash }, 'ContextManager: context deleted from all stores');
  }

  /** Invalidate the in-memory cache entry for a phone number. */
  invalidateCache(phoneNumber: string): void {
    const phoneHash = ContextManager.hashPhone(phoneNumber);
    this.memCache.delete(phoneHash);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private setMemCache(phoneHash: string, context: UserContext): void {
    if (!this.options.enableCache) return;
    // Evict oldest entry if at capacity (simple FIFO eviction)
    if (this.memCache.size >= this.options.cacheMaxSize) {
      const firstKey = this.memCache.keys().next().value;
      if (firstKey !== undefined) this.memCache.delete(firstKey);
    }
    this.memCache.set(phoneHash, { context, cachedAt: Date.now() });
  }
}
