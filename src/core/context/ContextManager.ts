/**
 * ContextManager — loads, caches, and persists UserContext via ContextStorePort.
 *
 * Sits between the Orchestrator and the ContextStorePort adapter.
 * Handles: in-memory caching, TTL refresh, context creation for new users.
 */

import { createHash } from 'crypto';
import { createDefaultContext, patchContext, type UserContext } from './UserContext.js';
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
 * const mgr = new ContextManager(redisAdapter, { defaultTtlSeconds: 86400 });
 * const ctx = await mgr.load(phoneNumber);
 * const updated = patchContext(ctx, { session: { ... } });
 * await mgr.save(phoneNumber, updated);
 * ```
 */
export class ContextManager {
  private readonly store: ContextStorePort;
  private readonly options: Required<ContextManagerOptions>;
  /** Simple in-memory cache: phoneHash → UserContext */
  private readonly cache: Map<string, { context: UserContext; cachedAt: number }>;

  constructor(store: ContextStorePort, options: ContextManagerOptions = {}) {
    this.store = store;
    this.options = {
      defaultTtlSeconds: options.defaultTtlSeconds ?? 86_400,
      enableCache: options.enableCache ?? true,
      cacheMaxSize: options.cacheMaxSize ?? 1_000,
    };
    this.cache = new Map();
  }

  /**
   * Hash a phone number for use as a storage key.
   * @param phoneNumber E.164 format phone number.
   * @returns SHA-256 hex digest.
   */
  static hashPhone(phoneNumber: string): string {
    return createHash('sha256').update(phoneNumber.trim()).digest('hex');
  }

  /**
   * Load the context for a phone number, creating a default context if new.
   * @param phoneNumber E.164 format phone number.
   * @returns Hydrated UserContext (may have defaults if new user).
   */
  async load(phoneNumber: string): Promise<UserContext> {
    const phoneHash = ContextManager.hashPhone(phoneNumber);

    // Check in-memory cache first
    if (this.options.enableCache) {
      const cached = this.cache.get(phoneHash);
      if (cached) {
        // Cache entries are valid for 60 seconds
        if (Date.now() - cached.cachedAt < 60_000) {
          logger.debug({ phoneHash }, 'Context loaded from memory cache');
          return cached.context;
        }
        this.cache.delete(phoneHash);
      }
    }

    const result = await this.store.loadContext(phoneHash);

    if (result.found && result.context) {
      logger.debug({ phoneHash, ageSeconds: result.ageSeconds }, 'Context loaded from store');
      this.setCache(phoneHash, result.context);
      // Refresh TTL for active users
      await this.store.touchContext(phoneHash, this.options.defaultTtlSeconds).catch(() => {});
      return result.context;
    }

    // New user — create default context
    logger.info({ phoneHash }, 'New user — creating default context');
    const context = createDefaultContext(phoneHash, {
      identity: { phoneHash, phoneNumber },
    });
    await this.save(phoneNumber, context);
    return context;
  }

  /**
   * Save a context for a phone number.
   * @param phoneNumber E.164 format phone number.
   * @param context UserContext to persist.
   */
  async save(phoneNumber: string, context: UserContext): Promise<void> {
    const phoneHash = ContextManager.hashPhone(phoneNumber);
    await this.store.saveContext(phoneHash, context, {
      ttlSeconds: this.options.defaultTtlSeconds,
    });
    this.setCache(phoneHash, context);
    logger.debug({ phoneHash }, 'Context saved');
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
   * Delete the context for a phone number (e.g. user opt-out/GDPR erasure).
   */
  async delete(phoneNumber: string): Promise<void> {
    const phoneHash = ContextManager.hashPhone(phoneNumber);
    await this.store.deleteContext(phoneHash);
    this.cache.delete(phoneHash);
    logger.info({ phoneHash }, 'Context deleted');
  }

  /** Invalidate the in-memory cache entry for a phone number. */
  invalidateCache(phoneNumber: string): void {
    const phoneHash = ContextManager.hashPhone(phoneNumber);
    this.cache.delete(phoneHash);
  }

  private setCache(phoneHash: string, context: UserContext): void {
    if (!this.options.enableCache) return;
    // Evict oldest entry if at capacity
    if (this.cache.size >= this.options.cacheMaxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(phoneHash, { context, cachedAt: Date.now() });
  }
}
