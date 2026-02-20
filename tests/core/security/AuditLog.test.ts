/**
 * AuditLog unit tests.
 *
 * Covers:
 * - record() auto-generates id and timestamp
 * - success() shorthand
 * - failure() shorthand
 * - blocked() shorthand
 * - Outcome values
 * - Data and requestId passthrough
 */

jest.mock('../../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { AuditLog } from '../../../src/core/security/AuditLog';

describe('AuditLog', () => {
  let auditLog: AuditLog;

  beforeEach(() => {
    auditLog = new AuditLog();
  });

  // --------------------------------------------------------------------------
  // record()
  // --------------------------------------------------------------------------
  describe('record()', () => {
    it('auto-generates a UUID for the entry id', () => {
      const entry = auditLog.record({
        eventType: 'payment_initiated',
        phoneHash: 'hash-abc',
        data: {},
        outcome: 'success',
      });

      expect(entry.id).toBeTruthy();
      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(0);
    });

    it('auto-generates a timestamp', () => {
      const before = new Date();
      const entry = auditLog.record({
        eventType: 'payment_initiated',
        phoneHash: 'hash-abc',
        data: {},
        outcome: 'success',
      });
      const after = new Date();

      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entry.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('preserves eventType, phoneHash, data, and outcome', () => {
      const entry = auditLog.record({
        eventType: 'otp_verified',
        phoneHash: 'hash-xyz',
        data: { method: 'SMS' },
        outcome: 'success',
        requestId: 'req-999',
      });

      expect(entry.eventType).toBe('otp_verified');
      expect(entry.phoneHash).toBe('hash-xyz');
      expect(entry.data).toEqual({ method: 'SMS' });
      expect(entry.outcome).toBe('success');
      expect(entry.requestId).toBe('req-999');
    });

    it('generates unique ids for each call', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const entry = auditLog.record({
          eventType: 'payment_initiated',
          phoneHash: 'hash-x',
          data: {},
          outcome: 'success',
        });
        ids.add(entry.id);
      }
      expect(ids.size).toBe(20);
    });

    it('includes optional requestId when provided', () => {
      const entry = auditLog.record({
        eventType: 'kyc_updated',
        phoneHash: 'hash-kyc',
        data: { tier: 1 },
        outcome: 'success',
        requestId: 'req-kyc-001',
      });

      expect(entry.requestId).toBe('req-kyc-001');
    });

    it('works when requestId is omitted', () => {
      const entry = auditLog.record({
        eventType: 'kyc_updated',
        phoneHash: 'hash-kyc',
        data: {},
        outcome: 'success',
      });

      expect(entry.requestId).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // success()
  // --------------------------------------------------------------------------
  describe('success()', () => {
    it('records outcome as "success"', () => {
      const entry = auditLog.success('payment_confirmed', 'hash-pay', { amount: 5000 }, 'req-1');
      expect(entry.outcome).toBe('success');
    });

    it('records correct eventType', () => {
      const entry = auditLog.success('account_linked', 'hash-link');
      expect(entry.eventType).toBe('account_linked');
    });

    it('accepts empty data object', () => {
      const entry = auditLog.success('otp_requested', 'hash-otp');
      expect(entry.data).toEqual({});
    });

    it('passes through data payload', () => {
      const entry = auditLog.success('payment_confirmed', 'hash-p', {
        amountSats: 10_000,
        recipient: 'bob@flash.com',
        transactionId: 'tx-001',
      });
      expect(entry.data.amountSats).toBe(10_000);
      expect(entry.data.recipient).toBe('bob@flash.com');
    });
  });

  // --------------------------------------------------------------------------
  // failure()
  // --------------------------------------------------------------------------
  describe('failure()', () => {
    it('records outcome as "failure"', () => {
      const entry = auditLog.failure('payment_failed', 'hash-err', { error: 'Timeout' });
      expect(entry.outcome).toBe('failure');
    });

    it('records the failure event type', () => {
      const entry = auditLog.failure('otp_failed', 'hash-otp-fail');
      expect(entry.eventType).toBe('otp_failed');
    });

    it('passes through failure data', () => {
      const entry = auditLog.failure('payment_failed', 'hash-fail', {
        error: 'Insufficient funds',
        attemptedAmountSats: 100_000,
      });
      expect(entry.data.error).toBe('Insufficient funds');
      expect(entry.data.attemptedAmountSats).toBe(100_000);
    });

    it('includes requestId when provided', () => {
      const entry = auditLog.failure('otp_failed', 'hash-x', {}, 'req-fail-001');
      expect(entry.requestId).toBe('req-fail-001');
    });
  });

  // --------------------------------------------------------------------------
  // blocked()
  // --------------------------------------------------------------------------
  describe('blocked()', () => {
    it('records outcome as "blocked"', () => {
      const entry = auditLog.blocked('rate_limit_hit', 'hash-blocked', { tier: 'standard' });
      expect(entry.outcome).toBe('blocked');
    });

    it('records injection_attempt event type', () => {
      const entry = auditLog.blocked('injection_attempt', 'hash-injection');
      expect(entry.eventType).toBe('injection_attempt');
    });

    it('records rate_limit_hit event type', () => {
      const entry = auditLog.blocked('rate_limit_hit', 'hash-rl', { tier: 'restricted' });
      expect(entry.eventType).toBe('rate_limit_hit');
      expect(entry.data.tier).toBe('restricted');
    });

    it('includes all mandatory fields', () => {
      const entry = auditLog.blocked('injection_attempt', 'hash-inject', {
        reason: 'Potential prompt injection',
      }, 'req-block-1');

      expect(entry.id).toBeTruthy();
      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.phoneHash).toBe('hash-inject');
      expect(entry.requestId).toBe('req-block-1');
      expect(entry.outcome).toBe('blocked');
    });
  });

  // --------------------------------------------------------------------------
  // All event types are accepted
  // --------------------------------------------------------------------------
  describe('all event types', () => {
    const eventTypes = [
      'payment_initiated',
      'payment_confirmed',
      'payment_declined',
      'payment_failed',
      'account_linked',
      'account_unlinked',
      'otp_requested',
      'otp_verified',
      'otp_failed',
      'rate_limit_hit',
      'injection_attempt',
      'escalation',
      'kyc_updated',
      'context_deleted',
      'admin_action',
    ] as const;

    eventTypes.forEach((eventType) => {
      it(`accepts eventType: ${eventType}`, () => {
        const entry = auditLog.record({
          eventType,
          phoneHash: 'hash-test',
          data: {},
          outcome: 'success',
        });
        expect(entry.eventType).toBe(eventType);
      });
    });
  });
});
