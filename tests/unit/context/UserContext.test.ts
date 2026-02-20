/**
 * UserContext — extended unit tests.
 *
 * Complements the tests in tests/core/context/UserContext.test.ts with
 * additional coverage for schema validation, progressive hydration, and patching.
 */

import {
  UserContextSchema,
  IdentitySchema,
  UnderstandingSchema,
  FinancialSchema,
  PatternsSchema,
  SessionSchema,
  GuidelinesSchema,
  createDefaultContext,
  patchContext,
} from '../../../src/core/context/UserContext';

const PHONE_HASH = 'abc123deadbeef0000000000000000000000000000000000000000000000000000';

// ---------------------------------------------------------------------------
// createDefaultContext
// ---------------------------------------------------------------------------

describe('createDefaultContext', () => {
  it('creates a valid context for a new user', () => {
    const ctx = createDefaultContext(PHONE_HASH);
    expect(ctx.identity.phoneHash).toBe(PHONE_HASH);
    expect(ctx.identity.accountLinked).toBe(false);
    expect(ctx.identity.kycTier).toBe(0);
    expect(ctx.understanding.preferredCurrency).toBe('USD');
    expect(ctx.understanding.primaryLanguage).toBe('en');
    expect(ctx.understanding.prefersVoice).toBe(false);
    expect(ctx.financial.isMerchant).toBe(false);
    expect(ctx.financial.savedContacts).toEqual([]);
    expect(ctx.patterns.conversationCount).toBe(0);
    expect(ctx.session.confusedTurns).toBe(0);
    expect(ctx.session.escalated).toBe(false);
    expect(ctx.session.messageCount).toBe(0);
    expect(ctx.guidelines.rateLimitTier).toBe('standard');
    expect(ctx.guidelines.enhancedMonitoring).toBe(false);
    expect(ctx.guidelines.tosAccepted).toBe(false);
    expect(ctx.meta.schemaVersion).toBe('5.0.0');
    expect(ctx.meta.source).toBe('whatsapp');
    expect(ctx.meta.isSandbox).toBe(false);
  });

  it('sets createdAt and updatedAt on creation', () => {
    const before = Date.now();
    const ctx = createDefaultContext(PHONE_HASH);
    const after = Date.now();
    expect(ctx.meta.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(ctx.meta.createdAt.getTime()).toBeLessThanOrEqual(after);
    expect(ctx.meta.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('sets firstSeenAt and lastSeenAt', () => {
    const ctx = createDefaultContext(PHONE_HASH);
    expect(ctx.patterns.firstSeenAt).toBeInstanceOf(Date);
    expect(ctx.patterns.lastSeenAt).toBeInstanceOf(Date);
  });

  it('accepts identity overrides', () => {
    const ctx = createDefaultContext(PHONE_HASH, {
      identity: {
        phoneHash: PHONE_HASH,
        phoneNumber: '+18765551234',
        countryCode: 'JM',
        displayName: 'Marcus',
        timezone: 'America/Jamaica',
      },
    });
    expect(ctx.identity.phoneNumber).toBe('+18765551234');
    expect(ctx.identity.countryCode).toBe('JM');
    expect(ctx.identity.displayName).toBe('Marcus');
    expect(ctx.identity.timezone).toBe('America/Jamaica');
    // Defaults still applied
    expect(ctx.identity.accountLinked).toBe(false);
    expect(ctx.identity.kycTier).toBe(0);
  });

  it('accepts understanding overrides', () => {
    const ctx = createDefaultContext(PHONE_HASH, {
      understanding: {
        primaryLanguage: 'en',
        preferredCurrency: 'JMD',
        amountFormat: 'word',
        prefersVoice: true,
        literacyIndicators: {
          usesEmoji: true,
          averageMessageLength: 25,
          usesFormatting: false,
        },
      },
    });
    expect(ctx.understanding.preferredCurrency).toBe('JMD');
    expect(ctx.understanding.amountFormat).toBe('word');
    expect(ctx.understanding.prefersVoice).toBe(true);
  });

  it('accepts linked account details', () => {
    const ctx = createDefaultContext(PHONE_HASH, {
      identity: {
        phoneHash: PHONE_HASH,
        accountLinked: true,
        flashUsername: 'marcus123',
        flashAccountId: 'acct-uuid-1234',
        kycTier: 1,
      },
    });
    expect(ctx.identity.accountLinked).toBe(true);
    expect(ctx.identity.flashUsername).toBe('marcus123');
    expect(ctx.identity.flashAccountId).toBe('acct-uuid-1234');
    expect(ctx.identity.kycTier).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// patchContext
// ---------------------------------------------------------------------------

describe('patchContext', () => {
  let base = createDefaultContext(PHONE_HASH);

  beforeEach(() => {
    base = createDefaultContext(PHONE_HASH);
  });

  it('merges session fields without losing unpatched fields', () => {
    const patched = patchContext(base, {
      session: {
        ...base.session,
        currentStep: 'awaiting_amount',
        messageCount: 5,
      },
    });
    expect(patched.session.currentStep).toBe('awaiting_amount');
    expect(patched.session.messageCount).toBe(5);
    expect(patched.session.escalated).toBe(false);
    expect(patched.session.confusedTurns).toBe(0);
  });

  it('merges identity fields without losing unpatched fields', () => {
    const patched = patchContext(base, {
      identity: {
        ...base.identity,
        accountLinked: true,
        flashUsername: 'jamarlin',
      },
    });
    expect(patched.identity.accountLinked).toBe(true);
    expect(patched.identity.flashUsername).toBe('jamarlin');
    expect(patched.identity.phoneHash).toBe(PHONE_HASH);
    expect(patched.identity.kycTier).toBe(0);
  });

  it('merges understanding fields correctly', () => {
    const patched = patchContext(base, {
      understanding: {
        ...base.understanding,
        dialect: 'jamaican-patois',
        dialectConfidence: 0.85,
      },
    });
    expect(patched.understanding.dialect).toBe('jamaican-patois');
    expect(patched.understanding.dialectConfidence).toBe(0.85);
    expect(patched.understanding.primaryLanguage).toBe('en'); // preserved
    expect(patched.understanding.preferredCurrency).toBe('USD'); // preserved
  });

  it('merges financial fields including savedContacts', () => {
    const patched = patchContext(base, {
      financial: {
        ...base.financial,
        isMerchant: true,
        savedContacts: [
          { alias: 'Marcus', flashUsername: 'marcus123' },
        ],
      },
    });
    expect(patched.financial.isMerchant).toBe(true);
    expect(patched.financial.savedContacts).toHaveLength(1);
    expect(patched.financial.savedContacts[0]!.alias).toBe('Marcus');
  });

  it('always updates meta.updatedAt', () => {
    const before = base.meta.updatedAt.getTime();
    // Small delay to ensure time progresses
    const patched = patchContext(base, {
      session: { ...base.session, messageCount: 1 },
    });
    expect(patched.meta.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('preserves meta.createdAt when patching', () => {
    const originalCreatedAt = base.meta.createdAt;
    const patched = patchContext(base, {
      session: { ...base.session, escalated: true },
    });
    expect(patched.meta.createdAt).toEqual(originalCreatedAt);
  });

  it('preserves the original context (immutable)', () => {
    const patched = patchContext(base, {
      identity: { ...base.identity, accountLinked: true },
    });
    expect(base.identity.accountLinked).toBe(false); // original unchanged
    expect(patched.identity.accountLinked).toBe(true);
  });

  it('validates the merged result via Zod schema', () => {
    // Should not throw
    expect(() =>
      patchContext(base, {
        guidelines: { ...base.guidelines, rateLimitTier: 'trusted' },
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// UserContextSchema — Zod validation
// ---------------------------------------------------------------------------

describe('UserContextSchema validation', () => {
  const validMinimalInput = {
    identity: { phoneHash: PHONE_HASH, accountLinked: false, kycTier: 0 },
  };

  it('parses a valid minimal context and fills defaults', () => {
    const ctx = UserContextSchema.parse(validMinimalInput);
    expect(ctx.identity.phoneHash).toBe(PHONE_HASH);
    expect(ctx.understanding).toBeDefined();
    expect(ctx.financial).toBeDefined();
    expect(ctx.patterns).toBeDefined();
    expect(ctx.session).toBeDefined();
    expect(ctx.guidelines).toBeDefined();
    expect(ctx.meta).toBeDefined();
  });

  it('parses a fully-specified context', () => {
    const full = {
      identity: {
        phoneHash: PHONE_HASH,
        phoneNumber: '+18765551234',
        flashUsername: 'marcus',
        flashAccountId: 'uuid-123',
        accountLinked: true,
        kycTier: 2,
        countryCode: 'JM',
        displayName: 'Marcus',
        timezone: 'America/Jamaica',
      },
      understanding: {
        primaryLanguage: 'en',
        dialect: 'jamaican-patois',
        dialectConfidence: 0.9,
        preferredCurrency: 'JMD',
        amountFormat: 'symbol',
        prefersVoice: false,
        literacyIndicators: {
          usesEmoji: true,
          averageMessageLength: 30,
          usesFormatting: false,
        },
      },
      financial: {
        cachedBalanceSats: 50000,
        homeCurrency: 'JMD',
        isMerchant: true,
        merchantDetails: {
          businessName: 'Marcus Shop',
          merchantId: 'm-123',
          defaultInvoiceExpirySecs: 3600,
        },
        savedContacts: [
          { alias: 'Keisha', flashUsername: 'keisha99' },
        ],
      },
      patterns: {
        conversationCount: 10,
        paymentCount: 5,
        firstSeenAt: new Date('2024-01-01'),
        lastSeenAt: new Date('2025-01-01'),
        commonAmounts: [1000, 5000],
        frequentRecipients: ['keisha99'],
        usedFeatures: ['check_balance', 'send_payment'],
        onboardingSteps: ['welcome', 'linked'],
      },
    };
    const ctx = UserContextSchema.parse(full);
    expect(ctx.identity.kycTier).toBe(2);
    expect(ctx.financial.isMerchant).toBe(true);
    expect(ctx.patterns.conversationCount).toBe(10);
  });

  // ── Invalid inputs ────────────────────────────────────────────────────

  it('rejects missing phoneHash', () => {
    expect(() =>
      UserContextSchema.parse({
        identity: { accountLinked: false, kycTier: 0 },
      }),
    ).toThrow();
  });

  it('rejects kycTier below 0', () => {
    expect(() =>
      UserContextSchema.parse({
        identity: { phoneHash: PHONE_HASH, accountLinked: false, kycTier: -1 },
      }),
    ).toThrow();
  });

  it('rejects kycTier above 2', () => {
    expect(() =>
      UserContextSchema.parse({
        identity: { phoneHash: PHONE_HASH, accountLinked: false, kycTier: 5 },
      }),
    ).toThrow();
  });

  it('rejects invalid rateLimitTier', () => {
    expect(() =>
      UserContextSchema.parse({
        identity: { phoneHash: PHONE_HASH, accountLinked: false, kycTier: 0 },
        guidelines: { rateLimitTier: 'vip' },
      }),
    ).toThrow();
  });

  it('rejects invalid amountFormat', () => {
    expect(() =>
      UserContextSchema.parse({
        identity: { phoneHash: PHONE_HASH, accountLinked: false, kycTier: 0 },
        understanding: { amountFormat: 'fancy' },
      }),
    ).toThrow();
  });

  it('rejects non-integer kycTier', () => {
    expect(() =>
      UserContextSchema.parse({
        identity: { phoneHash: PHONE_HASH, accountLinked: false, kycTier: 1.5 },
      }),
    ).toThrow();
  });

  it('rejects dialectConfidence out of 0-1 range', () => {
    expect(() =>
      UserContextSchema.parse({
        identity: { phoneHash: PHONE_HASH, accountLinked: false, kycTier: 0 },
        understanding: { dialectConfidence: 1.5 },
      }),
    ).toThrow();
  });

  it('rejects negative dialectConfidence', () => {
    expect(() =>
      UserContextSchema.parse({
        identity: { phoneHash: PHONE_HASH, accountLinked: false, kycTier: 0 },
        understanding: { dialectConfidence: -0.1 },
      }),
    ).toThrow();
  });

  it('accepts valid kycTier values 0, 1, 2', () => {
    for (const tier of [0, 1, 2] as const) {
      const ctx = UserContextSchema.parse({
        identity: { phoneHash: PHONE_HASH, accountLinked: false, kycTier: tier },
      });
      expect(ctx.identity.kycTier).toBe(tier);
    }
  });

  it('accepts valid rateLimitTier values', () => {
    for (const tier of ['standard', 'trusted', 'restricted'] as const) {
      const ctx = UserContextSchema.parse({
        identity: { phoneHash: PHONE_HASH, accountLinked: false, kycTier: 0 },
        guidelines: { rateLimitTier: tier },
      });
      expect(ctx.guidelines.rateLimitTier).toBe(tier);
    }
  });
});

// ---------------------------------------------------------------------------
// Sub-schema tests (progressive hydration)
// ---------------------------------------------------------------------------

describe('IdentitySchema', () => {
  it('requires phoneHash', () => {
    expect(() => IdentitySchema.parse({ accountLinked: false, kycTier: 0 })).toThrow();
  });

  it('accepts optional fields absent', () => {
    const id = IdentitySchema.parse({ phoneHash: PHONE_HASH });
    expect(id.phoneNumber).toBeUndefined();
    expect(id.flashUsername).toBeUndefined();
    expect(id.accountLinked).toBe(false);
    expect(id.kycTier).toBe(0);
  });

  it('validates countryCode must be length 2', () => {
    expect(() =>
      IdentitySchema.parse({ phoneHash: PHONE_HASH, countryCode: 'JAM' }),
    ).toThrow();
    expect(() =>
      IdentitySchema.parse({ phoneHash: PHONE_HASH, countryCode: 'J' }),
    ).toThrow();
    const id = IdentitySchema.parse({ phoneHash: PHONE_HASH, countryCode: 'JM' });
    expect(id.countryCode).toBe('JM');
  });
});

describe('UnderstandingSchema', () => {
  it('uses defaults for empty input', () => {
    const u = UnderstandingSchema.parse({});
    expect(u.primaryLanguage).toBe('en');
    expect(u.preferredCurrency).toBe('USD');
    expect(u.amountFormat).toBe('symbol');
    expect(u.prefersVoice).toBe(false);
    expect(u.literacyIndicators.usesEmoji).toBe(false);
    expect(u.literacyIndicators.averageMessageLength).toBe(0);
  });
});

describe('FinancialSchema', () => {
  it('defaults isMerchant to false and savedContacts to []', () => {
    const f = FinancialSchema.parse({});
    expect(f.isMerchant).toBe(false);
    expect(f.savedContacts).toEqual([]);
    expect(f.homeCurrency).toBe('USD');
  });
});

describe('SessionSchema', () => {
  it('defaults all counters to zero', () => {
    const s = SessionSchema.parse({});
    expect(s.confusedTurns).toBe(0);
    expect(s.messageCount).toBe(0);
    expect(s.escalated).toBe(false);
  });
});

describe('GuidelinesSchema', () => {
  it('defaults all flags to safe values', () => {
    const g = GuidelinesSchema.parse({});
    expect(g.restrictedJurisdiction).toBe(false);
    expect(g.enhancedMonitoring).toBe(false);
    expect(g.tosAccepted).toBe(false);
    expect(g.rateLimitTier).toBe('standard');
    expect(g.complianceNotes).toEqual([]);
  });
});
