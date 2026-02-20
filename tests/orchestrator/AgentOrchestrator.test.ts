/**
 * AgentOrchestrator unit tests.
 *
 * Covers:
 * - Model tier selection (fast for standard, balanced for merchants/high-KYC)
 * - AgentLoop creation and execution delegation
 * - Voice message handling (enableVoiceResponse flag)
 * - System prompt and conversation history passthrough
 * - Graceful error handling (catches and returns friendly message)
 * - handle() result mapping
 */

// Mock logger
jest.mock('../../src/config/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock AgentLoop — using jest.fn() WITHOUT referencing outer variables
// (avoids the jest.mock hoisting issue)
jest.mock('../../src/core/agent/AgentLoop', () => ({
  AgentLoop: jest.fn(),
}));

// Mock createDefaultAgentConfig so we can spy on it
jest.mock('../../src/core/agent/AgentConfig', () => ({
  createDefaultAgentConfig: jest.fn((userContext, overrides) => ({
    userContext,
    ...overrides,
  })),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { AgentOrchestrator } from '../../src/orchestrator/AgentOrchestrator';
import { AgentLoop } from '../../src/core/agent/AgentLoop';
import { createDefaultAgentConfig } from '../../src/core/agent/AgentConfig';
import { createDefaultContext, patchContext } from '../../src/core/context/UserContext';
import type { IncomingMessage } from '../../src/ports/MessagingPort';
import type { AIProviderPort } from '../../src/ports/AIProviderPort';
import type { ToolRegistry } from '../../src/core/agent/ToolRegistry';

const MockAgentLoop = AgentLoop as jest.MockedClass<typeof AgentLoop>;
const mockCreateDefaultAgentConfig = createDefaultAgentConfig as jest.MockedFunction<
  typeof createDefaultAgentConfig
>;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    id: 'msg-test-001',
    from: '+18765551234',
    text: 'Send 1000 sats to alice',
    timestamp: new Date(),
    platform: 'whatsapp',
    isGroup: false,
    raw: {},
    ...overrides,
  };
}

function makeMockAIProvider(): jest.Mocked<AIProviderPort> {
  return {
    complete: jest.fn(),
    completeWithTools: jest.fn(),
    countTokens: jest.fn(),
    getModelName: jest.fn().mockReturnValue('claude-sonnet'),
    isAvailable: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<AIProviderPort>;
}

function makeMockToolRegistry(): jest.Mocked<ToolRegistry> {
  return {
    register: jest.fn(),
    get: jest.fn(),
    getAll: jest.fn().mockReturnValue([]),
    has: jest.fn().mockReturnValue(false),
  } as unknown as jest.Mocked<ToolRegistry>;
}

const defaultLoopResult = {
  response: 'Payment sent! ✅',
  updatedContext: createDefaultContext('hash-abc'),
  durationMs: 250,
  totalTokensUsed: 120,
  terminationReason: 'complete' as const,
  aiCallCount: 2,
  toolCallCount: 1,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator;
  let mockLoopRun: jest.Mock;
  let aiProvider: jest.Mocked<AIProviderPort>;
  let toolRegistry: jest.Mocked<ToolRegistry>;

  beforeEach(() => {
    // Configure AgentLoop mock for each test
    // NOTE: resetMocks: true (jest.config.ts) wipes implementations between tests,
    // so we always re-apply them here in beforeEach.
    mockLoopRun = jest.fn().mockResolvedValue(defaultLoopResult);
    MockAgentLoop.mockImplementation(() => ({
      run: mockLoopRun,
    }) as unknown as AgentLoop);

    // Restore default createDefaultAgentConfig behavior
    mockCreateDefaultAgentConfig.mockImplementation((userContext, overrides) => ({
      userContext,
      ...(overrides ?? {}),
    }) as ReturnType<typeof createDefaultAgentConfig>);

    aiProvider = makeMockAIProvider();
    toolRegistry = makeMockToolRegistry();
    orchestrator = new AgentOrchestrator(aiProvider, toolRegistry);
  });

  // --------------------------------------------------------------------------
  // handle() — basic path
  // --------------------------------------------------------------------------
  describe('handle()', () => {
    it('returns the loop response mapped to AgentHandleResult', async () => {
      const userContext = createDefaultContext('hash-abc');
      const result = await orchestrator.handle({
        message: makeMessage({ text: 'Check my balance' }),
        userContext,
        requestId: 'req-001',
      });

      expect(result.response).toBe('Payment sent! ✅');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.tokensUsed).toBe(120);
      expect(result.terminationReason).toBe('complete');
    });

    it('creates an AgentLoop instance and calls run()', async () => {
      const userContext = createDefaultContext('hash-abc');

      await orchestrator.handle({
        message: makeMessage({ text: 'Send 500 sats to bob' }),
        userContext,
        requestId: 'req-002',
      });

      expect(MockAgentLoop).toHaveBeenCalledTimes(1);
      expect(mockLoopRun).toHaveBeenCalledTimes(1);
    });

    it('passes the correct user text to loop.run()', async () => {
      const userContext = createDefaultContext('hash-abc');

      await orchestrator.handle({
        message: makeMessage({ text: 'What is my balance?' }),
        userContext,
        requestId: 'req-003',
      });

      const [userText] = mockLoopRun.mock.calls[0] as [string, unknown[]];
      expect(userText).toBe('What is my balance?');
    });

    it('uses "[Voice message]" as user text when message has no text', async () => {
      const userContext = createDefaultContext('hash-abc');

      await orchestrator.handle({
        message: makeMessage({ text: undefined, voice: Buffer.from('fake-audio') }),
        userContext,
        requestId: 'req-004',
      });

      const [userText] = mockLoopRun.mock.calls[0] as [string, unknown[]];
      expect(userText).toBe('[Voice message]');
    });

    it('returns updatedContext from the loop result', async () => {
      const updatedCtx = createDefaultContext('hash-updated');
      mockLoopRun.mockResolvedValueOnce({
        ...defaultLoopResult,
        updatedContext: updatedCtx,
      });

      const result = await orchestrator.handle({
        message: makeMessage(),
        userContext: createDefaultContext('hash-abc'),
        requestId: 'req-005',
      });

      expect(result.updatedContext).toBe(updatedCtx);
    });

    it('passes conversationHistory to loop.run() as historyMessages', async () => {
      const userContext = createDefaultContext('hash-abc');
      const history = [
        { role: 'user' as const, content: 'Hello!' },
        { role: 'assistant' as const, content: 'Hi! How can I help?' },
      ];

      await orchestrator.handle({
        message: makeMessage({ text: 'Send 500 sats' }),
        userContext,
        requestId: 'req-006',
        conversationHistory: history,
      });

      const [, historyMessages] = mockLoopRun.mock.calls[0] as [string, Array<{ role: string; content: string }>];
      expect(historyMessages).toEqual([
        { role: 'user', content: 'Hello!' },
        { role: 'assistant', content: 'Hi! How can I help?' },
      ]);
    });

    it('passes empty array to loop.run() when no conversationHistory provided', async () => {
      const userContext = createDefaultContext('hash-abc');

      await orchestrator.handle({
        message: makeMessage(),
        userContext,
        requestId: 'req-007',
      });

      const [, historyMessages] = mockLoopRun.mock.calls[0] as [string, unknown[]];
      expect(historyMessages).toEqual([]);
    });

    it('passes provided systemPrompt to createDefaultAgentConfig', async () => {
      const userContext = createDefaultContext('hash-abc');
      const customPrompt = 'You are a specialized merchant assistant.';

      await orchestrator.handle({
        message: makeMessage(),
        userContext,
        requestId: 'req-008',
        systemPrompt: customPrompt,
      });

      expect(mockCreateDefaultAgentConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ systemPrompt: customPrompt }),
      );
    });

    it('uses fallback system prompt when systemPrompt is not provided', async () => {
      const userContext = createDefaultContext('hash-abc');

      await orchestrator.handle({
        message: makeMessage(),
        userContext,
        requestId: 'req-009',
      });

      expect(mockCreateDefaultAgentConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          systemPrompt: expect.stringContaining('Pulse'),
        }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // Model tier selection
  // --------------------------------------------------------------------------
  describe('selectModelTier (via handle)', () => {
    it('uses "fast" tier for standard users (default)', async () => {
      const userContext = createDefaultContext('hash-standard');
      // Standard user: isMerchant=false, kycTier=0

      await orchestrator.handle({
        message: makeMessage({ text: 'Check balance' }),
        userContext,
        requestId: 'req-tier-1',
      });

      expect(mockCreateDefaultAgentConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ modelTier: 'fast' }),
      );
    });

    it('uses "balanced" tier for merchant users', async () => {
      const userContext = createDefaultContext('hash-merchant');
      const merchantContext = patchContext(userContext, {
        financial: {
          ...userContext.financial,
          isMerchant: true,
          merchantDetails: {
            businessName: "Alice's Shop",
            merchantId: 'merch-001',
            defaultInvoiceExpirySecs: 3600,
          },
        },
      });

      await orchestrator.handle({
        message: makeMessage(),
        userContext: merchantContext,
        requestId: 'req-tier-2',
      });

      expect(mockCreateDefaultAgentConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ modelTier: 'balanced' }),
      );
    });

    it('uses "balanced" tier for high-KYC users (kycTier >= 2)', async () => {
      const userContext = createDefaultContext('hash-highkyc');
      const highKycContext = patchContext(userContext, {
        identity: { ...userContext.identity, kycTier: 2 },
      });

      await orchestrator.handle({
        message: makeMessage(),
        userContext: highKycContext,
        requestId: 'req-tier-3',
      });

      expect(mockCreateDefaultAgentConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ modelTier: 'balanced' }),
      );
    });

    it('uses "fast" tier for kycTier=1 (below threshold)', async () => {
      const userContext = createDefaultContext('hash-kycone');
      const kycOneContext = patchContext(userContext, {
        identity: { ...userContext.identity, kycTier: 1 },
      });

      await orchestrator.handle({
        message: makeMessage(),
        userContext: kycOneContext,
        requestId: 'req-tier-4',
      });

      expect(mockCreateDefaultAgentConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ modelTier: 'fast' }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // Voice handling
  // --------------------------------------------------------------------------
  describe('voice message handling', () => {
    it('sets enableVoiceResponse=true when message contains voice', async () => {
      const userContext = createDefaultContext('hash-voice');

      await orchestrator.handle({
        message: makeMessage({ voice: Buffer.from('audio'), text: undefined }),
        userContext,
        requestId: 'req-v1',
      });

      expect(mockCreateDefaultAgentConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ enableVoiceResponse: true }),
      );
    });

    it('sets enableVoiceResponse=false for text-only messages', async () => {
      const userContext = createDefaultContext('hash-text');

      await orchestrator.handle({
        message: makeMessage({ text: 'Hello', voice: undefined }),
        userContext,
        requestId: 'req-v2',
      });

      expect(mockCreateDefaultAgentConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ enableVoiceResponse: false }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // Error handling — graceful recovery
  // --------------------------------------------------------------------------
  describe('error handling', () => {
    it('returns graceful error response when loop.run() throws', async () => {
      mockLoopRun.mockRejectedValueOnce(new Error('AI provider timeout'));

      const userContext = createDefaultContext('hash-err');
      const result = await orchestrator.handle({
        message: makeMessage(),
        userContext,
        requestId: 'req-err-1',
      });

      // Should NOT throw — returns graceful message
      expect(result.response).toContain("trouble thinking");
      expect(result.terminationReason).toBe('error');
      expect(result.tokensUsed).toBe(0);
    });

    it('preserves original userContext on loop error', async () => {
      mockLoopRun.mockRejectedValueOnce(new Error('Model overloaded'));

      const userContext = createDefaultContext('hash-err2');
      const result = await orchestrator.handle({
        message: makeMessage(),
        userContext,
        requestId: 'req-err-2',
      });

      expect(result.updatedContext).toBe(userContext);
    });

    it('does not throw on AI provider error', async () => {
      mockLoopRun.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(
        orchestrator.handle({
          message: makeMessage(),
          userContext: createDefaultContext('hash-err3'),
          requestId: 'req-err-3',
        }),
      ).resolves.toBeDefined();
    });

    it('returns durationMs even on error', async () => {
      mockLoopRun.mockRejectedValueOnce(new Error('Error'));

      const result = await orchestrator.handle({
        message: makeMessage(),
        userContext: createDefaultContext('hash-err4'),
        requestId: 'req-err-4',
      });

      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // --------------------------------------------------------------------------
  // AgentLoop instantiation
  // --------------------------------------------------------------------------
  describe('AgentLoop instantiation', () => {
    it('passes aiProvider and toolRegistry to AgentLoop constructor', async () => {
      await orchestrator.handle({
        message: makeMessage(),
        userContext: createDefaultContext('hash-abc'),
        requestId: 'req-loop-1',
      });

      expect(MockAgentLoop).toHaveBeenCalledWith(
        expect.anything(),   // agentConfig
        toolRegistry,
        aiProvider,
      );
    });

    it('creates a fresh AgentLoop instance for each handle() call', async () => {
      const ctx = createDefaultContext('hash-abc');

      await orchestrator.handle({ message: makeMessage(), userContext: ctx, requestId: 'r1' });
      await orchestrator.handle({ message: makeMessage(), userContext: ctx, requestId: 'r2' });

      expect(MockAgentLoop).toHaveBeenCalledTimes(2);
    });
  });
});
