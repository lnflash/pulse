/**
 * ConfirmationGate unit tests.
 *
 * Tests pending action storage, confirmation/declination phrase matching,
 * expiry handling, and lifecycle management.
 */

jest.mock('../../../src/config/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  ConfirmationGate,
  type PendingAction,
} from '../../../src/core/security/ConfirmationGate';
import { createDefaultContext } from '../../../src/core/context/UserContext';
import type { UserContext } from '../../../src/core/context/UserContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PHONE_HASH_A = 'user-a-hash-000000000000000000000000000000000000000000000000';
const PHONE_HASH_B = 'user-b-hash-111111111111111111111111111111111111111111111111';

function makeContext(phoneHash: string): UserContext {
  return createDefaultContext(phoneHash, {
    identity: { phoneHash, accountLinked: true, kycTier: 1 },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConfirmationGate', () => {
  let gate: ConfirmationGate;
  let contextA: UserContext;
  let contextB: UserContext;

  beforeEach(() => {
    gate = new ConfirmationGate();
    contextA = makeContext(PHONE_HASH_A);
    contextB = makeContext(PHONE_HASH_B);
  });

  // ── storePending ──────────────────────────────────────────────────────────

  describe('storePending()', () => {
    it('stores a pending action and returns it', () => {
      const action = gate.storePending(
        contextA,
        'send_payment',
        { amount: 5000, destination: 'marcus123' },
        'Send 5000 sats to Marcus',
      );

      expect(action).toBeDefined();
      expect(action.toolName).toBe('send_payment');
      expect(action.toolParams.amount).toBe(5000);
      expect(action.description).toBe('Send 5000 sats to Marcus');
      expect(action.phoneHash).toBe(PHONE_HASH_A);
    });

    it('assigns a unique ID to each pending action', () => {
      const a1 = gate.storePending(contextA, 'tool', {}, 'Action 1');
      const a2 = gate.storePending(contextB, 'tool', {}, 'Action 2');
      expect(a1.id).not.toBe(a2.id);
    });

    it('sets createdAt and expiresAt', () => {
      const before = Date.now();
      const action = gate.storePending(contextA, 'send_payment', {}, 'Test');
      const after = Date.now();
      expect(action.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(action.createdAt.getTime()).toBeLessThanOrEqual(after);
      expect(action.expiresAt.getTime()).toBeGreaterThan(action.createdAt.getTime());
    });

    it('overwrites a previous pending action for the same user', () => {
      gate.storePending(contextA, 'send_payment', { amount: 1000 }, 'First action');
      gate.storePending(contextA, 'check_balance', {}, 'Second action');

      // Check that only the latest action is pending (checkConfirmation returns it)
      const result = gate.checkConfirmation(contextA, 'yes');
      expect(result.status).toBe('confirmed');
      if (result.status === 'confirmed') {
        expect(result.action.toolName).toBe('check_balance');
      }
    });

    it('hasPending() returns true immediately after storing', () => {
      gate.storePending(contextA, 'send_payment', {}, 'Payment');
      expect(gate.hasPending(PHONE_HASH_A)).toBe(true);
    });
  });

  // ── checkConfirmation — confirmation phrases ──────────────────────────────

  describe('checkConfirmation() — confirmation phrases', () => {
    const CONFIRMATION_PHRASES = [
      'yes', 'confirm', 'ok', 'okay', 'send', 'do it', 'proceed',
      'correct', 'right', 'yep', 'yup', 'go ahead', 'approve',
      // Jamaican Patois
      'ya man', 'aye', 'zeen', 'alright',
      // Trinidadian
      'oui', 'yes boss', 'aight',
    ];

    for (const phrase of CONFIRMATION_PHRASES) {
      it(`"${phrase}" → confirmed`, () => {
        gate.storePending(contextA, 'send_payment', {}, 'Test');
        const result = gate.checkConfirmation(contextA, phrase);
        expect(result.status).toBe('confirmed');
      });
    }

    it('confirmation is case-insensitive', () => {
      gate.storePending(contextA, 'send_payment', {}, 'Test');
      const result = gate.checkConfirmation(contextA, 'YES');
      expect(result.status).toBe('confirmed');
    });

    it('confirmation removes the pending action', () => {
      gate.storePending(contextA, 'send_payment', {}, 'Test');
      gate.checkConfirmation(contextA, 'yes');
      expect(gate.hasPending(PHONE_HASH_A)).toBe(false);
    });

    it('confirmed result includes the pending action', () => {
      const stored = gate.storePending(contextA, 'send_payment', { amount: 100 }, 'Test');
      const result = gate.checkConfirmation(contextA, 'yes');
      expect(result.status).toBe('confirmed');
      if (result.status === 'confirmed') {
        expect(result.action.id).toBe(stored.id);
        expect(result.action.toolParams.amount).toBe(100);
      }
    });

    it('phrase with extra text at end still confirms (startsWith match)', () => {
      gate.storePending(contextA, 'send_payment', {}, 'Test');
      const result = gate.checkConfirmation(contextA, 'yes please do it');
      expect(result.status).toBe('confirmed');
    });
  });

  // ── checkConfirmation — declination phrases ───────────────────────────────

  describe('checkConfirmation() — declination phrases', () => {
    const DECLINATION_PHRASES = [
      'no', 'cancel', 'stop', 'nope', 'nah', 'never mind', 'nevermind',
      'back', 'abort', 'decline', 'reject',
      // Patois
      'nuh', 'cyaan',
    ];

    for (const phrase of DECLINATION_PHRASES) {
      it(`"${phrase}" → declined`, () => {
        gate.storePending(contextA, 'send_payment', {}, 'Test');
        const result = gate.checkConfirmation(contextA, phrase);
        expect(result.status).toBe('declined');
      });
    }

    it('declination removes the pending action', () => {
      gate.storePending(contextA, 'send_payment', {}, 'Test');
      gate.checkConfirmation(contextA, 'no');
      expect(gate.hasPending(PHONE_HASH_A)).toBe(false);
    });

    it('declined result includes the pending action', () => {
      const stored = gate.storePending(contextA, 'send_payment', {}, 'Test');
      const result = gate.checkConfirmation(contextA, 'cancel');
      expect(result.status).toBe('declined');
      if (result.status === 'declined') {
        expect(result.action.id).toBe(stored.id);
      }
    });
  });

  // ── checkConfirmation — no pending ────────────────────────────────────────

  describe('checkConfirmation() — no pending action', () => {
    it('returns no_pending when there is no stored action', () => {
      const result = gate.checkConfirmation(contextA, 'yes');
      expect(result.status).toBe('no_pending');
    });

    it('returns no_pending for ambiguous phrases', () => {
      gate.storePending(contextA, 'send_payment', {}, 'Test');
      // Ambiguous phrase — not a clear yes or no
      const result = gate.checkConfirmation(contextA, 'maybe later');
      expect(result.status).toBe('no_pending');
    });

    it('actions for different users are independent', () => {
      gate.storePending(contextA, 'send_payment', {}, 'A test');
      // User B has no pending action
      const result = gate.checkConfirmation(contextB, 'yes');
      expect(result.status).toBe('no_pending');
    });

    it('confirming for A does not affect B', () => {
      gate.storePending(contextA, 'send_payment', {}, 'A test');
      gate.storePending(contextB, 'check_balance', {}, 'B test');

      gate.checkConfirmation(contextA, 'yes');

      expect(gate.hasPending(PHONE_HASH_A)).toBe(false);
      expect(gate.hasPending(PHONE_HASH_B)).toBe(true);
    });
  });

  // ── Expiry ────────────────────────────────────────────────────────────────

  describe('expiry', () => {
    it('returns expired status for actions past their expiresAt', async () => {
      // Create gate with very short expiry (1ms)
      const shortGate = new ConfirmationGate({ expiryMs: 1 });

      shortGate.storePending(contextA, 'send_payment', {}, 'Expires fast');

      // Wait 5ms for expiry
      await new Promise((resolve) => setTimeout(resolve, 5));

      const result = shortGate.checkConfirmation(contextA, 'yes');
      expect(result.status).toBe('expired');
    });

    it('expired result includes the action', async () => {
      const shortGate = new ConfirmationGate({ expiryMs: 1 });
      shortGate.storePending(contextA, 'send_payment', { amount: 999 }, 'Expires fast');

      await new Promise((resolve) => setTimeout(resolve, 5));

      const result = shortGate.checkConfirmation(contextA, 'yes');
      expect(result.status).toBe('expired');
      if (result.status === 'expired') {
        expect(result.action.toolParams.amount).toBe(999);
      }
    });

    it('hasPending() returns false for expired actions', async () => {
      const shortGate = new ConfirmationGate({ expiryMs: 1 });
      shortGate.storePending(contextA, 'send_payment', {}, 'Expires fast');

      await new Promise((resolve) => setTimeout(resolve, 5));

      expect(shortGate.hasPending(PHONE_HASH_A)).toBe(false);
    });

    it('uses 5 minute default expiry', () => {
      const action = gate.storePending(contextA, 'send_payment', {}, 'Test');
      const expectedExpiry = action.createdAt.getTime() + 5 * 60 * 1000;
      // Allow 100ms tolerance for test timing
      expect(Math.abs(action.expiresAt.getTime() - expectedExpiry)).toBeLessThan(100);
    });

    it('accepts custom expiryMs in constructor', () => {
      const customGate = new ConfirmationGate({ expiryMs: 10_000 }); // 10 seconds
      const action = customGate.storePending(contextA, 'send_payment', {}, 'Test');
      const expectedExpiry = action.createdAt.getTime() + 10_000;
      expect(Math.abs(action.expiresAt.getTime() - expectedExpiry)).toBeLessThan(100);
    });
  });

  // ── clearPending ──────────────────────────────────────────────────────────

  describe('clearPending()', () => {
    it('clears a pending action for a user', () => {
      gate.storePending(contextA, 'send_payment', {}, 'Test');
      expect(gate.hasPending(PHONE_HASH_A)).toBe(true);

      gate.clearPending(PHONE_HASH_A);
      expect(gate.hasPending(PHONE_HASH_A)).toBe(false);
    });

    it('is a no-op if no pending action', () => {
      // Should not throw
      expect(() => gate.clearPending(PHONE_HASH_A)).not.toThrow();
    });

    it('does not affect other users', () => {
      gate.storePending(contextA, 'send_payment', {}, 'A');
      gate.storePending(contextB, 'check_balance', {}, 'B');

      gate.clearPending(PHONE_HASH_A);
      expect(gate.hasPending(PHONE_HASH_B)).toBe(true);
    });
  });

  // ── hasPending ────────────────────────────────────────────────────────────

  describe('hasPending()', () => {
    it('returns false for users with no pending action', () => {
      expect(gate.hasPending(PHONE_HASH_A)).toBe(false);
    });

    it('returns true for users with a pending action', () => {
      gate.storePending(contextA, 'send_payment', {}, 'Test');
      expect(gate.hasPending(PHONE_HASH_A)).toBe(true);
    });
  });

  // ── Stake level tests (if the gate tracks stakes) ─────────────────────────

  describe('action stakes / description', () => {
    it('stores the description for display', () => {
      const action = gate.storePending(
        contextA,
        'send_payment',
        { amount: 100000, destination: 'keisha' },
        'Send 1,000 USD to Keisha — are you sure?',
      );
      expect(action.description).toBe('Send 1,000 USD to Keisha — are you sure?');
    });

    it('stores the exact tool params', () => {
      const params = {
        amount: 50000,
        destination: 'marcus123',
        memo: 'lunch money',
        idempotencyKey: 'key-001',
      };
      const action = gate.storePending(contextA, 'send_payment', params, 'Send money');
      expect(action.toolParams).toEqual(params);
    });
  });
});
