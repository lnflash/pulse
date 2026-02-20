/**
 * index.ts — Pulse v5 application entry point.
 *
 * Wires together all ports, adapters, and orchestrators using manual dependency injection.
 * No framework magic — just plain TypeScript constructors.
 *
 * Startup sequence:
 *   1. Load config
 *   2. Create adapters
 *   3. Register tools
 *   4. Create orchestrators
 *   5. Start HTTP server
 *   6. Initialize messaging adapter
 *   7. Register shutdown handlers
 */

import express from 'express';
import { config } from './config/app.config.js';
import { logger } from './config/logger.js';
import { ToolRegistry } from './core/agent/ToolRegistry.js';
import { ContextManager } from './core/context/ContextManager.js';
import { ConfirmationGate } from './core/security/ConfirmationGate.js';
import { RateLimiter } from './core/security/RateLimiter.js';
import { InputSanitizer } from './core/security/InputSanitizer.js';
import { AuditLog } from './core/security/AuditLog.js';
import { ClaudeAdapter } from './adapters/ai/ClaudeAdapter.js';
import { WhatsAppCloudAdapter } from './adapters/messaging/WhatsAppCloudAdapter.js';
import { PersistentContextAdapter } from './adapters/context/PersistentContextAdapter.js';
import { RedisContextAdapter } from './adapters/context/RedisContextAdapter.js';
import { FileSystemAdapter } from './adapters/storage/FileSystemAdapter.js';
import { MessageOrchestrator } from './orchestrator/MessageOrchestrator.js';
import { AgentOrchestrator } from './orchestrator/AgentOrchestrator.js';
import { PromptLoader } from './config/PromptLoader.js';
import { createHealthRouter } from './api/routes/health.js';
import { createWebhookRouter } from './api/routes/webhooks.js';
import { createAdminRouter } from './api/routes/admin.js';
import { requestIdMiddleware } from './api/middleware/auth.js';
import { createRateLimitMiddleware } from './api/middleware/rateLimit.js';

async function bootstrap(): Promise<void> {
  logger.info({ version: '5.0.0', env: config.NODE_ENV }, 'Pulse v5 starting up');

  // ---------------------------------------------------------------------------
  // 1. Context Store Adapters (write-through cache pattern)
  // ---------------------------------------------------------------------------
  // Cold store: durable encrypted filesystem store (always available)
  const coldStore = new PersistentContextAdapter({
    basePath: config.CONTEXT_DATA_DIR,
    encryptionKey: config.CONTEXT_ENCRYPTION_KEY,
  });

  // Hot cache: Redis with TTL (used as primary read/write path in production)
  const hotCache = new RedisContextAdapter({
    url: config.REDIS_URL,
    ttlSeconds: config.CONTEXT_TTL_SECONDS,
    keyPrefix: `${config.REDIS_KEY_PREFIX}context:`,
  });

  // ContextManager: read from hotCache first, fall back to coldStore; write-through both
  const contextManager = new ContextManager(hotCache, coldStore);

  // ---------------------------------------------------------------------------
  // 2. AI Provider Adapter
  // ---------------------------------------------------------------------------
  if (!config.ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY not set — AI features will not work');
  }

  const aiProvider = new ClaudeAdapter({
    apiKey: config.ANTHROPIC_API_KEY ?? 'not-configured',
    model: config.CLAUDE_MODEL,
  });

  // ---------------------------------------------------------------------------
  // 3. Tool Registry — register all tools
  // ---------------------------------------------------------------------------
  const toolRegistry = new ToolRegistry();

  // Auto-discover tools from src/core/tools/
  const discovery = await toolRegistry.autoDiscover();
  logger.info(
    { registered: discovery.toolsRegistered, failures: discovery.failures.length },
    'Tools loaded',
  );

  // ---------------------------------------------------------------------------
  // 4. Security components
  // ---------------------------------------------------------------------------
  const rateLimiter = new RateLimiter();
  const sanitizer = new InputSanitizer();
  const auditLog = new AuditLog();
  const _confirmationGate = new ConfirmationGate();

  // ---------------------------------------------------------------------------
  // 5. Prompt loader
  // ---------------------------------------------------------------------------
  const promptLoader = new PromptLoader();

  // ---------------------------------------------------------------------------
  // 6. Orchestrators
  // ---------------------------------------------------------------------------
  const agentOrchestrator = new AgentOrchestrator(aiProvider, toolRegistry, promptLoader);

  // ---------------------------------------------------------------------------
  // 7. Messaging Adapter (WhatsApp)
  // ---------------------------------------------------------------------------
  const messagingAdapter = new WhatsAppCloudAdapter({
    phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID ?? '',
    accessToken: config.WHATSAPP_ACCESS_TOKEN ?? '',
    webhookVerifyToken: config.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? '',
    apiVersion: config.WHATSAPP_API_VERSION,
  });

  const messageOrchestrator = new MessageOrchestrator(
    messagingAdapter,
    contextManager,
    rateLimiter,
    sanitizer,
    auditLog,
    agentOrchestrator,
  );

  // ---------------------------------------------------------------------------
  // 8. HTTP Server
  // ---------------------------------------------------------------------------
  const app = express();

  app.use(express.json({ limit: '10mb' }));
  app.use(requestIdMiddleware);
  app.use(
    createRateLimitMiddleware({ maxRequests: 100, windowMs: 60_000 }),
  );

  // Storage adapter (for file operations)
  const _storageAdapter = new FileSystemAdapter(config.STORAGE_ROOT_DIR);

  // Routes
  app.use('/', createHealthRouter({
    pings: {
      contextStore: () => coldStore.ping(),
      redis: () => hotCache.ping(),
      ai: () => aiProvider.ping(),
    },
  }));

  app.use('/', createWebhookRouter(
    messagingAdapter,
    config.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? 'dev-verify-token',
  ));

  if (config.ADMIN_TOKEN) {
    app.use('/', createAdminRouter(toolRegistry, config.ADMIN_TOKEN));
  }

  // Start server
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, `Pulse v5 HTTP server listening`);
  });

  // ---------------------------------------------------------------------------
  // 9. Initialize messaging (after HTTP server is ready for webhooks)
  // ---------------------------------------------------------------------------
  if (config.WHATSAPP_PHONE_NUMBER_ID && config.WHATSAPP_ACCESS_TOKEN) {
    await messagingAdapter.initialize();
    messageOrchestrator.register();
    logger.info('WhatsApp messaging adapter initialized');
  } else {
    logger.warn('WhatsApp credentials not configured — messaging disabled');
  }

  // ---------------------------------------------------------------------------
  // 10. Graceful shutdown
  // ---------------------------------------------------------------------------
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received');
    server.close(async () => {
      await messagingAdapter.shutdown().catch(() => {});
      logger.info('Pulse v5 shut down cleanly');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.info('Pulse v5 startup complete ✓');
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Pulse v5 startup failed');
  process.exit(1);
});
