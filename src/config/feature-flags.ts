/**
 * feature-flags.ts — runtime feature flag configuration.
 *
 * Used to gradually roll out features without code deployments.
 * In production, these should be backed by a remote config service (LaunchDarkly, etc.).
 * For now, they read from environment variables.
 */

import { config } from './app.config.js';

/** Feature flag names. */
export type FeatureFlag =
  | 'voice_messages'
  | 'merchant_tools'
  | 'discovery_tools'
  | 'sandbox_mode'
  | 'dialect_normalization'
  | 'confirmation_gate'
  | 'auto_kyc_prompt'
  | 'multi_language';

/** Current state of all feature flags. */
export interface FeatureFlags {
  /** Enable voice message transcription and TTS responses */
  voice_messages: boolean;
  /** Enable merchant-specific tools (CreateInvoice, GetDailySummary, etc.) */
  merchant_tools: boolean;
  /** Enable agent discovery and corridor routing tools */
  discovery_tools: boolean;
  /** Run in sandbox mode — no real transactions */
  sandbox_mode: boolean;
  /** Enable Patois/Creole dialect normalization */
  dialect_normalization: boolean;
  /** Require explicit confirmation before irreversible tool calls */
  confirmation_gate: boolean;
  /** Automatically prompt users to complete KYC when hitting limits */
  auto_kyc_prompt: boolean;
  /** Enable multi-language support (Spanish, French Creole) */
  multi_language: boolean;
}

/**
 * Load feature flags from environment config.
 * Extend this function to check a remote config service.
 */
export function loadFeatureFlags(): FeatureFlags {
  return {
    voice_messages: config.ENABLE_VOICE,
    merchant_tools: config.ENABLE_MERCHANT_TOOLS,
    discovery_tools: config.ENABLE_DISCOVERY,
    sandbox_mode: config.SANDBOX_MODE,
    dialect_normalization: true, // Always on
    confirmation_gate: true, // Always on — safety critical
    auto_kyc_prompt: true,
    multi_language: false, // Week 7
  };
}

/** Active feature flags for this process. */
export const flags = loadFeatureFlags();

/**
 * Check if a specific feature flag is enabled.
 * @param flag Feature flag name.
 */
export function isEnabled(flag: FeatureFlag): boolean {
  return flags[flag];
}
