/**
 * AgentOrchestrator unit tests.
 *
 * Covers:
 * - Prompt building (base + dialect + capability layers)
 * - Model tier selection (selectModelTier)
 * - AgentLoop creation and execution delegation
 * - Voice message handling
 * - Error handling during prompt loading
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

// Mock AgentLoop so we don't need real AI calls
const mockLoopRun = jest.fn();
jest.mock('../../src/core/agent/AgentLoop', () => ({
  AgentLoop: jest.fn().mockImplementation(() => ({
    run: mockLoopRun,
  })),
}));

// Mock createDefaultAgentConfig to track calls
const mockCreateDefaultAgentConfig = jest.fn().mockImplementation(
  (ctx, overrides) => ({ userContext: ctx, ...overrides }),
);
jest.mock('../../src/core/agent/AgentConfig', () => ({
  createDefaultAgentConfig: (...args: unknown[]) => mockCreateDefaultAgentConfig(...args),
}));

import { AgentOrchestrator } from '../../src/orchestrator/AgentOrchestrator';
import { AgentLoop } from '../../src/core/agent/AgentLoop';
import { createDefaultContext } from '../../src/core/context/UserContext';
import type { IncomingMessage } from '../../src/ports/MessagingPort';
import type { AIProviderPort } from '../../src/ports/AIProviderPort';
import type { ToolRegistry } from '../../src/core/agent/ToolRegistry';
import type { PromptLoader } from '../../src/config/PromptLoader';

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

function makeMockPromptLoader(overrides: Partial<Record<string, string>> = {}): jest.Mocked<PromptLoader> {
  const defaults: Record<string, string> = {
    'system/base-agent': 'You are Pulse, a financial assistant.',
    'system/dialect-awareness': 'Respond in Jamaican Patois where appropriate.',
    'capabilities/personal-agent': 'Help with personal payments.',
    'capabilities/merchant-agent': 'Help with merchant operations.',
    ...overrides,
  };

  return {
    load: jest.fn(async (name: string) => defaults[name] ?? ''),
    compose: jest.fn(),
  } as unknown as jest.Mocked<PromptLoader>;
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
  let promptLoader: jest.Mocked<PromptLoader>;
  let aiProvider: jest.Mocked<AIProviderPort>;
  let toolRegistry: jest.Mocked<ToolRegistry>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoopRun.mockResolvedValue(defaultLoopResult);

    promptLoader = makeMockPromptLoader();
    aiProvider = makeMockAIProvider();
    toolRegistry = makeMockToolRegistry();

    orchestrator = new AgentOrchestrator(aiProvider, toolRegistry, promptLoader);
  });

  // --------------------------------------------------------------------------
  // handle() — basic path
  // --------------------------------------------------------------------------
  describe('handle()', () => {
    it('returns the loop response mapped to AgentHandleResult', async () => {
      const userContext = createDefaultContext('hash-abc');
      const message = makeMessage({ text: 'Check my balance' });

      const result = await orchestrator.handle({
        message,
        userContext,
        requestId: 'req-001',
      });

      expect(result.response).toBe('Payment sent! ✅');
      expect(result.durationMs).toBe(250);
      expect(result.tokensUsed).toBe(120);
      expect(result.terminationReason).toBe('complete');
    });

    it('creates an AgentLoop instance and calls run()', async () => {
      const userContext = createDefaultContext('hash-abc');
      const message = makeMessage({ text: 'Send 500 sats to bob' });

      await orchestrator.handle({ message, userContext, requestId: 'req-002' });

      expect(AgentLoop).toHaveBeenCalledTimes(1);
      expect(mockLoopRun).toHaveBeenCalledTimes(1);
    });

    it('passes the correct user text to loop.run()', async () => {
      const userContext = createDefaultContext('hash-abc');
      const message = makeMessage({ text: 'What is my balance?' });

      await orchestrator.handle({ message, userContext, requestId: 'req-003' });

      expect(mockLoopRun).toHaveBeenCalledWith(
        'What is my balance?',
        expect.arrayContaining([expect.objectContaining({ role: 'system' })]),
      );
    });

    it('uses "[Voice message]" as user text when message has no text', async () => {
      const userContext = createDefaultContext('hash-abc');
      const voiceBuffer = Buffer.from('fake-audio');
      const message = makeMessage({ text: undefined, voice: voiceBuffer });

      await orchestrator.handle({ message, userContext, requestId: 'req-004' });

      expect(mockLoopRun).toHaveBeenCalledWith(
        '[Voice message]',
        expect.any(Array),
      );
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
  });

  // --------------------------------------------------------------------------
  // Prompt building
  // --------------------------------------------------------------------------
  describe('buildSystemPrompt (via handle)', () => {
    it('loads base-agent prompt for all users', async () => {
      await orchestrator.handle({
        message: makeMessage(),
        userContext: createDefaultContext('hash-abc'),
        requestId: 'req-p1',
      });

      expect(promptLoader.load).toHaveBeenCalledWith('system/base-agent');
    });

    it('loads personal-agent capability for non-merchant users', async () => {
      const userContext = createDefaultContext('hash-abc', {
        understanding: {
          primaryLanguage: 'en',
          preferredCurrency: 'USD',
          amountFormat: 'symbol',
          prefersVoice: false,
          literacyIndicators: { usesEmoji: false, averageMessageLength: 0, usesFormatting: false },
        },
      });
      // isMerchant defaults to false

      await orchestrator.handle({ message: makeMessage(), userContext, requestId: 'req-p2' });

      expect(promptLoader.load).toHaveBeenCalledWith('capabilities/personal-agent');
      expect(promptLoader.load).not.toHaveBeenCalledWith('capabilities/merchant-agent');
    });

    it('loads merchant-agent capability for merchant users', async () => {
      const userContext = createDefaultContext('hash-merch');
      // Inject merchant flag
      const merchantContext = {
        ...userContext,
        financial: {
          ...userContext.financial,
          isMerchant: true,
          merchantDetails: {
            businessName: "Alice's Store",
            merchantId: 'merch-001',
            defaultInvoiceExpirySecs: 3600,
          },
        },
      };

      await orchestrator.handle({
        message: makeMessage(),
        userContext: merchantContext,
        requestId: 'req-p3',
      });

      expect(promptLoader.load).toHaveBeenCalledWith('capabilities/merchant-agent');
      expect(promptLoader.load).not.toHaveBeenCalledWith('capabilities/personal-agent');
    });

    it('loads dialect awareness prompt when user has a detected dialect', async () => {
      const userContext = {
        ...createDefaultContext('hash-dialect'),
        understanding: {
          ...createDefaultContext('hash-dialect').understanding,
          dialect: 'jamaican-patois',
          dialectConfidence: 0.9,
        },
      };

      await orchestrator.handle({ message: makeMessage(), userContext, requestId: 'req-p4' });

      expect(promptLoader.load).toHaveBeenCalledWith('system/dialect-awareness');
    });

    it('does not load dialect awareness when no dialect is detected', async () => {
      const userContext = createDefaultContext('hash-no-dialect');
      // understanding.dialect is undefined by default

      await orchestrator.handle({ message: makeMessage(), userContext, requestId: 'req-p5' });

      expect(promptLoader.load).not.toHaveBeenCalledWith('system/dialect-awareness');
    });

    it('passes a system message with the built prompt to loop.run()', async () => {
      const userContext = createDefaultContext('hash-abc');

      await orchestrator.handle({ message: makeMessage(), userContext, requestId: 'req-p6' });

      const runCall = mockLoopRun.mock.calls[0] as [string, Array<{ role: string; content: string }>];
      const messages = runCall[1];

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('You are Pulse'),
          }),
        ]),
      );
    });

    it('falls back to default prompt string when promptLoader throws', async () => {
      promptLoader.load.mockRejectedValue(new Error('File not found'));

      const userContext = createDefaultContext('hash-fallback');

      // Should not throw
      await expect(
        orchestrator.handle({ message: makeMessage(), userContext, requestId: 'req-p7' }),
      ).resolves.toBeDefined();

      // The fallback prompt should be passed to the loop
      const runCall = mockLoopRun.mock.calls[0] as [string, Array<{ role: string; content: string }>];
      const sysMsg = runCall[1].find((m) => m.role === 'system');
      expect(sysMsg?.content).toContain('Pulse');
    });

    it('joins prompt layers with separator', async () => {
      // Setup: base + personal (no dialect)
      promptLoader.load.mockImplementation(async (name: string) => {
        if (name === 'system/base-agent') return 'BASE';
        if (name === 'capabilities/personal-agent') return 'PERSONAL';
        return '';
      });

      const userContext = createDefaultContext('hash-join');
      await orchestrator.handle({ message: makeMessage(), userContext, requestId: 'req-p8' });

      const runCall = mockLoopRun.mock.calls[0] as [string, Array<{ role: string; content: string }>];
      const sysContent = runCall[1].find((m) => m.role === 'system')?.content ?? '';

      expect(sysContent).toContain('BASE');
      expect(sysContent).toContain('PERSONAL');
      expect(sysContent).toContain('---'); // separator
    });
  });

  // --------------------------------------------------------------------------
  // Model tier selection
  // --------------------------------------------------------------------------
  describe('selectModelTier (via handle)', () => {
    it('defaults to "balanced" tier for standard messages', async () => {
      const userContext = createDefaultContext('hash-tier');

      await orchestrator.handle({
        message: makeMessage({ text: 'What is 5 + 3?' }),
        userContext,
        requestId: 'req-tier-1',
      });

      expect(mockCreateDefaultAgentConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ modelTier: 'balanced' }),
      );
    });

    it('uses "balanced" tier for voice messages', async () => {
      const userContext = createDefaultContext('hash-voice');

      await orchestrator.handle({
        message: makeMessage({ text: undefined, voice: Buffer.from('audio') }),
        userContext,
        requestId: 'req-tier-2',
      });

      expect(mockCreateDefaultAgentConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ modelTier: 'balanced' }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // Voice handling
  // --------------------------------------------------------------------------
  describe('voice message handling', () => {
    it('sets enableVoiceResponse when message contains voice', async () => {
      const userContext = createDefaultContext('hash-voice');
      const voiceMsg = makeMessage({ voice: Buffer.from('audio'), text: undefined });

      await orchestrator.handle({ message: voiceMsg, userContext, requestId: 'req-v1' });

      expect(mockCreateDefaultAgentConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ enableVoiceResponse: true }),
      );
    });

    it('does not set enableVoiceResponse for text-only messages', async () => {
      const userContext = createDefaultContext('hash-text');
      const textMsg = makeMessage({ text: 'Hello', voice: undefined });

      await orchestrator.handle({ message: textMsg, userContext, requestId: 'req-v2' });

      expect(mockCreateDefaultAgentConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ enableVoiceResponse: false }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // Error propagation
  // --------------------------------------------------------------------------
  describe('error handling', () => {
    it('propagates errors thrown by loop.run()', async () => {
      mockLoopRun.mockRejectedValueOnce(new Error('AI provider error'));

      await expect(
        orchestrator.handle({
          message: makeMessage(),
          userContext: createDefaultContext('hash-err'),
          requestId: 'req-err-1',
        }),
      ).rejects.toThrow('AI provider error');
    });
  });
});
