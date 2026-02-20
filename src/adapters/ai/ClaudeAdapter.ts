/**
 * ClaudeAdapter — implements AIProviderPort using Anthropic's Claude API.
 *
 * References:
 *   https://docs.anthropic.com/en/api/messages
 *   npm: @anthropic-ai/sdk
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  AIProviderPort,
  AIMessage,
  AIResponse,
  AIRequestConfig,
  ToolDefinition,
  TokenUsage,
  ToolCall,
} from '../../ports/AIProviderPort.js';
import { logger } from '../../config/logger.js';

/** Default Claude model identifiers per tier. */
export const CLAUDE_MODELS = {
  fast: 'claude-haiku-3-5',
  balanced: 'claude-sonnet-4-5',
  powerful: 'claude-opus-4-5',
} as const;

/** Context window sizes by model prefix. */
const CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4': 200_000,
  'claude-sonnet-4': 200_000,
  'claude-haiku-3-5': 200_000,
  'claude-3-5': 200_000,
  'claude-3': 200_000,
};

/** Configuration for the Claude adapter. */
export interface ClaudeAdapterConfig {
  /** Anthropic API key. */
  apiKey: string;
  /**
   * Model identifier.
   * @default CLAUDE_MODELS.balanced
   */
  model?: string;
  /**
   * Default maximum output tokens.
   * @default 4096
   */
  maxTokens?: number;
  /**
   * Default sampling temperature.
   * @default 0.7
   */
  defaultTemperature?: number;
}

/**
 * Convert our internal AIMessage[] to Anthropic's MessageParam[].
 *
 * Anthropic does not accept 'system' messages in the messages array — those
 * are passed as a top-level `system` parameter. 'tool' role messages become
 * 'user' messages with a tool_result content block.
 */
function toAnthropicMessages(
  messages: AIMessage[],
): Anthropic.Messages.MessageParam[] {
  const result: Anthropic.Messages.MessageParam[] = [];

  for (const msg of messages) {
    // System messages are handled at the top level; skip them here.
    if (msg.role === 'system') continue;

    if (msg.role === 'tool') {
      // Tool result — becomes a user message with a tool_result block.
      result.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.toolCallId ?? '',
            content: msg.content,
          },
        ],
      });
    } else if (msg.role === 'assistant') {
      // Assistant messages may contain tool_use blocks alongside text.
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        const contentBlocks: Array<
          Anthropic.Messages.TextBlockParam | Anthropic.Messages.ToolUseBlockParam
        > = [];

        if (msg.content) {
          contentBlocks.push({ type: 'text', text: msg.content });
        }

        for (const tc of msg.toolCalls) {
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }

        result.push({ role: 'assistant', content: contentBlocks });
      } else {
        result.push({ role: 'assistant', content: msg.content });
      }
    } else {
      // user role
      result.push({ role: 'user', content: msg.content });
    }
  }

  return result;
}

/**
 * Convert our ToolDefinition[] to Anthropic's Tool[] format.
 */
function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Messages.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Messages.Tool.InputSchema,
  }));
}

/**
 * Extract ToolCall[] from Anthropic content blocks.
 */
function extractToolCalls(
  content: Anthropic.Messages.ContentBlock[],
): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const block of content) {
    if (block.type === 'tool_use') {
      calls.push({
        id: block.id,
        name: block.name,
        arguments: block.input as Record<string, unknown>,
      });
    }
  }
  return calls;
}

/**
 * Extract plain text from Anthropic content blocks.
 */
function extractText(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/**
 * Map Anthropic stop_reason to our AIResponse.stopReason.
 */
function mapStopReason(
  reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null,
): AIResponse['stopReason'] {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'max_tokens':
      return 'max_tokens';
    case 'tool_use':
      return 'tool_use';
    default:
      return 'stop';
  }
}

/**
 * ClaudeAdapter — wraps @anthropic-ai/sdk to implement AIProviderPort.
 */
export class ClaudeAdapter implements AIProviderPort {
  private readonly client: Anthropic;
  private readonly resolvedModel: string;
  private readonly defaultMaxTokens: number;
  private readonly defaultTemperature: number;

  constructor(config: ClaudeAdapterConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.resolvedModel = config.model ?? CLAUDE_MODELS.balanced;
    this.defaultMaxTokens = config.maxTokens ?? 4096;
    this.defaultTemperature = config.defaultTemperature ?? 0.7;
  }

  async chat(
    messages: AIMessage[],
    tools: ToolDefinition[] = [],
    requestConfig: AIRequestConfig = {},
  ): Promise<AIResponse> {
    // Determine system prompt: prefer explicit override, fall back to system messages.
    const systemMessages = messages.filter((m) => m.role === 'system');
    const systemPrompt =
      requestConfig.systemPrompt ??
      (systemMessages.length > 0
        ? systemMessages.map((m) => m.content).join('\n\n')
        : undefined);

    const anthropicMessages = toAnthropicMessages(messages);
    const anthropicTools =
      tools.length > 0 ? toAnthropicTools(tools) : undefined;

    const maxTokens = requestConfig.maxTokens ?? this.defaultMaxTokens;
    const temperature = requestConfig.temperature ?? this.defaultTemperature;

    logger.debug(
      {
        model: this.resolvedModel,
        messageCount: anthropicMessages.length,
        toolCount: tools.length,
        maxTokens,
      },
      'ClaudeAdapter chat request',
    );

    try {
      const response = await this.client.messages.create({
        model: this.resolvedModel,
        max_tokens: maxTokens,
        temperature,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: anthropicMessages,
        ...(anthropicTools ? { tools: anthropicTools } : {}),
        ...(requestConfig.stopSequences && requestConfig.stopSequences.length > 0
          ? { stop_sequences: requestConfig.stopSequences }
          : {}),
        ...(requestConfig.topP !== undefined ? { top_p: requestConfig.topP } : {}),
      });

      const text = extractText(response.content);
      const toolCalls = extractToolCalls(response.content);

      const usage: TokenUsage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      };

      logger.debug(
        {
          model: response.model,
          stopReason: response.stop_reason,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          toolCallCount: toolCalls.length,
        },
        'ClaudeAdapter chat response',
      );

      return {
        content: text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage,
        model: response.model,
        stopReason: mapStopReason(response.stop_reason),
      };
    } catch (err) {
      logger.error({ err, model: this.resolvedModel }, 'ClaudeAdapter chat error');
      throw err;
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.resolvedModel,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch (err) {
      logger.warn({ err, model: this.resolvedModel }, 'ClaudeAdapter ping failed');
      return false;
    }
  }

  getModelName(): string {
    return this.resolvedModel;
  }

  getProviderName(): string {
    return 'Anthropic';
  }

  getContextWindowSize(): number {
    for (const [prefix, size] of Object.entries(CONTEXT_WINDOWS)) {
      if (this.resolvedModel.startsWith(prefix)) return size;
    }
    // Safe default for any unknown Claude model
    return 200_000;
  }
}
