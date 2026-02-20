/**
 * webhooks.ts — WhatsApp Cloud API webhook handler.
 *
 * GET  /webhooks/whatsapp — webhook verification (hub.challenge)
 * POST /webhooks/whatsapp — incoming messages and status updates
 */

import type { Router, Request, Response } from 'express';
import { Router as createRouter } from 'express';
import type { WhatsAppCloudAdapter } from '../../adapters/messaging/WhatsAppCloudAdapter.js';
import { logger } from '../../config/logger.js';

/**
 * Register WhatsApp webhook routes on the given router.
 * @param router Express router to attach routes to.
 * @param adapter WhatsApp Cloud adapter instance.
 * @param verifyToken Webhook verify token (must match Meta App settings).
 */
export function registerWebhookRoutes(
  router: Router,
  adapter: WhatsAppCloudAdapter,
  verifyToken: string,
): void {
  /**
   * GET /webhooks/whatsapp
   * WhatsApp webhook verification (called by Meta when setting up the webhook).
   */
  router.get('/webhooks/whatsapp', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === verifyToken) {
      logger.info('WhatsApp webhook verified successfully');
      res.status(200).send(challenge);
    } else {
      logger.warn({ mode }, 'WhatsApp webhook verification failed');
      res.status(403).json({ error: 'Verification failed' });
    }
  });

  /**
   * POST /webhooks/whatsapp
   * Incoming messages and delivery status updates from WhatsApp.
   */
  router.post('/webhooks/whatsapp', (req: Request, res: Response) => {
    // Acknowledge immediately — WhatsApp requires < 20s response
    res.status(200).json({ status: 'ok' });

    // Process the payload asynchronously
    adapter.handleWebhookPayload(req.body).catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ error }, 'Error processing WhatsApp webhook payload');
    });
  });
}

/** Create a standalone webhook router. */
export function createWebhookRouter(
  adapter: WhatsAppCloudAdapter,
  verifyToken: string,
): Router {
  const router = createRouter();
  registerWebhookRoutes(router, adapter, verifyToken);
  return router;
}
