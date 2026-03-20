/**
 * UserContext — the complete runtime model of a Pulse user.
 *
 * This schema is the single source of truth for what we know about a user
 * at any point in the conversation. It is persisted via ContextStorePort
 * and hydrated into every AgentLoop invocation.
 *
 * All sections are optional (with defaults) to support progressive hydration
 * as we learn more about the user over time.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

/** Identity section — who is this person? */
export const IdentitySchema = z.object({
  /** SHA-256 hash of the E.164 phone number — our primary key */
  phoneHash: z.string(),
  /** E.164 format phone number, e.g. +18765551234 */
  phoneNumber: z.string().optional(),
  /** Flash username if the account is linked */
  flashUsername: z.string().optional(),
  /** Flash account UUID */
  flashAccountId: z.string().optional(),
  /** Whether the WhatsApp account has been linked to a Flash account */
  accountLinked: z.boolean().default(false),
  /** KYC verification tier: 0=none, 1=basic, 2=full */
  kycTier: z.number().int().min(0).max(2).default(0),
  /** ISO 3166-1 alpha-2 country code, e.g. 'JM', 'TT', 'BB' */
  countryCode: z.string().length(2).optional(),
  /** User's preferred display name */
  displayName: z.string().optional(),
  /** User's timezone, e.g. 'America/Jamaica' */
  timezone: z.string().optional(),
  /**
   * Flash API Bearer token for this user session.
   * Obtained during OTP verification and used by wallet tools.
   * Stored in context so it can be injected into WalletPort per-request.
   */
  authToken: z.string().optional(),
});

/** Language and dialect understanding */
export const UnderstandingSchema = z.object({
  /** Primary language, e.g. 'en', 'es', 'fr' */
  primaryLanguage: z.string().default('en'),
  /** Detected dialect identifier, e.g. 'jamaican-patois', 'trinidadian-creole' */
  dialect: z.string().optional(),
  /** Confidence score for dialect detection (0.0–1.0) */
  dialectConfidence: z.number().min(0).max(1).optional(),
  /** User's preferred currency for display, e.g. 'JMD', 'USD', 'TTD' */
  preferredCurrency: z.string().default('USD'),
  /** Preferred amount format: 'symbol' ($12.50) or 'word' (12 dollars 50 cents) */
  amountFormat: z.enum(['symbol', 'word']).default('symbol'),
  /** Whether the user prefers voice responses */
  prefersVoice: z.boolean().default(false),
  /** Literacy indicators for adapting response complexity */
  literacyIndicators: z.object({
    usesEmoji: z.boolean().default(false),
    averageMessageLength: z.number().default(0),
    usesFormatting: z.boolean().default(false),
  }).default({}),
});

/** Cached wallet/financial state */
export const FinancialSchema = z.object({
  /** Cached balance (may be stale — always verify before showing to user) */
  cachedBalanceSats: z.number().optional(),
  /** When the cached balance was last refreshed */
  balanceCachedAt: z.date().optional(),
  /** ISO 4217 code of the user's home fiat currency */
  homeCurrency: z.string().default('USD'),
  /** Whether this user is a merchant */
  isMerchant: z.boolean().default(false),
  /** Merchant-specific details, present if isMerchant === true */
  merchantDetails: z.object({
    businessName: z.string(),
    merchantId: z.string(),
    defaultInvoiceExpirySecs: z.number().default(3600),
  }).optional(),
  /** Saved contacts for quick payments */
  savedContacts: z.array(z.object({
    alias: z.string(),
    flashUsername: z.string().optional(),
    phoneNumber: z.string().optional(),
    lightningAddress: z.string().optional(),
    lastPaidAt: z.date().optional(),
  })).default([]),
});

/** Behavioral patterns learned from interactions */
export const PatternsSchema = z.object({
  /** Total number of conversations with this user */
  conversationCount: z.number().int().min(0).default(0),
  /** Total number of successful payment transactions */
  paymentCount: z.number().int().min(0).default(0),
  /** When the user first interacted with Pulse */
  firstSeenAt: z.date().optional(),
  /** When the user last interacted */
  lastSeenAt: z.date().optional(),
  /** Most common payment amounts (in satoshis) */
  commonAmounts: z.array(z.number()).default([]),
  /** Most frequent payment recipients (Flash usernames or phone hashes) */
  frequentRecipients: z.array(z.string()).default([]),
  /** Feature flags — which features has the user successfully used */
  usedFeatures: z.array(z.string()).default([]),
  /** Onboarding steps completed */
  onboardingSteps: z.array(z.string()).default([]),
});

/** Current session / in-flight state */
export const SessionSchema = z.object({
  /** Unique session ID, reset each time the user starts a new conversation */
  sessionId: z.string().optional(),
  /** When the current session started */
  sessionStartedAt: z.date().optional(),
  /** Current step in a multi-turn flow (e.g. 'awaiting_amount', 'confirming_payment') */
  currentStep: z.string().optional(),
  /** Structured state for the current multi-turn flow */
  flowState: z.record(z.unknown()).optional(),
  /** Name of the active flow, e.g. 'send_payment', 'onboarding', 'kyc' */
  activeFlow: z.string().optional(),
  /** Number of consecutive failed or confused turns in this session */
  confusedTurns: z.number().int().min(0).default(0),
  /** Whether this session has been escalated to a human agent */
  escalated: z.boolean().default(false),
  /** Conversation message count this session */
  messageCount: z.number().int().min(0).default(0),
});

/** Safety and compliance guidelines applied to this user */
export const GuidelinesSchema = z.object({
  /** Whether the user is in a restricted jurisdiction */
  restrictedJurisdiction: z.boolean().default(false),
  /** Whether high-value transaction confirmations are required */
  requireConfirmationAboveSats: z.number().optional(),
  /** Whether the user is on a watchlist (triggers enhanced monitoring) */
  enhancedMonitoring: z.boolean().default(false),
  /** Custom compliance notes (internal use) */
  complianceNotes: z.array(z.string()).default([]),
  /** Whether the user has accepted the terms of service */
  tosAccepted: z.boolean().default(false),
  /** Timestamp when ToS was accepted */
  tosAcceptedAt: z.date().optional(),
  /** Rate limit tier for this user */
  rateLimitTier: z.enum(['standard', 'trusted', 'restricted']).default('standard'),
});

/** Metadata about the context record itself */
export const MetaSchema = z.object({
  /** Schema version for migration compatibility */
  schemaVersion: z.string().default('5.0.0'),
  /** When this context was first created */
  createdAt: z.date().default(() => new Date()),
  /** When this context was last updated */
  updatedAt: z.date().default(() => new Date()),
  /** Source that created this record: 'whatsapp', 'api', 'migration', etc. */
  source: z.string().default('whatsapp'),
  /** Whether this is a test/sandbox context */
  isSandbox: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Root UserContext schema
// ---------------------------------------------------------------------------

/**
 * UserContext — complete user model persisted across sessions.
 *
 * Use `UserContextSchema.parse()` to validate and hydrate with defaults.
 * Use `createDefaultContext()` to bootstrap a new user record.
 */
export const UserContextSchema = z.object({
  /** Core user identity */
  identity: IdentitySchema,
  /** Language and communication preferences */
  understanding: UnderstandingSchema.default({}),
  /** Financial state and cached wallet data */
  financial: FinancialSchema.default({}),
  /** Behavioral patterns and usage history */
  patterns: PatternsSchema.default({}),
  /** Current session state */
  session: SessionSchema.default({}),
  /** Safety and compliance guidelines */
  guidelines: GuidelinesSchema.default({}),
  /** Context record metadata */
  meta: MetaSchema.default({}),
});

// ---------------------------------------------------------------------------
// TypeScript types (inferred from Zod schemas)
// ---------------------------------------------------------------------------

export type Identity = z.infer<typeof IdentitySchema>;
export type Understanding = z.infer<typeof UnderstandingSchema>;
export type Financial = z.infer<typeof FinancialSchema>;
export type Patterns = z.infer<typeof PatternsSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type Guidelines = z.infer<typeof GuidelinesSchema>;
export type Meta = z.infer<typeof MetaSchema>;

/** The complete UserContext type. */
export type UserContext = z.infer<typeof UserContextSchema>;

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/** Partial identity input accepted by createDefaultContext. */
export type PartialIdentityInput = {
  phoneHash: string;
  phoneNumber?: string;
  countryCode?: string;
  displayName?: string;
  timezone?: string;
  flashUsername?: string;
  flashAccountId?: string;
  accountLinked?: boolean;
  kycTier?: 0 | 1 | 2;
  authToken?: string;
};

/**
 * Create a fresh UserContext for a new user with safe defaults.
 * @param phoneHash SHA-256 hash of the user's E.164 phone number
 * @param partial Optional fields to override defaults
 */
export function createDefaultContext(
  phoneHash: string,
  partial?: {
    identity?: PartialIdentityInput;
    understanding?: Partial<Understanding>;
  },
): UserContext {
  return UserContextSchema.parse({
    identity: {
      phoneHash,
      accountLinked: false,
      kycTier: 0,
      ...partial?.identity,
    },
    understanding: partial?.understanding ?? {},
    financial: {},
    patterns: {
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
    session: {
      sessionStartedAt: new Date(),
    },
    guidelines: {},
    meta: {
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

/**
 * Merge a patch into an existing UserContext, returning a new object.
 * Automatically updates `meta.updatedAt`.
 * @param context Existing UserContext
 * @param patch Partial context to merge in
 */
export function patchContext(
  context: UserContext,
  patch: Partial<UserContext>,
): UserContext {
  const merged: UserContext = {
    ...context,
    ...patch,
    identity: { ...context.identity, ...patch.identity },
    understanding: { ...context.understanding, ...patch.understanding },
    financial: { ...context.financial, ...patch.financial },
    patterns: { ...context.patterns, ...patch.patterns },
    session: { ...context.session, ...patch.session },
    guidelines: { ...context.guidelines, ...patch.guidelines },
    meta: {
      ...context.meta,
      ...patch.meta,
      updatedAt: new Date(),
    },
  };
  return UserContextSchema.parse(merged);
}
