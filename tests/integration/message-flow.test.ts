/**
 * Integration test — full message processing pipeline.
 *
 * Tests the complete message flow through MessageOrchestrator with all
 * external services mocked (WhatsApp, Claude, Flash API, Redis/ContextStore).
 *
 * NOTE: This file is excluded from the normal jest run by testPathIgnorePatterns.
 * Run explicitly with: npx jest --testPathPattern=integration
 */

// ---------------------------------------------------------------------------
// Module mocks (must be before imports)
// ---------------------------------------------------------------------------

jest.mock('../../src/config/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/orchestrator/EventBus', () => ({
  EventBus: jest.fn(),
  eventBus: {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    once: jest.fn(),
    removeAllListeners: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { MessageOrchestrator } from '../../src/orchestrator/MessageOrchestrator';
import { createDefaultContext } from '../../src/core/context/UserContext';
import { MockMessagingPort, makeIncomingMessage } from '../mocks/MockMessagingPort';
import type { IncomingMessage, MessagingPort } from '../../src/ports/MessagingPort';
import type { ContextManager } from '../../src/core/context/ContextManager';
import type { RateLimiter, RateLimitResult } from '../../src/core/security/RateLimiter';
import type { InputSanitizer, SanitizeResult } from '../../src/core/security/InputSanitizer';
import type { AuditLog } from '../../src/core/security/AuditLog';
import type {
  AgentOrchestrator,
  AgentHandleResult,
} from '../../src/orchestrator/AgentOrchestrator';
import type { PromptLoader } from '../../src/config/PromptLoader';
import type { InteractionLogStore } from '../../src/core/context/InteractionLogStore';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const PHONE_NUMBER = '+18765551234';
const PHONE_HASH = '5a741fb1c1cbad3c58d4f9e8d7b2a33c19e4a801e04c927d37b8d5f2c65a0f12';

const newUserContext = createDefaultContext(PHONE_HASH, {
  identity: {
    phoneHash: PHONE_HASH,
    phoneNumber: PHONE_NUMBER,
    accountLinked: false,
    kycTier: 0,
  },
});

const linkedUserContext = createDefaultContext(PHONE_HASH, {
  identity: {
    phoneHash: PHONE_HASH,
    phoneNumber: PHONE_NUMBER,
    accountLinked: true,
    flashAccountId: 'account-uuid-001',
    flashUsername: 'marcus',
    kycTier: 1,
  },
});

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeRateLimiterAllowed(): jest.Mocked<RateLimiter> {
  const result: RateLimitResult = {
    allowed: true,
    remaining: 29,
    resetAt: new Date(Date.now() + 60_000),
  };
  return {
    check: jest.fn().mockReturnValue(result),
    reset: jest.fn(),
    getUsage: jest.fn().mockReturnValue({ count: 1, remaining: 29 }),
  } as unknown as jest.Mocked<RateLimiter>;
}

function makeSanitizer(text?: string): jest.Mocked<InputSanitizer> {
  return {
    sanitize: jest.fn((input: string): SanitizeResult => ({
      sanitized: text ?? input,
      original: input,
      wasModified: false,
      flagged: false,
    })),
    isValidE164: jest.fn().mockReturnValue(true),
    isPlausibleInvoice: jest.fn().mockReturnValue(false),
    isValidLightningAddress: jest.fn().mockReturnValue(false),
  } as unknown as jest.Mocked<InputSanitizer>;
}

function makeAuditLog(): jest.Mocked<AuditLog> {
  return {
    record: jest.fn(),
    success: jest.fn(),
    failure: jest.fn(),
    blocked: jest.fn(),
  } as unknown as jest.Mocked<AuditLog>;
}

function makePromptLoader(prompt = 'You are Pulse.'): jest.Mocked<PromptLoader> {
  return {
    compose: jest.fn().mockResolvedValue(prompt),
    load: jest.fn().mockResolvedValue(prompt),
  } as unknown as jest.Mocked<PromptLoader>;
}

function makeLogStore(): jest.Mocked<InteractionLogStore> {
  return {
    append: jest.fn().mockResolvedValue({}),
    toConversationHistory: jest.fn().mockResolvedValue([]),
    getRecent: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<InteractionLogStore>;
}

function makeContextManager(
  userContext = newUserContext,
): jest.Mocked<ContextManager> {
  return {
    load: jest.fn().mockResolvedValue(userContext),
    save: jest.fn().mockResolvedValue(undefined),
    patch: jest.fn().mockResolvedValue(userContext),
    loadContext: jest.fn().mockResolvedValue(userContext),
    saveContext: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    invalidateCache: jest.fn(),
  } as unknown as jest.Mocked<ContextManager>;
}

function makeAgentOrchestrator(response: string): jest.Mocked<AgentOrchestrator> {
  const result: AgentHandleResult = {
    response,
    updatedContext: linkedUserContext,
    durationMs: 200,
    tokensUsed: 100,
    terminationReason: 'complete',
  };
  return {
    handle: jest.fn().mockResolvedValue(result),
  } as unknown as jest.Mocked<AgentOrchestrator>;
}

// ---------------------------------------------------------------------------
// Helper: build a MessageOrchestrator with overrideable deps
// ---------------------------------------------------------------------------

interface OrchestratorSetup {
  messaging: MockMessagingPort;
  contextManager: jest.Mocked<ContextManager>;
  rateLimiter: jest.Mocked<RateLimiter>;
  sanitizer: jest.Mocked<InputSanitizer>;
  auditLog: jest.Mocked<AuditLog>;
  agentOrchestrator: jest.Mocked<AgentOrchestrator>;
  promptLoader: jest.Mocked<PromptLoader>;
  logStore: jest.Mocked<InteractionLogStore>;
  orchestrator: MessageOrchestrator;
}

function buildOrchestrator(overrides: {
  agentResponse?: string;
  userContext?: ReturnType<typeof createDefaultContext>;
} = {}): OrchestratorSetup {
  const messaging = new MockMessagingPort();
  const contextManager = makeContextManager(overrides.userContext ?? newUserContext);
  const rateLimiter = makeRateLimiterAllowed();
  const sanitizer = makeSanitizer();
  const auditLog = makeAuditLog();
  const agentOrchestrator = makeAgentOrchestrator(
    overrides.agentResponse ?? 'Default response',
  );
  const promptLoader = makePromptLoader();
  const logStore = makeLogStore();

  const orchestrator = new MessageOrchestrator({
    messaging,
    contextManager,
    rateLimiter,
    sanitizer,
    auditLog,
    agentOrchestrator,
    promptLoader,
    logStore,
  });

  return {
    messaging,
    contextManager,
    rateLimiter,
    sanitizer,
    auditLog,
    agentOrchestrator,
    promptLoader,
    logStore,
    orchestrator,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MessageOrchestrator — full message flow', () => {
  // ── 1. New user sends "hello" ──────────────────────────────────────────

  describe('new user sends "hello"', () => {
    it('processes the message and sends an onboarding response', async () => {
      const ONBOARDING_RESPONSE =
        "Welcome to Pulse! I'm your Flash wallet assistant. " +
        "To get started, please link your Flash account. Reply 'link' to begin.";

      const { orchestrator, messaging } = buildOrchestrator({
        agentResponse: ONBOARDING_RESPONSE,
        userContext: newUserContext,
      });

      const message = makeIncomingMessage({ from: PHONE_NUMBER, text: 'hello' });
      await orchestrator.handleMessage(message);

      const sentTexts = messaging.sentMessages.filter((m) => m.type === 'text');
      expect(sentTexts).toHaveLength(1);
      expect(sentTexts[0]!.to).toBe(PHONE_NUMBER);
      expect(sentTexts[0]!.content).toBe(ONBOARDING_RESPONSE);
    });

    it('loads user context from context manager', async () => {
      const { orchestrator, contextManager } = buildOrchestrator({
        userContext: newUserContext,
      });

      await orchestrator.handleMessage(
        makeIncomingMessage({ from: PHONE_NUMBER, text: 'hello' }),
      );

      expect(contextManager.load).toHaveBeenCalledWith(PHONE_NUMBER);
    });

    it('checks rate limit before processing', async () => {
      const { orchestrator, rateLimiter } = buildOrchestrator({
        userContext: newUserContext,
      });

      await orchestrator.handleMessage(
        makeIncomingMessage({ from: PHONE_NUMBER, text: 'hello' }),
      );

      expect(rateLimiter.check).toHaveBeenCalled();
    });

    it('sanitizes the input text', async () => {
      const { orchestrator, sanitizer } = buildOrchestrator({
        userContext: newUserContext,
      });

      await orchestrator.handleMessage(
        makeIncomingMessage({ from: PHONE_NUMBER, text: 'hello' }),
      );

      expect(sanitizer.sanitize).toHaveBeenCalledWith('hello');
    });

    it('dispatches to AgentOrchestrator with the message', async () => {
      const { orchestrator, agentOrchestrator } = buildOrchestrator({
        userContext: newUserContext,
      });

      await orchestrator.handleMessage(
        makeIncomingMessage({ from: PHONE_NUMBER, text: 'hello' }),
      );

      expect(agentOrchestrator.handle).toHaveBeenCalled();
      const handleArg = agentOrchestrator.handle.mock.calls[0]![0];
      expect(handleArg.message.text).toBe('hello');
    });

    it('saves the updated context after processing', async () => {
      const { orchestrator, contextManager } = buildOrchestrator({
        userContext: newUserContext,
      });

      await orchestrator.handleMessage(
        makeIncomingMessage({ from: PHONE_NUMBER, text: 'hello' }),
      );

      expect(contextManager.save).toHaveBeenCalled();
    });

    it('logs the interaction', async () => {
      const { orchestrator, logStore } = buildOrchestrator({
        userContext: newUserContext,
      });

      await orchestrator.handleMessage(
        makeIncomingMessage({ from: PHONE_NUMBER, text: 'hello' }),
      );

      expect(logStore.append).toHaveBeenCalled();
    });
  });

  // ── 2. Linked user sends "check my balance" ────────────────────────────

  describe('linked user sends "check my balance"', () => {
    const BALANCE_RESPONSE = 'Your current balance is USD 50.00 💰';

    it('sends the balance response to the user', async () => {
      const { orchestrator, messaging } = buildOrchestrator({
        agentResponse: BALANCE_RESPONSE,
        userContext: linkedUserContext,
      });

      await orchestrator.handleMessage(
        makeIncomingMessage({ from: PHONE_NUMBER, text: 'check my balance' }),
      );

      const sentTexts = messaging.sentMessages.filter((m) => m.type === 'text');
      expect(sentTexts).toHaveLength(1);
      expect(sentTexts[0]!.content).toBe(BALANCE_RESPONSE);
    });

    it('passes the linked user context to AgentOrchestrator', async () => {
      const { orchestrator, agentOrchestrator } = buildOrchestrator({
        agentResponse: BALANCE_RESPONSE,
        userContext: linkedUserContext,
      });

      await orchestrator.handleMessage(
        makeIncomingMessage({ from: PHONE_NUMBER, text: 'check my balance' }),
      );

      const handleArg = agentOrchestrator.handle.mock.calls[0]![0];
      expect(handleArg.userContext.identity.accountLinked).toBe(true);
    });

    it('includes conversation history in the AgentOrchestrator call', async () => {
      const HISTORY = [
        { role: 'user' as const, content: 'What is my balance?' },
        { role: 'assistant' as const, content: 'Let me check...' },
      ];

      const { orchestrator, agentOrchestrator, logStore } = buildOrchestrator({
        agentResponse: BALANCE_RESPONSE,
        userContext: linkedUserContext,
      });

      logStore.toConversationHistory.mockResolvedValue(HISTORY);

      await orchestrator.handleMessage(
        makeIncomingMessage({ from: PHONE_NUMBER, text: 'check my balance' }),
      );

      const handleArg = agentOrchestrator.handle.mock.calls[0]![0];
      expect(handleArg.conversationHistory).toEqual(HISTORY);
    });
  });

  // ── 3. Linked user sends "send Marcus 500" ─────────────────────────────

  describe('linked user sends "send Marcus 500"', () => {
    const CONFIRMATION_PROMPT =
      'I found Marcus (marcus123). Ready to send 500 JMD to Marcus. ' +
      'Please confirm by replying "yes" or cancel with "no".';

    it('returns a confirmation prompt', async () => {
      const { orchestrator, messaging } = buildOrchestrator({
        agentResponse: CONFIRMATION_PROMPT,
        userContext: linkedUserContext,
      });

      await orchestrator.handleMessage(
        makeIncomingMessage({ from: PHONE_NUMBER, text: 'send Marcus 500' }),
      );

      const sentTexts = messaging.sentMessages.filter((m) => m.type === 'text');
      expect(sentTexts).toHaveLength(1);
      expect(sentTexts[0]!.content).toBe(CONFIRMATION_PROMPT);
    });

    it('the AgentOrchestrator is called with the payment message', async () => {
      const { orchestrator, agentOrchestrator } = buildOrchestrator({
        agentResponse: CONFIRMATION_PROMPT,
        userContext: linkedUserContext,
      });

      await orchestrator.handleMessage(
        makeIncomingMessage({ from: PHONE_NUMBER, text: 'send Marcus 500' }),
      );

      const handleArg = agentOrchestrator.handle.mock.calls[0]![0];
      expect(handleArg.message.text).toBe('send Marcus 500');
    });

    it('sends the typing indicator before processing', async () => {
      const { orchestrator, messaging } = buildOrchestrator({
        agentResponse: CONFIRMATION_PROMPT,
        userContext: linkedUserContext,
      });

      await orchestrator.handleMessage(
        makeIncomingMessage({ from: PHONE_NUMBER, text: 'send Marcus 500' }),
      );

      expect(messaging.typingIndicators).toContain(PHONE_NUMBER);
    });
  });

  // ── 4. Rate limiting ───────────────────────────────────────────────────

  describe('rate limiting', () => {
    it('blocks messages when rate limited', async () => {
      const setup = buildOrchestrator({ userContext: newUserContext });

      // Override rate limiter to return blocked
      const blockedResult: RateLimitResult = {
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + 60_000),
        message: "You're sending messages too quickly. Please wait a moment.",
      };
      setup.rateLimiter.check.mockReturnValue(blockedResult);

      await setup.orchestrator.handleMessage(
        makeIncomingMessage({ from: PHONE_NUMBER, text: 'hello' }),
      );

      // Rate limit message should be sent
      const sentTexts = setup.messaging.sentMessages.filter((m) => m.type === 'text');
      expect(sentTexts).toHaveLength(1);
      expect(sentTexts[0]!.content).toContain('too quickly');

      // AgentOrchestrator should NOT have been called
      expect(setup.agentOrchestrator.handle).not.toHaveBeenCalled();
    });
  });

  // ── 5. Error handling ──────────────────────────────────────────────────

  describe('error handling', () => {
    it('sends graceful error message when AgentOrchestrator fails', async () => {
      const setup = buildOrchestrator({ userContext: linkedUserContext });
      setup.agentOrchestrator.handle.mockRejectedValue(new Error('AI service down'));

      await setup.orchestrator.handleMessage(
        makeIncomingMessage({ from: PHONE_NUMBER, text: 'hello' }),
      );

      const sentTexts = setup.messaging.sentMessages.filter((m) => m.type === 'text');
      expect(sentTexts.length).toBeGreaterThan(0);
      // Should send a graceful error message
      expect(sentTexts[0]!.content).toContain('trouble');
    });

    it('never throws even on cascading failures', async () => {
      const setup = buildOrchestrator({ userContext: newUserContext });
      setup.agentOrchestrator.handle.mockRejectedValue(new Error('Catastrophic failure'));
      setup.messaging.sendText = jest.fn().mockRejectedValue(new Error('Messaging down too'));

      // Should not throw — pipeline catches all errors
      await expect(
        setup.orchestrator.handleMessage(
          makeIncomingMessage({ from: PHONE_NUMBER, text: 'hello' }),
        ),
      ).resolves.not.toThrow();
    });

    it('logs interactions even when there are errors', async () => {
      const setup = buildOrchestrator({ userContext: newUserContext });
      setup.agentOrchestrator.handle.mockRejectedValue(new Error('Agent failed'));

      await setup.orchestrator.handleMessage(
        makeIncomingMessage({ from: PHONE_NUMBER, text: 'hello' }),
      );

      // Interaction log should still be written
      expect(setup.logStore.append).toHaveBeenCalled();
    });
  });

  // ── 6. Dialect detection ──────────────────────────────────────────────

  describe('dialect detection integration', () => {
    it('processes Patois messages through the full pipeline', async () => {
      const PATOIS_RESPONSE = 'Wagwan! Mi can help you wid dat.';
      const { orchestrator, messaging, agentOrchestrator } = buildOrchestrator({
        agentResponse: PATOIS_RESPONSE,
        userContext: newUserContext,
      });

      await orchestrator.handleMessage(
        makeIncomingMessage({ from: PHONE_NUMBER, text: 'mi waa fi check mi balance' }),
      );

      // Message should be processed
      expect(agentOrchestrator.handle).toHaveBeenCalled();

      const sentTexts = messaging.sentMessages.filter((m) => m.type === 'text');
      expect(sentTexts).toHaveLength(1);
      expect(sentTexts[0]!.content).toBe(PATOIS_RESPONSE);
    });

    it('passes the system prompt to the AgentOrchestrator', async () => {
      const SYSTEM_PROMPT = 'You are Pulse, a Caribbean financial assistant.';
      const { orchestrator, agentOrchestrator, promptLoader } = buildOrchestrator({
        userContext: newUserContext,
      });
      promptLoader.compose.mockResolvedValue(SYSTEM_PROMPT);

      await orchestrator.handleMessage(
        makeIncomingMessage({ from: PHONE_NUMBER, text: 'hello' }),
      );

      const handleArg = agentOrchestrator.handle.mock.calls[0]![0];
      expect(handleArg.systemPrompt).toBe(SYSTEM_PROMPT);
    });
  });

  // ── 7. Context persistence ─────────────────────────────────────────────

  describe('context persistence', () => {
    it('persists the updated context returned by AgentOrchestrator', async () => {
      const updatedCtx = {
        ...linkedUserContext,
        session: { ...linkedUserContext.session, messageCount: 1 },
      };

      const setup = buildOrchestrator({ userContext: linkedUserContext });
      setup.agentOrchestrator.handle.mockResolvedValue({
        response: 'Done',
        updatedContext: updatedCtx,
        durationMs: 100,
        tokensUsed: 50,
        terminationReason: 'complete',
      });

      await setup.orchestrator.handleMessage(
        makeIncomingMessage({ from: PHONE_NUMBER, text: 'hello' }),
      );

      // Context manager save should have been called with the phone number
      expect(setup.contextManager.save).toHaveBeenCalledWith(
        PHONE_NUMBER,
        expect.objectContaining({
          identity: expect.objectContaining({ accountLinked: true }),
        }),
      );
    });
  });
});
