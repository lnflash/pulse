/**
 * webhook.controller.ts — WhatsApp Cloud API webhook controller.
 *
 * Routes:
 *   GET  /webhook/whatsapp  — webhook verification (Meta hub challenge)
 *   POST /webhook/whatsapp  — incoming messages & delivery status updates
 *
 * WhatsApp Cloud API webhook flow:
 *   1. Meta sends a GET with hub.mode, hub.verify_token, hub.challenge.
 *   2. We respond with the challenge if the token matches.
 *   3. Meta sends POSTs with message payloads (< 20 second reply window).
 *   4. We acknowledge immediately with 200, then process asynchronously.
 *
 * Usage:
 * ```typescript
 * const webhook = createWebhookController({
 *   verifyToken: config.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
 *   adapter: whatsAppAdapter,
 *   orchestrator: messageOrchestrator,
 * });
 * app.use('/', webhook.router());
 * ```
 */

import { Router as createRouter } from 'express';
import type { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { WhatsAppCloudAdapter } from '../adapters/messaging/WhatsAppCloudAdapter.js';
import type { MessageOrchestrator } from '../orchestrator/MessageOrchestrator.js';
import { logger } from '../config/logger.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Query parameters sent by Meta during webhook verification.
 * All three fields are required; Meta sends them as plain strings.
 */
const VerificationQuerySchema = z.object({
  'hub.mode': z.string(),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string(),
});

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface WebhookControllerConfig {
  /**
   * Webhook verification token configured in the Meta App dashboard.
   * Must match `hub.verify_token` in the GET verification request.
   */
  verifyToken: string;

  /**
   * The WhatsApp Cloud adapter used to parse incoming message payloads.
   * Its `handleWebhookPayload()` method dispatches messages to the registered
   * message handler (i.e. MessageOrchestrator.handleMessage()).
   */
  adapter: WhatsAppCloudAdapter;

  /**
   * The MessageOrchestrator — registered as the message handler on the adapter.
   * Exposed here so callers can call `orchestrator.register()` during startup
   * if they choose to manage registration outside the module.
   */
  orchestrator: MessageOrchestrator;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/**
 * WebhookController — handles incoming WhatsApp Cloud API webhook requests.
 */
export class WebhookController {
  private readonly verifyToken: string;
  private readonly adapter: WhatsAppCloudAdapter;
  private readonly orchestrator: MessageOrchestrator;

  constructor(config: WebhookControllerConfig) {
    this.verifyToken = config.verifyToken;
    this.adapter = config.adapter;
    this.orchestrator = config.orchestrator;
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * GET /webhook/whatsapp
   *
   * Meta calls this endpoint to verify the webhook URL.
   * Responds with the hub.challenge value if the verify token matches.
   */
  verifyWebhook(req: Request, res: Response): void {
    const parsed = VerificationQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      logger.warn(
        { query: req.query, issues: parsed.error.issues },
        'WebhookController: malformed verification request',
      );
      res.status(400).json({ error: 'Invalid verification request' });
      return;
    }

    const {
      'hub.mode': mode,
      'hub.verify_token': token,
      'hub.challenge': challenge,
    } = parsed.data;

    if (mode === 'subscribe' && token === this.verifyToken) {
      logger.info('WebhookController: WhatsApp webhook verified successfully');
      res.status(200).send(challenge);
    } else {
      logger.warn(
        { mode, tokenMatch: token === this.verifyToken },
        'WebhookController: webhook verification failed — invalid token or mode',
      );
      res.status(403).json({ error: 'Forbidden' });
    }
  }

  /**
   * POST /webhook/whatsapp
   *
   * Incoming messages and delivery status updates from WhatsApp.
   *
   * WhatsApp requires a response within 20 seconds. We acknowledge
   * immediately with 200 OK, then process the payload asynchronously.
   * The adapter parses the payload and dispatches to MessageOrchestrator.
   */
  handleIncomingMessage(req: Request, res: Response): void {
    // Acknowledge immediately — WhatsApp may retry if this takes > 20s
    res.status(200).json({ status: 'ok' });

    // Process asynchronously — errors here are logged but never re-thrown
    this.adapter
      .handleWebhookPayload(req.body as unknown)
      .catch((err: unknown) => {
        const error = err instanceof Error ? err.message : String(err);
        logger.error(
          { error },
          'WebhookController: unhandled error processing WhatsApp payload',
        );
      });
  }

  // ---------------------------------------------------------------------------
  // Router
  // ---------------------------------------------------------------------------

  /**
   * Return an Express Router with webhook routes mounted.
   * Mount with: `app.use('/', webhookController.router())`
   */
  router(): Router {
    const r = createRouter();

    r.get('/webhook/whatsapp', (req: Request, res: Response) => {
      this.verifyWebhook(req, res);
    });

    r.post('/webhook/whatsapp', (req: Request, res: Response) => {
      this.handleIncomingMessage(req, res);
    });

    return r;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a WebhookController and return it ready to use.
 *
 * @example
 * app.use('/', createWebhookController({
 *   verifyToken: config.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? 'dev-token',
 *   adapter: whatsAppAdapter,
 *   orchestrator: messageOrchestrator,
 * }).router());
 */
export function createWebhookController(
  config: WebhookControllerConfig,
): WebhookController {
  return new WebhookController(config);
}
