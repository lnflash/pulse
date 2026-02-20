/**
 * admin.ts — Internal admin API routes.
 *
 * Protected by API key auth. Used for operational tooling:
 * - Context inspection/deletion
 * - Tool registry status
 * - Feature flag inspection
 */

import type { Router, Request, Response, NextFunction } from 'express';
import { Router as createRouter } from 'express';
import type { ToolRegistry } from '../../core/agent/ToolRegistry.js';
import { flags } from '../../config/feature-flags.js';
import { logger } from '../../config/logger.js';

/**
 * Register admin routes on the given router.
 * All routes are protected by the adminToken middleware.
 */
export function registerAdminRoutes(
  router: Router,
  toolRegistry: ToolRegistry,
  adminToken: string,
): void {
  // Admin auth middleware
  const requireAdminToken = (req: Request, res: Response, next: NextFunction): void => {
    const token =
      req.headers['x-admin-token'] ??
      req.headers['authorization']?.replace('Bearer ', '');

    if (token !== adminToken) {
      logger.warn({ ip: req.ip, path: req.path }, 'Admin auth failed');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };

  // Apply auth to all admin routes
  router.use(requireAdminToken);

  /**
   * GET /admin/tools — list all registered tools.
   */
  router.get('/admin/tools', (_req: Request, res: Response) => {
    res.json({
      tools: toolRegistry.getSummary(),
      count: toolRegistry.size,
    });
  });

  /**
   * GET /admin/flags — show current feature flag state.
   */
  router.get('/admin/flags', (_req: Request, res: Response) => {
    res.json({ flags });
  });

  /**
   * GET /admin/status — general system status.
   */
  router.get('/admin/status', (_req: Request, res: Response) => {
    res.json({
      uptime: process.uptime(),
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      nodeVersion: process.version,
      env: process.env['NODE_ENV'],
      toolCount: toolRegistry.size,
    });
  });
}

/** Create a standalone admin router. */
export function createAdminRouter(
  toolRegistry: ToolRegistry,
  adminToken: string,
): Router {
  const router = createRouter();
  registerAdminRoutes(router, toolRegistry, adminToken);
  return router;
}
