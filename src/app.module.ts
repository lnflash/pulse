/**
 * app.module.ts — Pulse v5 application module factory.
 *
 * Wires together all ports, adapters, services, and orchestrators.
 * Returns a fully-initialised `AppModule` that the entry point can mount
 * routes onto and start serving requests.
 *
 * Architecture:
 *   Ports (interfaces) ← Adapters (implementations) ← Module (factory)
 *
 * Provider strategy (factory functions, not decorators):
 *   MessagingPort   → WhatsAppCloudAdapter
 *   AIProviderPort  → ClaudeAdapter (primary) + GeminiAdapter (fallback)
 *   WalletPort      → FlashAPIAdapter
 *   ContextStorePort→ RedisContextAdapter (hot) + PersistentContextAdapter (cold)
 *   VoicePort       → ElevenLabsAdapter (if ENABLE_VOICE + ELEVENLABS_API_KEY)
 *
 * On module init:
 *   - Auto-discovers and registers all tools
 *   - Initialises the WhatsApp Cloud adapter
 *   - Calls MessageOrchestrator.register() to begin receiving messages
 */

import { config } from './config/app.config.js';
import { logger } from './config/logger.js';

// Adapters
import { ClaudeAdapter } from './adapters/ai/ClaudeAdapter.js';
import { GeminiAdapter } from './adapters/ai/GeminiAdapter.js';
import { WhatsAppCloudAdapter } from './adapters/messaging/WhatsAppCloudAdapter.js';
import { RedisContextAdapter } from './adapters/context/RedisContextAdapter.js';
import { PersistentContextAdapter } from './adapters/context/PersistentContextAdapter.js';
import { ElevenLabsAdapter } from './adapters/voice/ElevenLabsAdapter.js';
import { FlashAPIAdapter } from './adapters/wallet/FlashAPIAdapter.js';
import { FileSystemAdapter } from './adapters/storage/FileSystemAdapter.js';

// Core services
import { ContextManager } from './core/context/ContextManager.js';
import { ToolRegistry } from './core/agent/ToolRegistry.js';
import { RateLimiter } from './core/security/RateLimiter.js';
import { InputSanitizer } from './core/security/InputSanitizer.js';
import { AuditLog } from './core/security/AuditLog.js';
import { ErrorHandler } from './core/agent/ErrorHandler.js';
import { SessionRecovery } from './core/session/SessionRecovery.js';

// Orchestrators
import { MessageOrchestrator } from './orchestrator/MessageOrchestrator.js';
import { AgentOrchestrator } from './orchestrator/AgentOrchestrator.js';
import { PromptLoader } from './config/PromptLoader.js';

// Ports (types only)
import type { AIProviderPort } from './ports/AIProviderPort.js';
import type { MessagingPort } from './ports/MessagingPort.js';
import type { WalletPort } from './ports/WalletPort.js';
import type { ContextStorePort } from './ports/ContextStorePort.js';
import type { VoicePort } from './ports/VoicePort.js';

// ---------------------------------------------------------------------------
// Module shape
// ---------------------------------------------------------------------------

/** All wired-up dependencies, ready to be consumed by routes/controllers. */
export interface AppModule {
  // --- Ports ---
  messaging: MessagingPort;
  ai: AIProviderPort;
  fallbackAI: AIProviderPort | null;
  wallet: WalletPort;
  contextStore: ContextStorePort;
  voice: VoicePort | null;

  // --- Concrete adapters (needed by webhook controller) ---
  whatsAppAdapter: WhatsAppCloudAdapter;
  coldContextStore: PersistentContextAdapter;
  hotContextCache: RedisContextAdapter;

  // --- Core services ---
  contextManager: ContextManager;
  toolRegistry: ToolRegistry;
  sessionRecovery: SessionRecovery;
  errorHandler: ErrorHandler;
  storage: FileSystemAdapter;

  // --- Orchestrators ---
  messageOrchestrator: MessageOrchestrator;
  agentOrchestrator: AgentOrchestrator;
}

// ---------------------------------------------------------------------------
// Provider factories
// ---------------------------------------------------------------------------

/** Create the MessagingPort adapter (WhatsApp Cloud API). */
function createMessagingPort(): WhatsAppCloudAdapter {
  return new WhatsAppCloudAdapter({
    phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID ?? '',
    accessToken: config.WHATSAPP_ACCESS_TOKEN ?? '',
    webhookVerifyToken: config.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? '',
    apiVersion: config.WHATSAPP_API_VERSION,
  });
}

/** Create the primary AIProviderPort (Claude). */
function createPrimaryAIProvider(): AIProviderPort {
  if (!config.ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY not set — Claude AI features will not function');
  }

  return new ClaudeAdapter({
    apiKey: config.ANTHROPIC_API_KEY ?? 'not-configured',
    model: config.CLAUDE_MODEL,
  });
}

/** Create the fallback AIProviderPort (Gemini), or null if not configured. */
function createFallbackAIProvider(): AIProviderPort | null {
  if (!config.GOOGLE_AI_API_KEY) {
    logger.warn('GOOGLE_AI_API_KEY not set — no AI fallback provider available');
    return null;
  }

  return new GeminiAdapter({
    apiKey: config.GOOGLE_AI_API_KEY,
    model: config.GEMINI_MODEL,
  });
}

/** Create the WalletPort adapter (Flash GraphQL API). */
function createWalletPort(): WalletPort {
  return new FlashAPIAdapter({
    apiUrl: config.FLASH_API_URL,
    defaultTimeout: config.FLASH_API_TIMEOUT_MS,
  });
}

/** Create the hot ContextStorePort (Redis). */
function createHotContextStore(): RedisContextAdapter {
  return new RedisContextAdapter({
    url: config.REDIS_URL,
    ttlSeconds: config.CONTEXT_TTL_SECONDS,
    keyPrefix: `${config.REDIS_KEY_PREFIX}context:`,
  });
}

/** Create the cold ContextStorePort (encrypted filesystem). */
function createColdContextStore(): PersistentContextAdapter {
  return new PersistentContextAdapter({
    basePath: config.CONTEXT_DATA_DIR,
    encryptionKey: config.CONTEXT_ENCRYPTION_KEY,
  });
}

/** Create the VoicePort adapter (ElevenLabs), or null if not enabled/configured. */
function createVoicePort(): VoicePort | null {
  if (!config.ENABLE_VOICE) {
    return null;
  }

  if (!config.ELEVENLABS_API_KEY) {
    logger.warn('ENABLE_VOICE is true but ELEVENLABS_API_KEY is not set — voice disabled');
    return null;
  }

  return new ElevenLabsAdapter({
    apiKey: config.ELEVENLABS_API_KEY,
    defaultVoiceId: config.ELEVENLABS_DEFAULT_VOICE_ID,
  });
}

// ---------------------------------------------------------------------------
// Module factory
// ---------------------------------------------------------------------------

/**
 * Create and wire all application dependencies.
 *
 * This function performs all synchronous wiring. It does NOT initialise
 * network connections — call `initModule()` after to connect adapters.
 *
 * @returns A fully-wired AppModule.
 */
export async function createAppModule(): Promise<AppModule> {
  logger.info('AppModule: wiring dependencies');

  // --- Context stores ---
  const coldContextStore = createColdContextStore();
  const hotContextCache = createHotContextStore();
  const contextManager = new ContextManager(hotContextCache, coldContextStore);

  // --- AI providers ---
  const primaryAI = createPrimaryAIProvider();
  const fallbackAI = createFallbackAIProvider();

  // --- Wallet ---
  const wallet = createWalletPort();

  // --- Voice ---
  const voice = createVoicePort();

  // --- Tool registry ---
  const toolRegistry = new ToolRegistry();
  const discovery = await toolRegistry.autoDiscover();
  logger.info(
    { registered: discovery.toolsRegistered, failures: discovery.failures.length },
    'AppModule: tools registered',
  );

  if (discovery.failures.length > 0) {
    logger.warn({ failures: discovery.failures }, 'AppModule: some tools failed to load');
  }

  // --- Security ---
  const rateLimiter = new RateLimiter();
  const sanitizer = new InputSanitizer();
  const auditLog = new AuditLog();

  // --- Error handler (with AI fallback wired in) ---
  const errorHandlerInstance = new ErrorHandler({
    fallbackAIProvider: fallbackAI
      ? async () => {
          // The fallback provider answers with an empty agent run.
          // Real callers supply messages; here we return a static safe response
          // since we can't replay the full conversation at this level.
          logger.info('AppModule/ErrorHandler: delegating to Gemini fallback');
          const response = await fallbackAI.chat(
            [{ role: 'user', content: 'I need help.' }],
          );
          return response.content || "I'm here to help. Please repeat your request.";
        }
      : undefined,
  });

  // --- Session recovery ---
  const sessionRecovery = new SessionRecovery({
    redisUrl: config.REDIS_URL,
    keyPrefix: `${config.REDIS_KEY_PREFIX}session:pending:`,
    timeoutSeconds: 300, // 5 minutes
  });

  // --- Storage ---
  const storage = new FileSystemAdapter(config.STORAGE_ROOT_DIR);

  // --- Orchestrators ---
  const promptLoader = new PromptLoader();
  const agentOrchestrator = new AgentOrchestrator(primaryAI, toolRegistry);

  // --- Interaction log store ---
  const logStore = new (await import('./core/context/InteractionLogStore.js')).InteractionLogStore(
    config.STORAGE_ROOT_DIR,
  );
  await logStore.init();

  // --- Messaging adapter ---
  const whatsAppAdapter = createMessagingPort();

  const messageOrchestrator = new MessageOrchestrator({
    messaging: whatsAppAdapter,
    contextManager,
    rateLimiter,
    sanitizer,
    auditLog,
    agentOrchestrator,
    promptLoader,
    logStore,
    ttsProvider: voice ?? undefined,
  });

  logger.info('AppModule: all dependencies wired');

  return {
    // Ports
    messaging: whatsAppAdapter,
    ai: primaryAI,
    fallbackAI,
    wallet,
    contextStore: hotContextCache,
    voice,

    // Concrete adapters
    whatsAppAdapter,
    coldContextStore,
    hotContextCache,

    // Core services
    contextManager,
    toolRegistry,
    sessionRecovery,
    errorHandler: errorHandlerInstance,
    storage,

    // Orchestrators
    messageOrchestrator,
    agentOrchestrator,
  };
}

// ---------------------------------------------------------------------------
// Module initialisation
// ---------------------------------------------------------------------------

/**
 * Initialise network connections and start receiving messages.
 *
 * Call this after mounting HTTP routes (so the webhook endpoint is ready
 * before WhatsApp sends the first verification request).
 *
 * @param module  The wired AppModule returned by `createAppModule()`.
 */
export async function initModule(module: AppModule): Promise<void> {
  logger.info('AppModule: initialising');

  if (config.WHATSAPP_PHONE_NUMBER_ID && config.WHATSAPP_ACCESS_TOKEN) {
    await module.messaging.initialize();
    module.messageOrchestrator.register();
    logger.info('AppModule: WhatsApp adapter initialised and message handler registered');
  } else {
    logger.warn(
      'AppModule: WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not set — messaging disabled',
    );
  }

  logger.info('AppModule: initialisation complete ✓');
}

// ---------------------------------------------------------------------------
// Module shutdown
// ---------------------------------------------------------------------------

/**
 * Gracefully shut down all connections.
 *
 * @param module  The wired AppModule to shut down.
 */
export async function shutdownModule(module: AppModule): Promise<void> {
  logger.info('AppModule: shutting down');

  await Promise.allSettled([
    module.messaging.shutdown(),
    module.sessionRecovery.disconnect(),
  ]);

  logger.info('AppModule: shutdown complete');
}
