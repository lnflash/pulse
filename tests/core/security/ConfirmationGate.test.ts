/**
 * ConfirmationGate unit tests.
 *
 * Covers:
 * - storePending() stores action and returns PendingAction
 * - checkConfirmation() with confirmation phrases
 * - checkConfirmation() with declination phrases
 * - Expiry handling
 * - hasPending() state tracking
 * - clearPending() cleanup
 * - Localized confirmation phrases (Jamaican Patois, Trinidadian Creole)
 */

jest.mock('../../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { ConfirmationGate } from '../../../src/core/security/ConfirmationGate';
import { createDefaultContext } from '../../../src/core/context/UserContext';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeContext(phoneHash: string = 'hash-test-user') {
  return createDefaultContext(phoneHash, {
    identity: { phoneHash, phoneNumber: '+18765551234' },
  });
}

const TOOL_NAME = 'SendPayment';
const TOOL_PARAMS = { amountSats: 5000, recipient: 'alice@flash.com' };
const DESCRIPTION = 'Send 5,000 sats to alice@flash.com';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConfirmationGate', () => {
  let gate: ConfirmationGate;
  let userContext: ReturnType<typeof makeContext>;

  beforeEach(() => {
    gate = new ConfirmationGate();
    userContext = makeContext();
  });

  // --------------------------------------------------------------------------
  // storePending()
  // --------------------------------------------------------------------------
  describe('storePending()', () => {
    it('returns a PendingAction with an auto-generated id', () => {
      const action = gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
      expect(action.id).toBeTruthy();
      expect(typeof action.id).toBe('string');
    });

    it('stores toolName and toolParams correctly', () => {
      const action = gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
      expect(action.toolName).toBe(TOOL_NAME);
      expect(action.toolParams).toEqual(TOOL_PARAMS);
    });

    it('stores the description', () => {
      const action = gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
      expect(action.description).toBe(DESCRIPTION);
    });

    it('stores the phoneHash from the user context', () => {
      const action = gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
      expect(action.phoneHash).toBe(userContext.identity.phoneHash);
    });

    it('sets createdAt to approximately now', () => {
      const before = new Date();
      const action = gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
      const after = new Date();

      expect(action.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(action.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('sets expiresAt to approximately now + 5 minutes by default', () => {
      const before = Date.now();
      const action = gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
      const after = Date.now();

      const expectedMin = before + 5 * 60 * 1000;
      const expectedMax = after + 5 * 60 * 1000;

      expect(action.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(action.expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('accepts a custom expiry duration', () => {
      const customGate = new ConfirmationGate({ expiryMs: 60_000 }); // 1 minute
      const before = Date.now();
      const action = customGate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
      const after = Date.now();

      expect(action.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
      expect(action.expiresAt.getTime()).toBeLessThanOrEqual(after + 60_000);
    });

    it('overwrites a previous pending action for the same user', () => {
      const first = gate.storePending(userContext, 'ToolA', {}, 'First action');
      const second = gate.storePending(userContext, 'ToolB', {}, 'Second action');

      // Only the latest action should be pending
      const result = gate.checkConfirmation(userContext, 'yes');
      expect((result as { status: string; action: { toolName: string } }).action.toolName).toBe('ToolB');
    });
  });

  // --------------------------------------------------------------------------
  // checkConfirmation() — no pending action
  // --------------------------------------------------------------------------
  describe('checkConfirmation() — no pending action', () => {
    it('returns status "no_pending" when nothing is stored', () => {
      const result = gate.checkConfirmation(userContext, 'yes');
      expect(result.status).toBe('no_pending');
    });

    it('returns status "no_pending" for a user with no stored action', () => {
      const otherUser = makeContext('hash-other-user');
      gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);

      // otherUser has no pending action
      const result = gate.checkConfirmation(otherUser, 'yes');
      expect(result.status).toBe('no_pending');
    });
  });

  // --------------------------------------------------------------------------
  // checkConfirmation() — confirmation phrases
  // --------------------------------------------------------------------------
  describe('checkConfirmation() — confirmation phrases', () => {
    beforeEach(() => {
      gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
    });

    const confirmationPhrases = [
      'yes',
      'confirm',
      'ok',
      'okay',
      'send',
      'do it',
      'proceed',
      'correct',
      'right',
      'yep',
      'yup',
      'go ahead',
      'approve',
      'ya man',
      'aye',
      'zeen',
      'alright',
      'oui',
      'yes boss',
      'aight',
    ];

    confirmationPhrases.forEach((phrase) => {
      it(`confirms with phrase: "${phrase}"`, () => {
        gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
        const result = gate.checkConfirmation(userContext, phrase);
        expect(result.status).toBe('confirmed');
      });
    });

    it('returns the PendingAction in the confirmed result', () => {
      const result = gate.checkConfirmation(userContext, 'yes') as {
        status: 'confirmed';
        action: { toolName: string };
      };
      expect(result.status).toBe('confirmed');
      expect(result.action.toolName).toBe(TOOL_NAME);
    });

    it('removes the pending action after confirmation', () => {
      gate.checkConfirmation(userContext, 'yes');

      // No more pending action
      expect(gate.hasPending(userContext.identity.phoneHash)).toBe(false);
    });

    it('is case-insensitive for confirmation', () => {
      const result = gate.checkConfirmation(userContext, 'YES');
      expect(result.status).toBe('confirmed');
    });

    it('accepts confirmation phrases with trailing text', () => {
      const result = gate.checkConfirmation(userContext, 'yes please');
      expect(result.status).toBe('confirmed');
    });
  });

  // --------------------------------------------------------------------------
  // checkConfirmation() — declination phrases
  // --------------------------------------------------------------------------
  describe('checkConfirmation() — declination phrases', () => {
    beforeEach(() => {
      gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
    });

    const declinationPhrases = [
      'no',
      'cancel',
      'stop',
      'nope',
      'nah',
      'never mind',
      'nevermind',
      'back',
      'abort',
      'decline',
      'reject',
      'nuh',
      'cyaan',
    ];

    declinationPhrases.forEach((phrase) => {
      it(`declines with phrase: "${phrase}"`, () => {
        gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
        const result = gate.checkConfirmation(userContext, phrase);
        expect(result.status).toBe('declined');
      });
    });

    it('returns the PendingAction in the declined result', () => {
      const result = gate.checkConfirmation(userContext, 'cancel') as {
        status: 'declined';
        action: { toolName: string };
      };
      expect(result.action.toolName).toBe(TOOL_NAME);
    });

    it('removes the pending action after declination', () => {
      gate.checkConfirmation(userContext, 'cancel');
      expect(gate.hasPending(userContext.identity.phoneHash)).toBe(false);
    });

    it('is case-insensitive for declination', () => {
      const result = gate.checkConfirmation(userContext, 'NO');
      expect(result.status).toBe('declined');
    });
  });

  // --------------------------------------------------------------------------
  // checkConfirmation() — ambiguous messages
  // --------------------------------------------------------------------------
  describe('checkConfirmation() — ambiguous messages', () => {
    it('returns "no_pending" for an unrecognized response', () => {
      gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
      // A message that neither confirms nor declines
      const result = gate.checkConfirmation(userContext, 'What is the fee?');
      expect(result.status).toBe('no_pending');
    });

    it('does not consume the pending action for ambiguous messages', () => {
      gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
      gate.checkConfirmation(userContext, 'maybe later');
      // Still pending
      expect(gate.hasPending(userContext.identity.phoneHash)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Expiry handling
  // --------------------------------------------------------------------------
  describe('expiry handling', () => {
    it('returns "expired" for an action past its expiry', () => {
      // Use a very short expiry (1ms) so it expires immediately
      const shortGate = new ConfirmationGate({ expiryMs: 1 });
      shortGate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);

      // Wait a bit for the action to expire
      const expiredResult = (() => {
        // Force the internal action to be expired by manipulating time via the gate's logic:
        // storePending with expiryMs=1 means it expires 1ms after creation.
        // We just need to wait long enough.
        return new Promise<ReturnType<ConfirmationGate['checkConfirmation']>>((resolve) => {
          setTimeout(() => {
            resolve(shortGate.checkConfirmation(userContext, 'yes'));
          }, 10);
        });
      })();

      return expiredResult.then((result) => {
        expect(result.status).toBe('expired');
      });
    });

    it('removes expired action from storage', async () => {
      const shortGate = new ConfirmationGate({ expiryMs: 1 });
      shortGate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);

      await new Promise((resolve) => setTimeout(resolve, 10));

      shortGate.checkConfirmation(userContext, 'yes'); // triggers expiry cleanup
      expect(shortGate.hasPending(userContext.identity.phoneHash)).toBe(false);
    });

    it('returns "expired" action in the result', async () => {
      const shortGate = new ConfirmationGate({ expiryMs: 1 });
      shortGate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = shortGate.checkConfirmation(userContext, 'yes') as {
        status: string;
        action: { toolName: string };
      };
      expect(result.status).toBe('expired');
      expect(result.action.toolName).toBe(TOOL_NAME);
    });
  });

  // --------------------------------------------------------------------------
  // hasPending()
  // --------------------------------------------------------------------------
  describe('hasPending()', () => {
    it('returns false when no action is stored', () => {
      expect(gate.hasPending(userContext.identity.phoneHash)).toBe(false);
    });

    it('returns true after storing a pending action', () => {
      gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
      expect(gate.hasPending(userContext.identity.phoneHash)).toBe(true);
    });

    it('returns false after confirmation clears the action', () => {
      gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
      gate.checkConfirmation(userContext, 'yes');
      expect(gate.hasPending(userContext.identity.phoneHash)).toBe(false);
    });

    it('returns false after declination clears the action', () => {
      gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
      gate.checkConfirmation(userContext, 'cancel');
      expect(gate.hasPending(userContext.identity.phoneHash)).toBe(false);
    });

    it('returns false for an expired action', async () => {
      const shortGate = new ConfirmationGate({ expiryMs: 1 });
      shortGate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(shortGate.hasPending(userContext.identity.phoneHash)).toBe(false);
    });

    it('returns false for a different user even if another user has a pending action', () => {
      const otherUser = makeContext('hash-other');
      gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
      expect(gate.hasPending(otherUser.identity.phoneHash)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // clearPending()
  // --------------------------------------------------------------------------
  describe('clearPending()', () => {
    it('clears a pending action for a user', () => {
      gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
      gate.clearPending(userContext.identity.phoneHash);
      expect(gate.hasPending(userContext.identity.phoneHash)).toBe(false);
    });

    it('is a no-op when there is no pending action', () => {
      // Should not throw
      expect(() => gate.clearPending(userContext.identity.phoneHash)).not.toThrow();
    });

    it('only clears the specified user, not others', () => {
      const otherUser = makeContext('hash-other-clear');
      gate.storePending(userContext, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);
      gate.storePending(otherUser, TOOL_NAME, TOOL_PARAMS, DESCRIPTION);

      gate.clearPending(userContext.identity.phoneHash);

      expect(gate.hasPending(userContext.identity.phoneHash)).toBe(false);
      expect(gate.hasPending(otherUser.identity.phoneHash)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Independent users
  // --------------------------------------------------------------------------
  describe('user isolation', () => {
    it('tracks pending actions independently per user', () => {
      const userA = makeContext('hash-user-A');
      const userB = makeContext('hash-user-B');

      gate.storePending(userA, 'ToolA', {}, 'A action');
      gate.storePending(userB, 'ToolB', {}, 'B action');

      const resultA = gate.checkConfirmation(userA, 'yes') as { status: string; action: { toolName: string } };
      const resultB = gate.checkConfirmation(userB, 'confirm') as { status: string; action: { toolName: string } };

      expect(resultA.action.toolName).toBe('ToolA');
      expect(resultB.action.toolName).toBe('ToolB');
    });

    it('confirming one user does not affect another', () => {
      const userA = makeContext('hash-user-A2');
      const userB = makeContext('hash-user-B2');

      gate.storePending(userA, 'ToolA', {}, 'A action');
      gate.storePending(userB, 'ToolB', {}, 'B action');

      gate.checkConfirmation(userA, 'yes');

      expect(gate.hasPending(userA.identity.phoneHash)).toBe(false);
      expect(gate.hasPending(userB.identity.phoneHash)).toBe(true);
    });
  });
});
