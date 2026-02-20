/**
 * GeminiAdapter — AIProviderPort implementation for Google Gemini.
 *
 * Used for fast/cheap model tier (Gemini Flash).
 */

import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import type {
  AIProviderPort,
  AIMessage,
  AIResponse,
  AIRequestConfig,
  ToolDefinition,
  TokenUsage,
} from '../../ports/AIProviderPort.js';
import { logger } from '../../config/logger.js';

/** Configuration for the Gemini adapter. */
export interface GeminiAdapterConfig {
  /** Google AI API key */
  apiKey: string;
  /**
   * Model ID.
   * @default 'gemini-1.5-flash'
   */
  model?: string;
  /** Default max output tokens */
  defaultMaxTokens?: number;
  /** Default temperature */
  defaultTemperature?: number;
}

/**
 * GeminiAdapter — wraps the Google Generative AI SDK to implement AIProviderPort.
 */
export class GeminiAdapter implements AIProviderPort {
  private readonly genAI: GoogleGenerativeAI;
  private readonly config: Required<GeminiAdapterConfig>;
  private model: GenerativeModel;

  constructor(config: GeminiAdapterConfig) {
    this.config = {
      model: config.model ?? 'gemini-1.5-flash',
      defaultMaxTokens: config.defaultMaxTokens ?? 2048,
      defaultTemperature: config.defaultTemperature ?? 0.7,
      apiKey: config.apiKey,
    };
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: this.config.model });
  }

  async chat(
    messages: AIMessage[],
    tools: ToolDefinition[] = [],
    requestConfig: AIRequestConfig = {},
  ): Promise<AIResponse> {
    // Extract system prompt
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const systemInstruction =
      requestConfig.systemPrompt ??
      (systemMessages.length > 0
        ? systemMessages.map((m) => m.content).join('\n\n')
        : undefined);

    // Get a model instance with this config
    const modelInstance = this.genAI.getGenerativeModel({
      model: this.config.model,
      systemInstruction,
      generationConfig: {
        maxOutputTokens: requestConfig.maxTokens ?? this.config.defaultMaxTokens,
        temperature: requestConfig.temperature ?? this.config.defaultTemperature,
        topP: requestConfig.topP,
        stopSequences: requestConfig.stopSequences,
      },
    });

    // Convert messages to Gemini format
    const history = conversationMessages.slice(0, -1).map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const lastMessage = conversationMessages[conversationMessages.length - 1];
    if (!lastMessage) {
      throw new Error('GeminiAdapter: messages array is empty');
    }

    // Build tool declarations if provided
    const toolDeclarations = tools.length > 0
      ? [{
          functionDeclarations: tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        }]
      : undefined;

    logger.debug(
      { model: this.config.model, messageCount: conversationMessages.length, toolCount: tools.length },
      'GeminiAdapter chat request',
    );

    const chat = modelInstance.startChat({
      history,
      tools: toolDeclarations as any,
    });

    const result = await chat.sendMessage(lastMessage.content);
    const response = result.response;

    const usage: TokenUsage = {
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
    };

    // Extract content and function calls
    let content = '';
    const toolCalls = [];

    const candidate = response.candidates?.[0];
    if (candidate) {
      for (const part of candidate.content.parts) {
        if ('text' in part && part.text) {
          content += part.text;
        } else if ('functionCall' in part && part.functionCall) {
          toolCalls.push({
            id: crypto.randomUUID(),
            name: part.functionCall.name,
            arguments: (part.functionCall.args ?? {}) as Record<string, unknown>,
          });
        }
      }
    }

    const finishReason = candidate?.finishReason;
    let stopReason: AIResponse['stopReason'] = 'stop';
    if (finishReason === 'MAX_TOKENS') stopReason = 'max_tokens';
    else if (toolCalls.length > 0) stopReason = 'tool_use';

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      model: this.config.model,
      stopReason,
    };
  }

  async ping(): Promise<boolean> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.config.model });
      await model.generateContent('ping');
      return true;
    } catch {
      return false;
    }
  }

  getModelName(): string {
    return this.config.model;
  }

  getProviderName(): string {
    return 'Google';
  }

  getContextWindowSize(): number {
    if (this.config.model.includes('1.5')) return 1_000_000;
    return 32_000;
  }
}
