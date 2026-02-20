/**
 * AgentConfig — runtime configuration for an AgentLoop instance.
 */

import type { UserContext } from '../context/UserContext.js';

/** Model tier for routing to different AI models based on cost/capability tradeoff. */
export type ModelTier = 'fast' | 'balanced' | 'powerful';

/**
 * Configuration for a single AgentLoop execution.
 * Created fresh for each incoming message.
 */
export interface AgentConfig {
  /**
   * Maximum number of tool-call rounds before the loop terminates.
   * Prevents infinite loops. Default: 10.
   */
  maxIterations: number;

  /**
   * Which model tier to use for this interaction.
   * 'fast'     → cheap, low-latency (Gemini Flash, Claude Haiku)
   * 'balanced' → default for most interactions (Claude Sonnet)
   * 'powerful' → complex queries, high-stakes decisions (Claude Opus)
   */
  modelTier: ModelTier;

  /**
   * Maximum tokens for the AI completion.
   * Default varies by model tier.
   */
  maxTokens?: number;

  /**
   * Sampling temperature for the AI.
   * Lower = more deterministic. Default: 0.7.
   */
  temperature?: number;

  /**
   * System prompt to inject at the start of every conversation.
   * If not provided, the agent uses the default base-agent prompt.
   */
  systemPrompt?: string;

  /**
   * Whether to enable voice response generation.
   * Only used when the incoming message was a voice message.
   */
  enableVoiceResponse: boolean;

  /**
   * Whether to require explicit confirmation before executing
   * any tool marked as requiresConfirmation === true.
   */
  requireToolConfirmations: boolean;

  /**
   * Timeout in milliseconds for a single AgentLoop execution.
   * The loop will abort and return a graceful error if exceeded.
   * Default: 30000 (30 seconds).
   */
  timeoutMs: number;

  /**
   * User context for this interaction.
   * Hydrated from the ContextStore before the loop starts.
   */
  userContext: UserContext;
}

/**
 * Default AgentConfig factory.
 * @param userContext The hydrated user context for this request.
 * @param overrides Optional config overrides.
 */
export function createDefaultAgentConfig(
  userContext: UserContext,
  overrides?: Partial<Omit<AgentConfig, 'userContext'>>,
): AgentConfig {
  return {
    maxIterations: 10,
    modelTier: 'balanced',
    enableVoiceResponse: false,
    requireToolConfirmations: true,
    timeoutMs: 30_000,
    temperature: 0.7,
    ...overrides,
    userContext,
  };
}
