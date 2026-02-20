/**
 * MockAIProvider — configurable mock for AIProviderPort.
 *
 * Usage:
 *   const mock = new MockAIProvider();
 *   mock.queueResponse({ content: 'Hello', toolCalls: [], ... });
 *   mock.queueResponse({ content: '', toolCalls: [{ id: '1', name: 'check_balance', arguments: {} }], ... });
 */

import type {
  AIProviderPort,
  AIMessage,
  AIResponse,
  ToolDefinition,
  AIRequestConfig,
} from '../../src/ports/AIProviderPort';

/** Default usage stats for mock responses. */
const DEFAULT_USAGE = { inputTokens: 10, outputTokens: 20, totalTokens: 30 };

/** Factory for a simple text-only AI response. */
export function makeTextResponse(content: string): AIResponse {
  return {
    content,
    toolCalls: [],
    usage: { ...DEFAULT_USAGE },
    model: 'mock-model',
    stopReason: 'stop',
  };
}

/** Factory for a tool-call AI response. */
export function makeToolCallResponse(
  toolCalls: Array<{ id?: string; name: string; arguments: Record<string, unknown> }>,
): AIResponse {
  return {
    content: '',
    toolCalls: toolCalls.map((tc, i) => ({
      id: tc.id ?? `tool-call-${i}`,
      name: tc.name,
      arguments: tc.arguments,
    })),
    usage: { ...DEFAULT_USAGE },
    model: 'mock-model',
    stopReason: 'tool_use',
  };
}

/**
 * MockAIProvider — implements AIProviderPort with a FIFO response queue.
 *
 * Each call to `chat()` pops the next response from the queue.
 * If the queue is empty, returns the default response (or throws if configured).
 */
export class MockAIProvider implements AIProviderPort {
  private readonly queue: AIResponse[] = [];
  private defaultResponse: AIResponse = makeTextResponse('Mock response');
  private shouldThrow: Error | null = null;

  /** Track all calls for assertion */
  readonly calls: Array<{
    messages: AIMessage[];
    tools: ToolDefinition[];
    config?: AIRequestConfig;
  }> = [];

  /** Configure the provider to throw on the next call. */
  throwOnNextCall(error: Error | string): this {
    this.shouldThrow = typeof error === 'string' ? new Error(error) : error;
    return this;
  }

  /** Queue a response to return on the next call. */
  queueResponse(response: AIResponse): this {
    this.queue.push(response);
    return this;
  }

  /** Queue multiple responses. */
  queueResponses(responses: AIResponse[]): this {
    this.queue.push(...responses);
    return this;
  }

  /** Set the fallback response used when the queue is empty. */
  setDefaultResponse(response: AIResponse): this {
    this.defaultResponse = response;
    return this;
  }

  /** Clear the queue and reset state. */
  reset(): this {
    this.queue.length = 0;
    this.calls.length = 0;
    this.shouldThrow = null;
    this.defaultResponse = makeTextResponse('Mock response');
    return this;
  }

  // ── AIProviderPort implementation ────────────────────────────────────────

  async chat(
    messages: AIMessage[],
    tools: ToolDefinition[] = [],
    config?: AIRequestConfig,
  ): Promise<AIResponse> {
    this.calls.push({ messages, tools, config });

    if (this.shouldThrow) {
      const err = this.shouldThrow;
      this.shouldThrow = null;
      throw err;
    }

    return this.queue.length > 0 ? this.queue.shift()! : this.defaultResponse;
  }

  async ping(): Promise<boolean> {
    return true;
  }

  getModelName(): string {
    return 'mock-model';
  }

  getProviderName(): string {
    return 'MockProvider';
  }

  getContextWindowSize(): number {
    return 200_000;
  }
}
