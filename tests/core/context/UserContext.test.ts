/**
 * UserContext schema tests.
 */

import {
  UserContextSchema,
  createDefaultContext,
  patchContext,
} from '../../../src/core/context/UserContext';

describe('UserContextSchema', () => {
  const phoneHash = 'abc123hash';

  describe('createDefaultContext', () => {
    it('creates a valid context with all defaults', () => {
      const ctx = createDefaultContext(phoneHash);
      expect(ctx.identity.phoneHash).toBe(phoneHash);
      expect(ctx.identity.accountLinked).toBe(false);
      expect(ctx.identity.kycTier).toBe(0);
      expect(ctx.understanding.preferredCurrency).toBe('USD');
      expect(ctx.understanding.primaryLanguage).toBe('en');
      expect(ctx.financial.isMerchant).toBe(false);
      expect(ctx.financial.savedContacts).toEqual([]);
      expect(ctx.session.confusedTurns).toBe(0);
      expect(ctx.session.escalated).toBe(false);
      expect(ctx.guidelines.rateLimitTier).toBe('standard');
      expect(ctx.meta.schemaVersion).toBe('5.0.0');
    });

    it('accepts partial identity overrides', () => {
      const ctx = createDefaultContext(phoneHash, {
        identity: {
          phoneHash,
          phoneNumber: '+18765551234',
          countryCode: 'JM',
          accountLinked: false,
          kycTier: 0,
        },
      });
      expect(ctx.identity.phoneNumber).toBe('+18765551234');
      expect(ctx.identity.countryCode).toBe('JM');
    });

    it('accepts understanding overrides', () => {
      const ctx = createDefaultContext(phoneHash, {
        understanding: {
          preferredCurrency: 'JMD',
          primaryLanguage: 'en',
          amountFormat: 'symbol',
          prefersVoice: false,
          literacyIndicators: { usesEmoji: false, averageMessageLength: 0, usesFormatting: false },
        },
      });
      expect(ctx.understanding.preferredCurrency).toBe('JMD');
    });
  });

  describe('patchContext', () => {
    it('merges session patch without losing other session fields', () => {
      const base = createDefaultContext(phoneHash);
      const patched = patchContext(base, {
        session: { ...base.session, currentStep: 'confirming_payment', messageCount: 3 },
      });
      expect(patched.session.currentStep).toBe('confirming_payment');
      expect(patched.session.messageCount).toBe(3);
      expect(patched.session.escalated).toBe(false);
      expect(patched.identity.phoneHash).toBe(phoneHash);
    });

    it('updates meta.updatedAt on each patch', () => {
      const base = createDefaultContext(phoneHash);
      const before = base.meta.updatedAt.getTime();
      const patched = patchContext(base, {
        financial: { ...base.financial, isMerchant: true },
      });
      expect(patched.meta.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('supports nested financial updates', () => {
      const base = createDefaultContext(phoneHash);
      const patched = patchContext(base, {
        financial: { ...base.financial, isMerchant: true },
      });
      expect(patched.financial.isMerchant).toBe(true);
      expect(patched.financial.savedContacts).toEqual([]);
    });
  });

  describe('schema validation', () => {
    it('rejects invalid kycTier', () => {
      expect(() =>
        UserContextSchema.parse({
          identity: { phoneHash, accountLinked: false, kycTier: 5 },
        }),
      ).toThrow();
    });

    it('rejects missing phoneHash', () => {
      expect(() =>
        UserContextSchema.parse({
          identity: { accountLinked: false, kycTier: 0 },
        }),
      ).toThrow();
    });

    it('fills in defaults for missing sections', () => {
      const ctx = UserContextSchema.parse({
        identity: { phoneHash, accountLinked: false, kycTier: 0 },
      });
      expect(ctx.understanding).toBeDefined();
      expect(ctx.financial).toBeDefined();
      expect(ctx.patterns).toBeDefined();
      expect(ctx.session).toBeDefined();
      expect(ctx.guidelines).toBeDefined();
      expect(ctx.meta).toBeDefined();
    });

    it('accepts all valid kycTier values: 0, 1, 2', () => {
      for (const tier of [0, 1, 2] as const) {
        const ctx = UserContextSchema.parse({
          identity: { phoneHash, accountLinked: false, kycTier: tier },
        });
        expect(ctx.identity.kycTier).toBe(tier);
      }
    });

    it('rejects invalid rateLimitTier', () => {
      expect(() =>
        UserContextSchema.parse({
          identity: { phoneHash, accountLinked: false, kycTier: 0 },
          guidelines: { rateLimitTier: 'vip' },
        }),
      ).toThrow();
    });
  });
});
