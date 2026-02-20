/**
 * index.ts — Pulse v5 application entry point.
 *
 * Wires together all ports, adapters, and orchestrators using manual dependency injection.
 * No framework magic — just plain TypeScript constructors.
 *
 * Startup sequence:
 *   1.  Load config
 *   2.  Create context store adapters (Redis hot cache + filesystem cold store)
 *   3.  Create AI provider (Claude)
 *   4.  Create voice adapters (ElevenLabs TTS + Whisper STT) — if enabled
 *   5.  Register tools (auto-discover)
 *   6.  Create security components
 *   7.  Create interaction log store
 *   8.  Create prompt loader + warm cache
 *   9.  Create orchestrators
 *   10. Create messaging adapter (WhatsApp)
 *   11. Start HTTP server
 *   12. Initialize messaging adapter + register message handler
 *   13. Register graceful shutdown handlers
 */

import express from 'express';
import { config } from './config/app.config.js';
import { logger } from './config/logger.js';
import { ToolRegistry } from './core/agent/ToolRegistry.js';
import { ContextManager } from './core/context/ContextManager.js';
import { InteractionLogStore } from './core/context/InteractionLogStore.js';
import { ConfirmationGate } from './core/security/ConfirmationGate.js';
import { RateLimiter } from './core/security/RateLimiter.js';
import { InputSanitizer } from './core/security/InputSanitizer.js';
import { AuditLog } from './core/security/AuditLog.js';
import { ClaudeAdapter } from './adapters/ai/ClaudeAdapter.js';
import { WhatsAppCloudAdapter } from './adapters/messaging/WhatsAppCloudAdapter.js';
import { ElevenLabsAdapter } from './adapters/voice/ElevenLabsAdapter.js';
import { WhisperAdapter } from './adapters/voice/WhisperAdapter.js';
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
  // 2. AI Provider Adapter (Claude)
  // ---------------------------------------------------------------------------
  if (!config.ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY not set — AI features will not work');
  }

  const aiProvider = new ClaudeAdapter({
    apiKey: config.ANTHROPIC_API_KEY ?? 'not-configured',
    model: config.CLAUDE_MODEL,
  });

  // ---------------------------------------------------------------------------
  // 3. Voice Adapters (ElevenLabs TTS + OpenAI Whisper STT) — optional
  // ---------------------------------------------------------------------------
  let ttsProvider: ElevenLabsAdapter | undefined;
  let sttProvider: WhisperAdapter | undefined;

  if (config.ENABLE_VOICE) {
    if (config.ELEVENLABS_API_KEY) {
      ttsProvider = new ElevenLabsAdapter({
        apiKey: config.ELEVENLABS_API_KEY,
        defaultVoiceId: config.ELEVENLABS_DEFAULT_VOICE_ID,
      });
      logger.info('ElevenLabs TTS adapter initialized');
    } else {
      logger.warn('ENABLE_VOICE=true but ELEVENLABS_API_KEY not set — TTS disabled');
    }

    if (config.OPENAI_API_KEY) {
      sttProvider = new WhisperAdapter({ apiKey: config.OPENAI_API_KEY });
      logger.info('Whisper STT adapter initialized');
    } else {
      logger.warn('ENABLE_VOICE=true but OPENAI_API_KEY not set — STT disabled');
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Tool Registry — register all tools via auto-discovery
  // ---------------------------------------------------------------------------
  const toolRegistry = new ToolRegistry();
  const discovery = await toolRegistry.autoDiscover();
  logger.info(
    { registered: discovery.toolsRegistered, failures: discovery.failures.length },
    'Tools loaded',
  );

  if (discovery.failures.length > 0) {
    for (const failure of discovery.failures) {
      logger.warn({ path: failure.path, error: failure.error }, 'Tool load failure');
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Security components
  // ---------------------------------------------------------------------------
  const rateLimiter = new RateLimiter();
  const sanitizer = new InputSanitizer();
  const auditLog = new AuditLog();
  const _confirmationGate = new ConfirmationGate();

  // ---------------------------------------------------------------------------
  // 6. Interaction Log Store
  // ---------------------------------------------------------------------------
  const logStore = new InteractionLogStore(config.STORAGE_ROOT_DIR);
  await logStore.init();

  // ---------------------------------------------------------------------------
  // 7. Prompt Loader — pre-warm cache at startup to avoid cold-start latency
  // ---------------------------------------------------------------------------
  const promptLoader = new PromptLoader();
  await promptLoader.warmCache().catch((err) => {
    logger.warn({ err: String(err) }, 'Prompt cache warm-up failed — will lazy-load');
  });

  // ---------------------------------------------------------------------------
  // 8. Storage adapter (for file operations in tools)
  // ---------------------------------------------------------------------------
  const _storageAdapter = new FileSystemAdapter(config.STORAGE_ROOT_DIR);

  // ---------------------------------------------------------------------------
  // 9. Orchestrators
  // ---------------------------------------------------------------------------

  // AgentOrchestrator: manages AgentLoop lifecycle for each message turn
  const agentOrchestrator = new AgentOrchestrator(aiProvider, toolRegistry);

  // ---------------------------------------------------------------------------
  // 10. Messaging Adapter (WhatsApp Cloud API)
  // ---------------------------------------------------------------------------
  const messagingAdapter = new WhatsAppCloudAdapter({
    phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID ?? '',
    accessToken: config.WHATSAPP_ACCESS_TOKEN ?? '',
    webhookVerifyToken: config.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? '',
    apiVersion: config.WHATSAPP_API_VERSION,
  });

  // ---------------------------------------------------------------------------
  // 11. MessageOrchestrator — top-level message handler with full pipeline
  // ---------------------------------------------------------------------------
  const messageOrchestrator = new MessageOrchestrator({
    messaging: messagingAdapter,
    contextManager,
    rateLimiter,
    sanitizer,
    auditLog,
    agentOrchestrator,
    promptLoader,
    logStore,
    sttProvider,
    ttsProvider,
  });

  // ---------------------------------------------------------------------------
  // 12. HTTP Server
  // ---------------------------------------------------------------------------
  const app = express();

  app.use(express.json({ limit: '10mb' }));
  app.use(requestIdMiddleware);
  app.use(
    createRateLimitMiddleware({ maxRequests: 100, windowMs: 60_000 }),
  );

  // Health check routes (includes pings to context store, Redis, AI)
  app.use('/', createHealthRouter({
    pings: {
      contextStore: () => coldStore.ping(),
      redis: () => hotCache.ping(),
      ai: () => aiProvider.ping(),
    },
  }));

  // WhatsApp webhook routes (GET = verification, POST = incoming messages)
  app.use('/', createWebhookRouter(
    messagingAdapter,
    config.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? 'dev-verify-token',
  ));

  // Admin routes (protected by ADMIN_TOKEN)
  if (config.ADMIN_TOKEN) {
    app.use('/', createAdminRouter(toolRegistry, config.ADMIN_TOKEN));
  }

  // Start HTTP server
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'Pulse v5 HTTP server listening');
  });

  // ---------------------------------------------------------------------------
  // 13. Initialize messaging (after HTTP server is ready for webhooks)
  // ---------------------------------------------------------------------------
  if (config.WHATSAPP_PHONE_NUMBER_ID && config.WHATSAPP_ACCESS_TOKEN) {
    await messagingAdapter.initialize();
    // Connect the WhatsApp adapter's onMessage event to MessageOrchestrator
    messageOrchestrator.register();
    logger.info('WhatsApp messaging adapter initialized and handler registered');
  } else {
    logger.warn('WhatsApp credentials not configured — messaging disabled');
  }

  // ---------------------------------------------------------------------------
  // 14. Graceful shutdown
  // ---------------------------------------------------------------------------
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received — draining connections');

    server.close(async () => {
      try {
        await messagingAdapter.shutdown();
      } catch {
        // Best-effort
      }
      logger.info('Pulse v5 shut down cleanly');
      process.exit(0);
    });

    // Force-kill after 10 seconds if shutdown hangs
    setTimeout(() => {
      logger.error('Graceful shutdown timeout — forcing exit');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.info(
    {
      voiceEnabled: config.ENABLE_VOICE,
      ttsReady: !!ttsProvider,
      sttReady: !!sttProvider,
      toolsRegistered: discovery.toolsRegistered,
    },
    'Pulse v5 startup complete ✓',
  );
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Pulse v5 startup failed');
  process.exit(1);
});
