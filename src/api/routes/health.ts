/**
 * health.ts — Health check HTTP route.
 *
 * GET /health      — liveness probe
 * GET /health/ready — readiness probe (checks adapters)
 */

import type { Router, Request, Response } from 'express';
import { Router as createRouter } from 'express';
import { logger } from '../../config/logger.js';

/** Register health routes on the given Express router. */
export function registerHealthRoutes(
  router: Router,
  options: {
    pings?: Record<string, () => Promise<boolean>>;
    version?: string;
  } = {},
): void {
  const { pings = {}, version = process.env['npm_package_version'] ?? '5.0.0' } = options;

  /**
   * GET /health — liveness probe.
   * Returns 200 if the process is running.
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /health/ready — readiness probe.
   * Returns 200 if all adapters are healthy, 503 if any are down.
   */
  router.get('/health/ready', async (_req: Request, res: Response) => {
    const checks: Record<string, boolean> = {};
    let allHealthy = true;

    for (const [name, ping] of Object.entries(pings)) {
      try {
        checks[name] = await ping();
        if (!checks[name]) allHealthy = false;
      } catch {
        checks[name] = false;
        allHealthy = false;
      }
    }

    const statusCode = allHealthy ? 200 : 503;
    logger.debug({ checks, allHealthy }, 'Health readiness check');

    res.status(statusCode).json({
      status: allHealthy ? 'ready' : 'degraded',
      version,
      checks,
      timestamp: new Date().toISOString(),
    });
  });
}

/** Create a standalone health router. */
export function createHealthRouter(options?: Parameters<typeof registerHealthRoutes>[1]): Router {
  const router = createRouter();
  registerHealthRoutes(router, options);
  return router;
}
