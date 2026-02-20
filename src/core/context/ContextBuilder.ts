/**
 * ContextBuilder — fluent builder for constructing UserContext in tests and onboarding flows.
 * SystemPromptBuilder — composes system prompts from templates and live UserContext.
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { type UserContext, UserContextSchema, createDefaultContext } from './UserContext.js';
import { logger } from '../../config/logger.js';

// ---------------------------------------------------------------------------
// Fluent UserContext builder (used in tests and onboarding flows)
// ---------------------------------------------------------------------------

/**
 * Fluent builder for UserContext.
 *
 * Useful in tests and onboarding flows where you need to construct
 * a context with specific fields set.
 *
 * ```typescript
 * const ctx = new ContextBuilder('sha256hash...')
 *   .withLinkedAccount('alice', 'acc-123')
 *   .withMerchant('Alice\'s Shop', 'merchant-456')
 *   .withCountry('JM')
 *   .build();
 * ```
 */
export class ContextBuilder {
  private context: UserContext;

  constructor(phoneHash: string, phoneNumber?: string) {
    this.context = createDefaultContext(phoneHash, {
      identity: { phoneHash, phoneNumber, accountLinked: false, kycTier: 0 },
    });
  }

  /** Set the phone number. */
  withPhoneNumber(phoneNumber: string): this {
    this.context.identity.phoneNumber = phoneNumber;
    return this;
  }

  /** Mark the account as linked to a Flash account. */
  withLinkedAccount(username: string, accountId: string): this {
    this.context.identity.accountLinked = true;
    this.context.identity.flashUsername = username;
    this.context.identity.flashAccountId = accountId;
    return this;
  }

  /** Set the KYC tier. */
  withKycTier(tier: 0 | 1 | 2): this {
    this.context.identity.kycTier = tier;
    return this;
  }

  /** Set the country code. */
  withCountry(countryCode: string): this {
    this.context.identity.countryCode = countryCode;
    return this;
  }

  /** Set the preferred currency. */
  withPreferredCurrency(currency: string): this {
    this.context.understanding.preferredCurrency = currency;
    return this;
  }

  /** Set the dialect. */
  withDialect(dialect: string, confidence?: number): this {
    this.context.understanding.dialect = dialect;
    if (confidence !== undefined) {
      this.context.understanding.dialectConfidence = confidence;
    }
    return this;
  }

  /** Mark the user as a merchant. */
  withMerchant(businessName: string, merchantId: string): this {
    this.context.financial.isMerchant = true;
    this.context.financial.merchantDetails = {
      businessName,
      merchantId,
      defaultInvoiceExpirySecs: 3600,
    };
    return this;
  }

  /** Set the display name. */
  withDisplayName(name: string): this {
    this.context.identity.displayName = name;
    return this;
  }

  /** Set whether the user is in a sandbox environment. */
  withSandbox(isSandbox: boolean): this {
    this.context.meta.isSandbox = isSandbox;
    return this;
  }

  /** Build and validate the final UserContext. */
  build(): UserContext {
    return UserContextSchema.parse(this.context);
  }
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/** Absolute path to src/prompts/ from the compiled output location. */
const PROMPTS_DIR = join(__dirname, '../../prompts');

/**
 * Derive a simple tech-comfort label from literacy indicators.
 * @internal
 */
function deriveTechComfort(context: UserContext): 'low' | 'medium' | 'high' {
  const avg = context.understanding.literacyIndicators.averageMessageLength;
  if (avg > 60) return 'high';
  if (avg > 20) return 'medium';
  return 'low';
}

/**
 * Derive a communication-style label from understanding preferences.
 * @internal
 */
function deriveCommunicationStyle(context: UserContext): string {
  if (context.understanding.prefersVoice) return 'voice';
  if (context.understanding.literacyIndicators.usesFormatting) return 'detailed';
  if (context.understanding.amountFormat === 'word') return 'plain-language';
  return 'brief';
}

/**
 * Determine which account type label to use in the context injection.
 * @internal
 */
function deriveAccountType(context: UserContext): string {
  if (!context.identity.accountLinked) return 'unlinked';
  if (context.financial.isMerchant) return 'merchant';
  return 'personal';
}

/**
 * Select the capability prompt file based on the user's account state.
 * @internal
 */
function selectCapabilityPrompt(context: UserContext): string {
  if (!context.identity.accountLinked) return 'capabilities/onboarding';
  if (context.financial.isMerchant) return 'capabilities/merchant-agent';
  return 'capabilities/personal-agent';
}

/**
 * SystemPromptBuilder — composes a full system prompt from Markdown templates
 * and live UserContext data.
 *
 * Prompt composition order:
 *   1. system/base-agent.md       — core persona and capabilities
 *   2. system/safety-rails.md     — non-negotiable financial safety rules
 *   3. system/dialect-awareness.md — Caribbean language guidance
 *   4. capabilities/{type}.md     — role-specific behaviour (personal/merchant/onboarding)
 *   5. User context injection     — structured "who you're talking to" section
 *
 * Templates are cached in memory after first load.
 *
 * ```typescript
 * const builder = new SystemPromptBuilder();
 * const systemPrompt = await builder.build(userContext);
 * ```
 */
export class SystemPromptBuilder {
  private readonly cache: Map<string, string> = new Map();

  // ---------------------------------------------------------------------------
  // Template loading
  // ---------------------------------------------------------------------------

  /**
   * Load a prompt template by name (relative to src/prompts/, without `.md`).
   * Returns an empty string if the file is not found (graceful degradation).
   */
  private async loadTemplate(name: string): Promise<string> {
    if (this.cache.has(name)) return this.cache.get(name)!;
    const filePath = join(PROMPTS_DIR, `${name}.md`);
    try {
      const content = await readFile(filePath, 'utf-8');
      this.cache.set(name, content);
      logger.debug({ name, filePath }, 'SystemPromptBuilder: template loaded');
      return content;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn({ name, filePath, error }, 'SystemPromptBuilder: template not found');
      this.cache.set(name, '');
      return '';
    }
  }

  /** Clear the template cache (useful after hot-reloading prompts). */
  clearCache(): void {
    this.cache.clear();
  }

  // ---------------------------------------------------------------------------
  // User context injection
  // ---------------------------------------------------------------------------

  /**
   * Build the "## Who You're Talking To" section from the UserContext.
   *
   * This is injected at the end of the system prompt so the agent knows
   * who it's serving and can adapt its behaviour accordingly.
   */
  buildContextSection(context: UserContext): string {
    const lines: string[] = ['## Who You\'re Talking To'];

    const accountType = deriveAccountType(context);
    const dialect = context.understanding.dialect ?? 'standard English';
    lines.push(`- ${accountType} user, speaks ${dialect}`);

    const techComfort = deriveTechComfort(context);
    const communicationStyle = deriveCommunicationStyle(context);
    lines.push(`- Tech comfort: ${techComfort}, prefers ${communicationStyle} responses`);

    lines.push(`- Preferred currency: ${context.understanding.preferredCurrency}`);

    if (context.identity.displayName) {
      lines.push(`- Name: ${context.identity.displayName}`);
    }

    if (context.identity.countryCode) {
      lines.push(`- Country: ${context.identity.countryCode}`);
    }

    if (context.identity.timezone) {
      lines.push(`- Timezone: ${context.identity.timezone}`);
    }

    if (context.identity.accountLinked && context.identity.flashUsername) {
      lines.push(`- Flash username: @${context.identity.flashUsername}`);
    }

    if (context.identity.kycTier > 0) {
      lines.push(`- KYC tier: ${context.identity.kycTier}`);
    }

    if (context.financial.isMerchant && context.financial.merchantDetails) {
      lines.push(`- Business: ${context.financial.merchantDetails.businessName}`);
    }

    if (context.patterns.conversationCount > 0) {
      lines.push(`- Conversations to date: ${context.patterns.conversationCount}`);
    }

    if (context.patterns.paymentCount > 0) {
      lines.push(`- Payments completed: ${context.patterns.paymentCount}`);
    }

    if (context.understanding.dialectConfidence !== undefined) {
      const pct = Math.round(context.understanding.dialectConfidence * 100);
      lines.push(`- Dialect confidence: ${pct}%`);
    }

    // Compliance flags
    if (context.guidelines.restrictedJurisdiction) {
      lines.push(`- ⚠️ Restricted jurisdiction — apply enhanced compliance checks`);
    }

    if (context.guidelines.enhancedMonitoring) {
      lines.push(`- ⚠️ Enhanced monitoring active — escalate on AML red flags`);
    }

    if (context.guidelines.requireConfirmationAboveSats !== undefined) {
      lines.push(
        `- Requires confirmation for transactions above ${context.guidelines.requireConfirmationAboveSats} sats`,
      );
    }

    if (context.guidelines.rateLimitTier !== 'standard') {
      lines.push(`- Rate limit tier: ${context.guidelines.rateLimitTier}`);
    }

    if (context.meta.isSandbox) {
      lines.push(`- 🧪 Sandbox mode — no real transactions will be executed`);
    }

    // Active flow hint
    if (context.session.activeFlow) {
      lines.push(`- Active flow: ${context.session.activeFlow}`);
    }

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Main build method
  // ---------------------------------------------------------------------------

  /**
   * Compose the full system prompt for a given UserContext.
   *
   * @param context The hydrated UserContext for the current user.
   * @returns A single concatenated system prompt string.
   */
  async build(context: UserContext): Promise<string> {
    const capabilityPromptName = selectCapabilityPrompt(context);

    const [base, safety, dialectAwareness, capability] = await Promise.all([
      this.loadTemplate('system/base-agent'),
      this.loadTemplate('system/safety-rails'),
      this.loadTemplate('system/dialect-awareness'),
      this.loadTemplate(capabilityPromptName),
    ]);

    const contextSection = this.buildContextSection(context);

    const sections = [base, safety, dialectAwareness, capability, contextSection].filter(
      (s) => s.trim().length > 0,
    );

    logger.debug(
      {
        phoneHash: context.identity.phoneHash,
        capability: capabilityPromptName,
        sectionCount: sections.length,
      },
      'SystemPromptBuilder: prompt built',
    );

    return sections.join('\n\n---\n\n');
  }
}
