/**
 * auth.ts — API authentication middleware.
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../config/logger.js';

/**
 * Create an API key authentication middleware.
 * Checks for the key in:
 *   - X-API-Key header
 *   - Authorization: Bearer <key> header
 */
export function createApiKeyMiddleware(validApiKey: string) {
  return function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
    const apiKey =
      req.headers['x-api-key'] ??
      req.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey || apiKey !== validApiKey) {
      logger.warn({ ip: req.ip, path: req.path }, 'API auth failed');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    next();
  };
}

/**
 * Request ID middleware — injects a unique request ID into each request.
 */
export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  (req as any).requestId = req.headers['x-request-id'] as string ?? crypto.randomUUID();
  next();
}
