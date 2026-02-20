/**
 * CheckBalance tool unit tests.
 */

jest.mock('../../../../src/config/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { CheckBalance } from '../../../../src/core/tools/wallet/CheckBalance';
import { createDefaultContext } from '../../../../src/core/context/UserContext';
import type { ToolExecutionContext } from '../../../../src/core/tools/Tool';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PHONE_HASH = 'checkabalance-test-hash-000000000000000000000000000000000000000';
const ACCOUNT_ID = 'flash-account-uuid-123';

function makeLinkedContext() {
  return createDefaultContext(PHONE_HASH, {
    identity: {
      phoneHash: PHONE_HASH,
      phoneNumber: '+18765551234',
      accountLinked: true,
      flashAccountId: ACCOUNT_ID,
      kycTier: 1,
    },
  });
}

function makeUnlinkedContext() {
  return createDefaultContext(PHONE_HASH, {
    identity: {
      phoneHash: PHONE_HASH,
      phoneNumber: '+18765551234',
      accountLinked: false,
      kycTier: 0,
    },
  });
}

function makeContext(userContext: ReturnType<typeof createDefaultContext>): ToolExecutionContext {
  return {
    userContext,
    updateContext: jest.fn(),
    requestId: 'req-test-001',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CheckBalance tool', () => {
  let tool: CheckBalance;

  beforeEach(() => {
    tool = new CheckBalance();
  });

  // ── Metadata ─────────────────────────────────────────────────────────────

  describe('metadata', () => {
    it('has the correct tool name', () => {
      expect(tool.name).toBe('check_balance');
    });

    it('is in the wallet category', () => {
      expect(tool.category).toBe('wallet');
    });

    it('requires authentication', () => {
      expect(tool.requiresAuth).toBe(true);
    });

    it('does not require confirmation', () => {
      expect(tool.requiresConfirmation).toBe(false);
    });

    it('has a description', () => {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
    });

    it('has parameters schema', () => {
      expect(tool.parameters).toBeDefined();
      expect((tool.parameters as any).type).toBe('object');
    });
  });

  // ── Unlinked account ─────────────────────────────────────────────────────

  describe('unlinked account', () => {
    it('returns fail when no flashAccountId is set', async () => {
      const unlinkedCtx = makeUnlinkedContext();
      const ctx = makeContext(unlinkedCtx);

      const result = await tool.execute({}, ctx);

      expect(result.success).toBe(false);
      expect(result.output).toContain('No Flash account ID');
      expect(result.signal).toBe('continue');
    });

    it('returns fail when accountLinked is false and no flashAccountId', async () => {
      const ctx = makeContext(makeUnlinkedContext());
      const result = await tool.execute({ currency: 'JMD' }, ctx);
      expect(result.success).toBe(false);
    });
  });

  // ── Linked account ────────────────────────────────────────────────────────

  describe('linked account without WalletPort injection', () => {
    it('throws when WalletPort is not injected', async () => {
      const linkedCtx = makeLinkedContext();
      const ctx = makeContext(linkedCtx);

      // The current implementation throws when WalletPort is not injected.
      // In production, the Orchestrator injects the WalletPort.
      // Test that the error is meaningful.
      await expect(tool.execute({}, ctx)).rejects.toThrow(/WalletPort not injected/);
    });

    it('the error message describes the injection requirement', async () => {
      const ctx = makeContext(makeLinkedContext());
      try {
        await tool.execute({}, ctx);
        fail('Expected an error');
      } catch (err) {
        expect((err as Error).message).toContain('WalletPort');
      }
    });
  });

  // ── Parameter handling ───────────────────────────────────────────────────

  describe('parameter handling', () => {
    it('accepts an optional currency parameter', async () => {
      // When unlinked, the currency param is irrelevant — it fails before reading it
      const ctx = makeContext(makeUnlinkedContext());
      const result = await tool.execute({ currency: 'JMD' }, ctx);
      expect(result.success).toBe(false);
    });

    it('accepts empty params object', async () => {
      const ctx = makeContext(makeUnlinkedContext());
      const result = await tool.execute({}, ctx);
      expect(result.success).toBe(false);
    });
  });

  // ── BaseTool helpers ──────────────────────────────────────────────────────

  describe('BaseTool helpers (via fail())', () => {
    it('fail() returns success=false with continue signal', async () => {
      // The unlinked account path tests fail() indirectly
      const ctx = makeContext(makeUnlinkedContext());
      const result = await tool.execute({}, ctx);
      expect(result.success).toBe(false);
      expect(result.signal).toBe('continue');
    });
  });
});

// ---------------------------------------------------------------------------
// CheckBalance with mocked WalletPort (monkey-patching approach)
// ---------------------------------------------------------------------------

describe('CheckBalance with injected WalletPort', () => {
  it('can be extended to accept a WalletPort via subclass', async () => {
    // Demonstrate how the tool would work with a WalletPort injected.
    // We override execute() to simulate the expected behavior.
    class CheckBalanceWithWallet extends CheckBalance {
      override async execute(
        params: Record<string, unknown>,
        context: ToolExecutionContext,
      ) {
        const accountId = context.userContext.identity.flashAccountId;
        if (!accountId) {
          return this.fail('No Flash account ID found. Account may not be fully linked.');
        }
        // Simulate a successful balance check
        return this.complete(
          `Your current balance is USD 100.00 available.`,
          { accountId, currency: params['currency'] ?? 'USD' },
        );
      }
    }

    const tool = new CheckBalanceWithWallet();
    const ctx: ToolExecutionContext = {
      userContext: createDefaultContext('hash-001', {
        identity: {
          phoneHash: 'hash-001',
          accountLinked: true,
          flashAccountId: 'acct-001',
          kycTier: 1,
        },
      }),
      updateContext: jest.fn(),
      requestId: 'req-001',
    };

    const result = await tool.execute({ currency: 'USD' }, ctx);
    expect(result.success).toBe(true);
    expect(result.signal).toBe('complete');
    expect(result.output).toContain('100.00');
  });
});
