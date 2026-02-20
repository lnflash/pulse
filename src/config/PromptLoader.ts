/**
 * PromptLoader — loads, caches, and composes system/capability prompt files.
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { UserContext } from '../core/context/UserContext.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROMPTS_DIR = join(__dirname, '..', 'prompts');

// ---------------------------------------------------------------------------
// Prompt name constants — avoids magic strings across the codebase
// ---------------------------------------------------------------------------

export const PROMPT_NAMES = {
  // System
  BASE_AGENT: 'system/base-agent',
  SAFETY_RAILS: 'system/safety-rails',
  DIALECT_AWARENESS: 'system/dialect-awareness',

  // Capabilities
  PERSONAL_AGENT: 'capabilities/personal-agent',
  MERCHANT_AGENT: 'capabilities/merchant-agent',
  ONBOARDING: 'capabilities/onboarding',
  CORRIDOR_AGENT: 'capabilities/corridor-agent',

  // Features
  SMART_SUGGESTIONS: 'features/smart-suggestions',
  RECURRING_PAYMENTS: 'features/recurring-payments',
  SPENDING_SUMMARY: 'features/spending-summary',
  BILL_SPLITTING: 'features/bill-splitting',
} as const;

export type PromptName = (typeof PROMPT_NAMES)[keyof typeof PROMPT_NAMES];

// ---------------------------------------------------------------------------
// Compose options
// ---------------------------------------------------------------------------

/**
 * Options controlling which prompt layers are composed.
 * All flags default to auto-detection from UserContext when not specified.
 */
export interface ComposeOptions {
  /** Override: include the dialect awareness layer */
  includeDialect?: boolean;
  /** Override: include the smart suggestions layer */
  includeSmartSuggestions?: boolean;
  /** Override: include the bill splitting layer */
  includeBillSplitting?: boolean;
  /** Override: include the spending summary layer */
  includeSpendingSummary?: boolean;
  /** Override: include the recurring payments layer */
  includeRecurringPayments?: boolean;
}

// ---------------------------------------------------------------------------
// PromptLoader
// ---------------------------------------------------------------------------

/**
 * PromptLoader — reads Markdown prompt files from src/prompts/.
 *
 * Responsibilities:
 * 1. Load .md files from the prompts directory
 * 2. Cache loaded prompts in memory (LRU via Map insertion order)
 * 3. Compose a full system prompt from layers based on UserContext
 */
export class PromptLoader {
  private readonly cache: Map<string, string> = new Map();

  /**
   * Load a prompt file by its relative path (without extension).
   * Results are cached in memory for the lifetime of this instance.
   *
   * @param name Prompt path relative to src/prompts/, e.g. 'system/base-agent'
   * @returns The prompt file contents, or empty string if not found.
   */
  async load(name: string): Promise<string> {
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    const filePath = join(PROMPTS_DIR, `${name}.md`);

    try {
      const content = await readFile(filePath, 'utf-8');
      this.cache.set(name, content);
      logger.debug({ name, filePath }, 'Prompt loaded and cached');
      return content;
    } catch (err) {
      logger.warn({ name, filePath, err }, 'Prompt file not found — returning empty string');
      return '';
    }
  }

  /**
   * Compose a full system prompt from layers based on the user's context.
   *
   * Layer order:
   *   1. Base agent identity (always included)
   *   2. Safety rails (always included)
   *   3. Dialect awareness (if user has a detected dialect)
   *   4. Capability layer (onboarding | merchant-agent | personal-agent)
   *   5. Feature layer(s) (smart suggestions, bill splitting, etc.)
   *
   * @param context The current user's context
   * @param options Optional overrides for which layers to include
   * @returns Composed system prompt string
   */
  async compose(context: UserContext, options: ComposeOptions = {}): Promise<string> {
    const layers: string[] = [];

    // -- Layer 1: Base agent (always) --
    const base = await this.load(PROMPT_NAMES.BASE_AGENT);
    if (base) layers.push(base);

    // -- Layer 2: Safety rails (always) --
    const safety = await this.load(PROMPT_NAMES.SAFETY_RAILS);
    if (safety) layers.push(safety);

    // -- Layer 3: Dialect awareness (conditional) --
    const includeDialect =
      options.includeDialect ?? !!context.understanding.dialect;
    if (includeDialect) {
      const dialect = await this.load(PROMPT_NAMES.DIALECT_AWARENESS);
      if (dialect) layers.push(dialect);
    }

    // -- Layer 4: Capability layer (mutually exclusive) --
    const capabilityPrompt = await this.selectCapabilityPrompt(context);
    if (capabilityPrompt) layers.push(capabilityPrompt);

    // -- Layer 5: Feature layers (additive, based on flags and context) --
    const featureLayers = await this.selectFeatureLayers(context, options);
    layers.push(...featureLayers);

    logger.debug(
      {
        phoneHash: context.identity.phoneHash,
        layerCount: layers.length,
        includeDialect,
        isMerchant: context.financial.isMerchant,
        accountLinked: context.identity.accountLinked,
      },
      'Prompt composed',
    );

    return layers.filter(Boolean).join('\n\n---\n\n');
  }

  /**
   * Select the appropriate capability prompt based on the user's account state.
   *
   * Priority:
   *   - Not linked → onboarding
   *   - Merchant → merchant-agent
   *   - Standard user → personal-agent
   */
  private async selectCapabilityPrompt(context: UserContext): Promise<string> {
    if (!context.identity.accountLinked) {
      return this.load(PROMPT_NAMES.ONBOARDING);
    }

    if (context.financial.isMerchant) {
      return this.load(PROMPT_NAMES.MERCHANT_AGENT);
    }

    return this.load(PROMPT_NAMES.PERSONAL_AGENT);
  }

  /**
   * Select feature prompt layers based on user context and feature flags.
   *
   * Only include feature layers when:
   *   1. The feature flag is enabled in the context/config
   *   2. The user's account is linked (features require authentication)
   */
  private async selectFeatureLayers(
    context: UserContext,
    options: ComposeOptions,
  ): Promise<string[]> {
    // Features are not available to unlinked users
    if (!context.identity.accountLinked) {
      return [];
    }

    const layers: Promise<string>[] = [];
    const usedFeatures = context.patterns.usedFeatures ?? [];

    // Smart suggestions (when context shows patterns and flag is on)
    const includeSmartSuggestions =
      options.includeSmartSuggestions ??
      (context.patterns.paymentCount >= 3 && usedFeatures.includes('smart-suggestions'));
    if (includeSmartSuggestions) {
      layers.push(this.load(PROMPT_NAMES.SMART_SUGGESTIONS));
    }

    // Bill splitting (when user has used it or it's active in session)
    const includeBillSplitting =
      options.includeBillSplitting ??
      (usedFeatures.includes('bill-splitting') ||
        context.session.activeFlow === 'bill-split');
    if (includeBillSplitting) {
      layers.push(this.load(PROMPT_NAMES.BILL_SPLITTING));
    }

    // Spending summary (when user has payment history to summarize)
    const includeSpendingSummary =
      options.includeSpendingSummary ??
      (context.patterns.paymentCount >= 5 && usedFeatures.includes('spending-summary'));
    if (includeSpendingSummary) {
      layers.push(this.load(PROMPT_NAMES.SPENDING_SUMMARY));
    }

    // Recurring payments (when user has used the feature)
    const includeRecurringPayments =
      options.includeRecurringPayments ??
      usedFeatures.includes('recurring-payments');
    if (includeRecurringPayments) {
      layers.push(this.load(PROMPT_NAMES.RECURRING_PAYMENTS));
    }

    const results = await Promise.all(layers);
    return results.filter(Boolean);
  }

  /**
   * Clear the prompt cache.
   * Useful in tests or after hot-reloading prompts in development.
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Prompt cache cleared');
  }

  /**
   * Pre-warm the cache by loading a set of prompts at startup.
   * Call this during application initialization to avoid cold-start latency.
   *
   * @param names Array of prompt names to pre-load (defaults to all core prompts)
   */
  async warmCache(names?: string[]): Promise<void> {
    const targets = names ?? [
      PROMPT_NAMES.BASE_AGENT,
      PROMPT_NAMES.SAFETY_RAILS,
      PROMPT_NAMES.DIALECT_AWARENESS,
      PROMPT_NAMES.PERSONAL_AGENT,
      PROMPT_NAMES.MERCHANT_AGENT,
      PROMPT_NAMES.ONBOARDING,
    ];

    await Promise.all(targets.map((name) => this.load(name)));
    logger.info({ count: targets.length }, 'Prompt cache warmed');
  }

  /**
   * Return the list of prompt names currently held in cache.
   * Useful for diagnostics and health checks.
   */
  cachedKeys(): string[] {
    return Array.from(this.cache.keys());
  }
}
