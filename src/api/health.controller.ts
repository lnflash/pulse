/**
 * health.controller.ts — HTTP health-check controller.
 *
 * Routes:
 *   GET /health        — liveness probe: { status, version, uptime }
 *   GET /health/ready  — readiness probe: pings all adapters
 *
 * Usage (attach to an Express app):
 * ```typescript
 * const health = createHealthController({ pings: { redis: () => redis.ping() } });
 * app.use('/', health.router());
 * ```
 */

import { Router as createRouter } from 'express';
import type { Router, Request, Response } from 'express';
import { logger } from '../config/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Map of service names to async boolean ping functions. */
export type PingMap = Record<string, () => Promise<boolean>>;

/** Options for HealthController. */
export interface HealthControllerOptions {
  /**
   * Application version string.
   * @default '5.0.0'
   */
  version?: string;

  /**
   * Async ping functions keyed by service name.
   * Each function should resolve `true` if healthy, `false` (or reject) if not.
   * Used by the `/health/ready` readiness probe.
   */
  pings?: PingMap;
}

/** Response shape for GET /health. */
export interface HealthResponse {
  status: 'ok';
  version: string;
  uptime: number;
}

/** Response shape for GET /health/ready. */
export interface ReadinessResponse {
  status: 'ok' | 'degraded';
  version: string;
  uptime: number;
  checks: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/**
 * HealthController — liveness and readiness probes.
 *
 * Liveness (`/health`):
 *   Returns 200 as long as the Node process is running. Kubernetes/Docker
 *   uses this to decide whether to restart the container.
 *
 * Readiness (`/health/ready`):
 *   Runs all configured ping functions and returns 200 only if every
 *   adapter reports healthy. Returns 503 on any failure.
 */
export class HealthController {
  private readonly version: string;
  private readonly pings: PingMap;

  constructor(options: HealthControllerOptions = {}) {
    this.version = options.version ?? '5.0.0';
    this.pings = options.pings ?? {};
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * GET /health
   * Liveness probe — always returns 200 while the process is running.
   */
  getHealth(_req: Request, res: Response): void {
    const body: HealthResponse = {
      status: 'ok',
      version: this.version,
      uptime: process.uptime(),
    };

    res.status(200).json(body);
  }

  /**
   * GET /health/ready
   * Readiness probe — 200 if all adapters healthy, 503 otherwise.
   */
  async getReadiness(_req: Request, res: Response): Promise<void> {
    const checks: Record<string, boolean> = {};
    let allHealthy = true;

    for (const [name, ping] of Object.entries(this.pings)) {
      try {
        checks[name] = await ping();
        if (!checks[name]) {
          allHealthy = false;
          logger.warn({ service: name }, 'HealthController: service unhealthy');
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error({ service: name, error }, 'HealthController: ping threw');
        checks[name] = false;
        allHealthy = false;
      }
    }

    const statusCode = allHealthy ? 200 : 503;
    const body: ReadinessResponse = {
      status: allHealthy ? 'ok' : 'degraded',
      version: this.version,
      uptime: process.uptime(),
      checks,
    };

    logger.debug({ allHealthy, checks }, 'HealthController: readiness check complete');
    res.status(statusCode).json(body);
  }

  // ---------------------------------------------------------------------------
  // Router
  // ---------------------------------------------------------------------------

  /**
   * Return an Express Router with health routes mounted.
   * Mount with: `app.use('/', healthController.router())`
   */
  router(): Router {
    const r = createRouter();

    r.get('/health', (req: Request, res: Response) => {
      this.getHealth(req, res);
    });

    r.get('/health/ready', (req: Request, res: Response) => {
      this.getReadiness(req, res).catch((err: unknown) => {
        const error = err instanceof Error ? err.message : String(err);
        logger.error({ error }, 'HealthController: getReadiness threw unexpectedly');
        if (!res.headersSent) {
          res.status(500).json({ status: 'error', error: 'Internal server error' });
        }
      });
    });

    return r;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a HealthController and return it ready to use.
 *
 * @example
 * app.use('/', createHealthController({
 *   pings: {
 *     redis: () => hotCache.ping(),
 *     ai:    () => aiProvider.ping(),
 *   },
 * }).router());
 */
export function createHealthController(
  options?: HealthControllerOptions,
): HealthController {
  return new HealthController(options);
}
