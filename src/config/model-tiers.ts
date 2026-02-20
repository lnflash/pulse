/**
 * model-tiers.ts — AI model tier routing configuration.
 *
 * Maps model tiers to specific provider/model combos.
 * Adjust these to control cost vs. capability tradeoffs.
 */

import type { ModelTier } from '../core/agent/AgentConfig.js';

/** Configuration for a single model tier. */
export interface ModelTierConfig {
  /** Provider name */
  provider: 'anthropic' | 'google' | 'openai';
  /** Model ID */
  model: string;
  /** Default max tokens for this tier */
  defaultMaxTokens: number;
  /** Default temperature for this tier */
  defaultTemperature: number;
  /** Approximate cost per 1M input tokens in USD */
  costPer1MInputTokens: number;
  /** Approximate cost per 1M output tokens in USD */
  costPer1MOutputTokens: number;
  /** Human-readable description */
  description: string;
}

/**
 * Model tier routing table.
 *
 * fast     → Gemini Flash: very cheap, ~50ms latency, good for simple queries
 * balanced → Claude Sonnet: best price/performance, default for most interactions
 * powerful → Claude Opus: highest capability, for complex multi-step reasoning
 */
export const MODEL_TIERS: Record<ModelTier, ModelTierConfig> = {
  fast: {
    provider: 'google',
    model: 'gemini-1.5-flash',
    defaultMaxTokens: 2048,
    defaultTemperature: 0.5,
    costPer1MInputTokens: 0.075,
    costPer1MOutputTokens: 0.30,
    description: 'Fast and cheap — Gemini Flash. For simple queries, FAQs, balance checks.',
  },
  balanced: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    defaultMaxTokens: 4096,
    defaultTemperature: 0.7,
    costPer1MInputTokens: 3.00,
    costPer1MOutputTokens: 15.00,
    description: 'Best price/performance — Claude Sonnet. Default for most interactions.',
  },
  powerful: {
    provider: 'anthropic',
    model: 'claude-opus-4-5',
    defaultMaxTokens: 8192,
    defaultTemperature: 0.7,
    costPer1MInputTokens: 15.00,
    costPer1MOutputTokens: 75.00,
    description: 'Highest capability — Claude Opus. For complex disputes, multi-step planning.',
  },
};

/**
 * Select a model tier based on message characteristics.
 * Used by AgentOrchestrator for automatic routing.
 */
export function selectTier(options: {
  isFirstMessage: boolean;
  messageLength: number;
  hasToolResults: boolean;
  isEscalation: boolean;
}): ModelTier {
  if (options.isEscalation) return 'powerful';
  if (options.isFirstMessage || options.messageLength < 50) return 'fast';
  return 'balanced';
}
