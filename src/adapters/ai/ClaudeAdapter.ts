/**
 * ClaudeAdapter — implements AIProviderPort using Anthropic's Claude API.
 *
 * This is a stub implementation. All methods throw 'Not implemented'.
 * Full implementation lands in the AI integration sprint (Week 1).
 *
 * References:
 *   https://docs.anthropic.com/en/api/messages
 *   npm: @anthropic-ai/sdk
 */

import type {
  AIProviderPort,
  AIMessage,
  AIResponse,
  AIRequestConfig,
  ToolDefinition,
} from '../../ports/AIProviderPort.js';

/** Default Claude model identifiers per tier. */
export const CLAUDE_MODELS = {
  fast: 'claude-haiku-3-5',
  balanced: 'claude-sonnet-4-5',
  powerful: 'claude-opus-4-5',
} as const;

export class ClaudeAdapter implements AIProviderPort {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      maxTokens?: number;
      defaultTemperature?: number;
    },
  ) {}

  async chat(
    _messages: AIMessage[],
    _tools?: ToolDefinition[],
    _config?: AIRequestConfig,
  ): Promise<AIResponse> {
    throw new Error('Not implemented: ClaudeAdapter.chat');
  }

  async ping(): Promise<boolean> {
    throw new Error('Not implemented: ClaudeAdapter.ping');
  }

  getModelName(): string {
    return this.config.model ?? CLAUDE_MODELS.balanced;
  }

  getProviderName(): string {
    return 'Anthropic';
  }

  getContextWindowSize(): number {
    // claude-sonnet-4-5: 200k context window
    return 200_000;
  }
}
