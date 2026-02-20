/**
 * AgentLoop unit tests.
 *
 * Tests the core AI ↔ tool ↔ AI cycle using fully mocked dependencies.
 */

jest.mock('../../../src/config/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { AgentLoop } from '../../../src/core/agent/AgentLoop';
import { createDefaultAgentConfig } from '../../../src/core/agent/AgentConfig';
import { createDefaultContext } from '../../../src/core/context/UserContext';
import { ToolRegistry } from '../../../src/core/agent/ToolRegistry';
import {
  MockAIProvider,
  makeTextResponse,
  makeToolCallResponse,
} from '../../mocks/MockAIProvider';
import type { ToolResult } from '../../../src/core/tools/Tool';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PHONE_HASH = 'test-phone-hash-abc123';

function makeUserContext(overrides = {}) {
  return createDefaultContext(PHONE_HASH, {
    identity: {
      phoneHash: PHONE_HASH,
      phoneNumber: '+18765551234',
      accountLinked: true,
      flashAccountId: 'account-123',
      kycTier: 1,
      ...overrides,
    },
  });
}

function makeRegistry(): jest.Mocked<ToolRegistry> {
  const registry = {
    getToolsForUser: jest.fn().mockReturnValue([]),
    toToolDefinitions: jest.fn().mockReturnValue([]),
    execute: jest.fn(),
    register: jest.fn(),
    get: jest.fn(),
    has: jest.fn(),
    size: 0,
  } as unknown as jest.Mocked<ToolRegistry>;
  return registry;
}

function buildLoop(
  aiProvider: MockAIProvider,
  registry: jest.Mocked<ToolRegistry>,
  overrides: Partial<Parameters<typeof createDefaultAgentConfig>[1]> = {},
) {
  const config = createDefaultAgentConfig(makeUserContext(), {
    maxIterations: 10,
    timeoutMs: 10_000,
    systemPrompt: 'You are Pulse.',
    ...overrides,
  });
  return new AgentLoop(config, registry, aiProvider);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentLoop', () => {
  let aiProvider: MockAIProvider;
  let registry: jest.Mocked<ToolRegistry>;

  beforeEach(() => {
    aiProvider = new MockAIProvider();
    registry = makeRegistry();
  });

  // ── 1. Basic text response (no tool calls) ─────────────────────────────

  describe('simple text response', () => {
    it('returns the AI response when no tool calls are made', async () => {
      aiProvider.queueResponse(makeTextResponse('Hello! How can I help you?'));
      const loop = buildLoop(aiProvider, registry);

      const result = await loop.run('hi');

      expect(result.terminationReason).toBe('complete');
      expect(result.response).toBe('Hello! How can I help you?');
      expect(result.aiCallCount).toBe(1);
      expect(result.toolCallCount).toBe(0);
      expect(result.totalTokensUsed).toBe(30);
    });

    it('passes the user message in the messages array', async () => {
      aiProvider.queueResponse(makeTextResponse('Got it'));
      const loop = buildLoop(aiProvider, registry);

      await loop.run('What is my balance?');

      const firstCall = aiProvider.calls[0]!;
      const userMsg = firstCall.messages.find((m) => m.role === 'user');
      expect(userMsg?.content).toBe('What is my balance?');
    });

    it('includes conversation history in messages', async () => {
      aiProvider.queueResponse(makeTextResponse('Sure'));
      const loop = buildLoop(aiProvider, registry);

      const history = [
        { role: 'user' as const, content: 'Previous message' },
        { role: 'assistant' as const, content: 'Previous reply' },
      ];
      await loop.run('New message', history);

      const { messages } = aiProvider.calls[0]!;
      expect(messages[0]?.content).toBe('Previous message');
      expect(messages[1]?.content).toBe('Previous reply');
      expect(messages[2]?.content).toBe('New message');
    });
  });

  // ── 2. Tool call cycle ──────────────────────────────────────────────────

  describe('tool call cycle', () => {
    it('executes a tool and feeds result back to AI', async () => {
      // First AI call returns a tool call
      aiProvider.queueResponse(
        makeToolCallResponse([{ name: 'check_balance', arguments: {} }]),
      );
      // Second AI call returns the final text response
      aiProvider.queueResponse(makeTextResponse('Your balance is $100.'));

      const toolResult: ToolResult = {
        success: true,
        output: 'Balance: $100.00 USD available',
        signal: 'continue',
      };
      registry.execute.mockResolvedValueOnce(toolResult);

      const loop = buildLoop(aiProvider, registry);
      const result = await loop.run('Check my balance');

      expect(result.terminationReason).toBe('complete');
      expect(result.response).toBe('Your balance is $100.');
      expect(result.toolCallCount).toBe(1);
      expect(result.aiCallCount).toBe(2);

      // Verify tool was called
      expect(registry.execute).toHaveBeenCalledWith(
        'check_balance',
        {},
        expect.objectContaining({ userContext: expect.any(Object), requestId: expect.any(String) }),
      );
    });

    it('feeds the tool result back into the conversation', async () => {
      aiProvider.queueResponse(
        makeToolCallResponse([{ id: 'call-1', name: 'check_balance', arguments: {} }]),
      );
      aiProvider.queueResponse(makeTextResponse('Balance retrieved.'));

      registry.execute.mockResolvedValueOnce({
        success: true,
        output: 'Balance: 500 USD',
        signal: 'continue',
      });

      const loop = buildLoop(aiProvider, registry);
      await loop.run('my balance');

      // Second AI call should include the tool result message
      const secondCall = aiProvider.calls[1]!;
      const toolMsg = secondCall.messages.find((m) => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      expect(toolMsg!.content).toBe('Balance: 500 USD');
      expect(toolMsg!.toolCallId).toBe('call-1');
      expect(toolMsg!.toolName).toBe('check_balance');
    });

    it('handles multiple tool calls in a single AI response', async () => {
      aiProvider.queueResponse(
        makeToolCallResponse([
          { id: 'c1', name: 'tool_a', arguments: { x: 1 } },
          { id: 'c2', name: 'tool_b', arguments: { y: 2 } },
        ]),
      );
      aiProvider.queueResponse(makeTextResponse('Both tools ran.'));

      registry.execute
        .mockResolvedValueOnce({ success: true, output: 'Result A', signal: 'continue' })
        .mockResolvedValueOnce({ success: true, output: 'Result B', signal: 'continue' });

      const loop = buildLoop(aiProvider, registry);
      const result = await loop.run('run both tools');

      expect(result.toolCallCount).toBe(2);
      expect(registry.execute).toHaveBeenCalledTimes(2);
      expect(registry.execute).toHaveBeenNthCalledWith(1, 'tool_a', { x: 1 }, expect.any(Object));
      expect(registry.execute).toHaveBeenNthCalledWith(2, 'tool_b', { y: 2 }, expect.any(Object));
    });

    it('chains multiple tool rounds', async () => {
      // Round 1: AI calls tool A
      aiProvider.queueResponse(
        makeToolCallResponse([{ name: 'tool_a', arguments: {} }]),
      );
      // Round 2: AI calls tool B
      aiProvider.queueResponse(
        makeToolCallResponse([{ name: 'tool_b', arguments: {} }]),
      );
      // Round 3: AI gives final response
      aiProvider.queueResponse(makeTextResponse('All done.'));

      registry.execute
        .mockResolvedValueOnce({ success: true, output: 'A done', signal: 'continue' })
        .mockResolvedValueOnce({ success: true, output: 'B done', signal: 'continue' });

      const loop = buildLoop(aiProvider, registry);
      const result = await loop.run('do both');

      expect(result.toolCallCount).toBe(2);
      expect(result.aiCallCount).toBe(3);
      expect(result.terminationReason).toBe('complete');
    });
  });

  // ── 3. Completion signals ───────────────────────────────────────────────

  describe('completion signals', () => {
    it('terminates with "complete" when a tool signals complete', async () => {
      aiProvider.queueResponse(
        makeToolCallResponse([{ name: 'complete_tool', arguments: {} }]),
      );
      // Final AI response after complete signal
      aiProvider.queueResponse(makeTextResponse('Task complete!'));

      registry.execute.mockResolvedValueOnce({
        success: true,
        output: 'Action completed successfully.',
        signal: 'complete',
      });

      const loop = buildLoop(aiProvider, registry);
      const result = await loop.run('complete action');

      expect(result.terminationReason).toBe('complete');
      expect(result.response).toBe('Task complete!');
    });

    it('terminates with "clarify" when a tool signals clarify', async () => {
      aiProvider.queueResponse(
        makeToolCallResponse([{ name: 'some_tool', arguments: {} }]),
      );
      aiProvider.queueResponse(makeTextResponse('Can you clarify what you mean?'));

      registry.execute.mockResolvedValueOnce({
        success: true,
        output: 'Need more info from user.',
        signal: 'clarify',
      });

      const loop = buildLoop(aiProvider, registry);
      const result = await loop.run('send money');

      expect(result.terminationReason).toBe('clarify');
      expect(result.response).toBe('Can you clarify what you mean?');
    });

    it('terminates with "escalate" when a tool signals escalate', async () => {
      aiProvider.queueResponse(
        makeToolCallResponse([{ name: 'escalate_tool', arguments: {} }]),
      );
      aiProvider.queueResponse(makeTextResponse('Connecting you to support.'));

      registry.execute.mockResolvedValueOnce({
        success: false,
        output: 'Issue requires human agent.',
        signal: 'escalate',
      });

      const loop = buildLoop(aiProvider, registry);
      const result = await loop.run('I have a problem');

      expect(result.terminationReason).toBe('escalate');
    });

    it('does one final AI call after a terminal signal', async () => {
      aiProvider.queueResponse(
        makeToolCallResponse([{ name: 'pay_tool', arguments: {} }]),
      );
      aiProvider.queueResponse(makeTextResponse('Payment complete!'));

      registry.execute.mockResolvedValueOnce({
        success: true,
        output: 'Payment sent.',
        signal: 'complete',
      });

      const loop = buildLoop(aiProvider, registry);
      await loop.run('pay now');

      // Should have made exactly 2 AI calls: one for tool call, one for final response
      expect(aiProvider.calls).toHaveLength(2);
      // The second call should have no tools (empty array for final response)
      const finalCall = aiProvider.calls[1]!;
      expect(finalCall.tools).toHaveLength(0);
    });
  });

  // ── 4. Max iterations ──────────────────────────────────────────────────

  describe('max iterations', () => {
    it('stops after maxIterations and returns a graceful message', async () => {
      // AI always returns a tool call → triggers max iteration
      aiProvider.setDefaultResponse(
        makeToolCallResponse([{ name: 'endless_tool', arguments: {} }]),
      );
      registry.execute.mockResolvedValue({
        success: true,
        output: 'done',
        signal: 'continue',
      });

      const loop = buildLoop(aiProvider, registry, { maxIterations: 3 });
      const result = await loop.run('keep going');

      expect(result.terminationReason).toBe('max_iterations');
      expect(result.response).toContain('rephrase');
      expect(result.aiCallCount).toBe(3);
    });
  });

  // ── 5. Timeout ─────────────────────────────────────────────────────────

  describe('timeout', () => {
    it('returns timeout result when timeoutMs is 0 (already expired)', async () => {
      // The AgentLoop checks timeout at the START of each iteration:
      //   if (Date.now() - startTime >= config.timeoutMs) → return timeout
      // With timeoutMs: 0, Date.now() - startTime >= 0 is always true,
      // so the loop times out immediately on the first iteration.
      aiProvider.setDefaultResponse(makeTextResponse('would be complete'));

      const config = createDefaultAgentConfig(makeUserContext(), {
        maxIterations: 10,
        timeoutMs: 0, // Immediately expired
        systemPrompt: 'You are Pulse.',
      });

      const loop = new AgentLoop(config, registry, aiProvider);
      const result = await loop.run('test timeout');

      expect(result.terminationReason).toBe('timeout');
      expect(result.response).toContain('taking too long');
      // With immediate timeout, the AI should not be called at all
      expect(aiProvider.calls).toHaveLength(0);
    });

    it('does not timeout when timeoutMs is generous and AI responds quickly', async () => {
      aiProvider.queueResponse(makeTextResponse('Quick response'));

      const config = createDefaultAgentConfig(makeUserContext(), {
        maxIterations: 10,
        timeoutMs: 30_000, // 30 seconds — plenty of time
        systemPrompt: 'You are Pulse.',
      });

      const loop = new AgentLoop(config, registry, aiProvider);
      const result = await loop.run('hello');

      expect(result.terminationReason).toBe('complete');
      expect(result.response).toBe('Quick response');
    });
  });

  // ── 6. Error handling ──────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches AI provider errors and returns graceful response', async () => {
      aiProvider.throwOnNextCall(new Error('AI API is down'));

      const loop = buildLoop(aiProvider, registry);
      const result = await loop.run('hello');

      expect(result.terminationReason).toBe('error');
      expect(result.response).toContain('unexpected error');
    });

    it('catches tool execution errors gracefully via ToolRegistry', async () => {
      // ToolRegistry.execute catches errors internally and returns an error result
      aiProvider.queueResponse(
        makeToolCallResponse([{ name: 'bad_tool', arguments: {} }]),
      );
      aiProvider.queueResponse(makeTextResponse('There was an error.'));

      registry.execute.mockResolvedValueOnce({
        success: false,
        output: "Tool 'bad_tool' encountered an error: Something went wrong",
        signal: 'continue',
      });

      const loop = buildLoop(aiProvider, registry);
      const result = await loop.run('do bad thing');

      // Should complete normally since ToolRegistry wraps errors
      expect(result.terminationReason).toBe('complete');
      expect(result.toolCallCount).toBe(1);
    });

    it('handles multiple sequential tool errors gracefully', async () => {
      aiProvider.queueResponse(
        makeToolCallResponse([{ name: 'flaky', arguments: {} }]),
      );
      aiProvider.queueResponse(makeTextResponse('Recovered.'));

      registry.execute.mockResolvedValueOnce({
        success: false,
        output: 'Flaky tool failed',
        signal: 'continue',
      });

      const loop = buildLoop(aiProvider, registry);
      const result = await loop.run('try it');

      expect(result.terminationReason).toBe('complete');
      expect(result.response).toBe('Recovered.');
    });
  });

  // ── 7. Context mutations ───────────────────────────────────────────────

  describe('context mutations', () => {
    it('applies context patches from tool execution', async () => {
      aiProvider.queueResponse(
        makeToolCallResponse([{ name: 'link_tool', arguments: {} }]),
      );
      aiProvider.queueResponse(makeTextResponse('Account linked!'));

      // Tool mutates context via updateContext callback
      registry.execute.mockImplementationOnce(async (_name, _args, ctx) => {
        ctx.updateContext({
          identity: {
            ...ctx.userContext.identity,
            accountLinked: true,
            flashUsername: 'testuser',
          },
        });
        return { success: true, output: 'Account linked.', signal: 'continue' };
      });

      const loop = buildLoop(aiProvider, registry);
      const result = await loop.run('link my account');

      // Updated context should reflect the mutation
      expect(result.updatedContext.identity.flashUsername).toBe('testuser');
      expect(result.updatedContext.identity.accountLinked).toBe(true);
    });
  });

  // ── 8. Token tracking ─────────────────────────────────────────────────

  describe('token tracking', () => {
    it('accumulates token counts across multiple AI calls', async () => {
      // Round 1: tool call (30 tokens)
      aiProvider.queueResponse(
        makeToolCallResponse([{ name: 'a_tool', arguments: {} }]),
      );
      // Round 2: final text (30 tokens)
      aiProvider.queueResponse(makeTextResponse('Done'));

      registry.execute.mockResolvedValueOnce({
        success: true,
        output: 'Tool result',
        signal: 'continue',
      });

      const loop = buildLoop(aiProvider, registry);
      const result = await loop.run('go');

      // Each mock response uses 30 tokens, so 2 calls = 60 total
      expect(result.totalTokensUsed).toBe(60);
    });
  });

  // ── 9. Duration tracking ───────────────────────────────────────────────

  describe('duration tracking', () => {
    it('records loop duration in milliseconds', async () => {
      aiProvider.queueResponse(makeTextResponse('Hi'));
      const loop = buildLoop(aiProvider, registry);

      const result = await loop.run('hello');

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe('number');
    });
  });
});
