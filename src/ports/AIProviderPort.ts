/**
 * AIProviderPort — hexagonal boundary for AI/LLM providers.
 * Adapters for Claude, Gemini, GPT-4, etc. all implement this interface.
 */

/** JSON Schema describing a tool parameter. */
export type JsonSchema = Record<string, unknown>;

/** Definition of a tool exposed to the AI model. */
export interface ToolDefinition {
  /** Unique tool name. Must match the name used in ToolCall.name. */
  name: string;
  /** Human-readable description telling the AI what this tool does. */
  description: string;
  /** JSON Schema object describing the tool's parameters. */
  parameters: JsonSchema;
}

/** A tool invocation requested by the AI model. */
export interface ToolCall {
  /** Unique ID for this specific tool call (used to correlate results). */
  id: string;
  /** Name of the tool to invoke. */
  name: string;
  /** Parsed arguments to pass to the tool. */
  arguments: Record<string, unknown>;
}

/** A single message in the conversation history. */
export interface AIMessage {
  /** Message role in the conversation. */
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** Text content of the message. */
  content: string;
  /**
   * Tool calls requested by the assistant in this message.
   * Only present when role === 'assistant'.
   */
  toolCalls?: ToolCall[];
  /**
   * ID of the tool call this message is responding to.
   * Only present when role === 'tool'.
   */
  toolCallId?: string;
  /**
   * Name of the tool this result belongs to.
   * Only present when role === 'tool'.
   */
  toolName?: string;
}

/** Token usage statistics for a completion. */
export interface TokenUsage {
  /** Tokens consumed by the prompt/input. */
  inputTokens: number;
  /** Tokens consumed by the completion/output. */
  outputTokens: number;
  /** Total tokens (inputTokens + outputTokens). */
  totalTokens: number;
}

/** A completion response from an AI provider. */
export interface AIResponse {
  /** Text response from the model. Empty string if the model only made tool calls. */
  content: string;
  /**
   * Tool calls requested by the model, if any.
   * When present, the caller must execute the tools and continue the conversation.
   */
  toolCalls?: ToolCall[];
  /** Token usage statistics for cost tracking. */
  usage: TokenUsage;
  /** The specific model variant that produced this response. */
  model: string;
  /** Reason the model stopped generating: 'stop', 'tool_use', 'max_tokens', etc. */
  stopReason: 'stop' | 'tool_use' | 'max_tokens' | 'error' | string;
}

/** Optional per-request AI configuration overrides. */
export interface AIRequestConfig {
  /** Maximum output tokens. Defaults to provider default. */
  maxTokens?: number;
  /**
   * Sampling temperature (0.0–1.0). Lower = more deterministic.
   * Default varies by provider; 0.7 is typical.
   */
  temperature?: number;
  /**
   * Top-p nucleus sampling. Alternative to temperature.
   */
  topP?: number;
  /**
   * Stop sequences — the model will halt generation when any are encountered.
   */
  stopSequences?: string[];
  /**
   * System prompt override. If not provided, the caller must include
   * a system message in the messages array.
   */
  systemPrompt?: string;
}

/**
 * AIProviderPort — implement this for every AI/LLM backend.
 *
 * All methods must be stateless. Conversation history is managed externally
 * and passed in full on every call.
 */
export interface AIProviderPort {
  /**
   * Send a conversation to the AI model and receive a completion.
   *
   * @param messages Full conversation history, oldest-first.
   * @param tools Optional list of tools the model may call.
   * @param config Optional per-request configuration overrides.
   * @returns The model's response, including any tool calls.
   */
  chat(
    messages: AIMessage[],
    tools?: ToolDefinition[],
    config?: AIRequestConfig,
  ): Promise<AIResponse>;

  /**
   * Check if the provider is reachable and the API key is valid.
   * Used for health checks.
   */
  ping(): Promise<boolean>;

  /**
   * Human-readable model name, e.g. 'claude-opus-4-5', 'gemini-1.5-pro'.
   * This is what was configured, not necessarily the exact version used.
   */
  getModelName(): string;

  /**
   * Human-readable provider name, e.g. 'Anthropic', 'Google'.
   */
  getProviderName(): string;

  /**
   * Maximum context window in tokens for this model.
   * Used by callers to truncate conversation history if needed.
   */
  getContextWindowSize(): number;
}
