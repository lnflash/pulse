/**
 * rateLimit.ts — HTTP API rate limiting middleware.
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../config/logger.js';

interface RateLimitStore {
  [key: string]: { count: number; resetAt: number };
}

/**
 * Simple in-memory rate limiter for HTTP endpoints.
 * For multi-instance deployments, use a Redis-backed limiter.
 */
export function createRateLimitMiddleware(options: {
  maxRequests: number;
  windowMs: number;
  message?: string;
}) {
  const store: RateLimitStore = {};
  const { maxRequests, windowMs, message = 'Too many requests. Please slow down.' } = options;

  return function httpRateLimit(req: Request, res: Response, next: NextFunction): void {
    const key = req.ip ?? 'unknown';
    const now = Date.now();

    if (!store[key] || store[key]!.resetAt < now) {
      store[key] = { count: 1, resetAt: now + windowMs };
    } else {
      store[key]!.count++;
    }

    const { count, resetAt } = store[key]!;

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000));

    if (count > maxRequests) {
      logger.warn({ ip: key, count }, 'HTTP rate limit exceeded');
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}
