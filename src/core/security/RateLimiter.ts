/**
 * RateLimiter — token-bucket rate limiter for per-user message throttling.
 */

import { logger } from '../../config/logger.js';

/** Configuration for a rate limit tier. */
export interface RateLimitTierConfig {
  /** Maximum messages per window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Message to return when rate limited */
  message: string;
}

/** Predefined rate limit tiers. */
export const RATE_LIMIT_TIERS: Record<string, RateLimitTierConfig> = {
  standard: {
    maxRequests: 30,
    windowMs: 60_000, // 30 messages per minute
    message: "You're sending messages too quickly. Please wait a moment before trying again.",
  },
  trusted: {
    maxRequests: 120,
    windowMs: 60_000, // 120 messages per minute for trusted users
    message: "Rate limit reached. Please slow down.",
  },
  restricted: {
    maxRequests: 5,
    windowMs: 60_000, // 5 messages per minute for restricted users
    message: "Your account has limited access. Please contact support.",
  },
};

/** Sliding window entry for a single user. */
interface WindowEntry {
  timestamps: number[];
  lastWarningAt?: number;
}

/** Result of a rate limit check. */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  message?: string;
}

/**
 * RateLimiter — sliding window rate limiter using in-memory storage.
 *
 * For production, back this with Redis to share state across instances.
 */
export class RateLimiter {
  private readonly windows: Map<string, WindowEntry> = new Map();

  /**
   * Check whether a request from a given key is allowed.
   * @param key Unique identifier (e.g. phoneHash).
   * @param tier Rate limit tier name.
   */
  check(key: string, tier: string = 'standard'): RateLimitResult {
    const config = RATE_LIMIT_TIERS[tier] ?? RATE_LIMIT_TIERS['standard']!;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    let entry = this.windows.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.windows.set(key, entry);
    }

    // Remove expired timestamps
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    const resetAt = new Date(
      entry.timestamps.length > 0
        ? entry.timestamps[0]! + config.windowMs
        : now + config.windowMs,
    );

    if (entry.timestamps.length >= config.maxRequests) {
      logger.warn({ key, tier, count: entry.timestamps.length }, 'Rate limit exceeded');
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        message: config.message,
      };
    }

    entry.timestamps.push(now);
    return {
      allowed: true,
      remaining: config.maxRequests - entry.timestamps.length,
      resetAt,
    };
  }

  /**
   * Reset the rate limit window for a key (e.g. on ban expiry).
   */
  reset(key: string): void {
    this.windows.delete(key);
  }

  /**
   * Get current usage stats for a key.
   */
  getUsage(key: string, tier: string = 'standard'): { count: number; remaining: number } {
    const config = RATE_LIMIT_TIERS[tier] ?? RATE_LIMIT_TIERS['standard']!;
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const entry = this.windows.get(key);
    if (!entry) return { count: 0, remaining: config.maxRequests };
    const count = entry.timestamps.filter((ts) => ts > windowStart).length;
    return { count, remaining: Math.max(0, config.maxRequests - count) };
  }
}
