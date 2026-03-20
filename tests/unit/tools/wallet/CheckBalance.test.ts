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
  childLogger: jest.fn().mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

import { CheckBalance } from '../../../../src/core/tools/wallet/CheckBalance';
import { createDefaultContext } from '../../../../src/core/context/UserContext';
import type { ToolExecutionContext } from '../../../../src/core/tools/Tool';
import type { WalletPort, WalletBalance } from '../../../../src/ports/WalletPort';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PHONE_HASH = 'checkabalance-test-hash-000000000000000000000000000000000000000';
const ACCOUNT_ID = 'flash-account-uuid-123';
const AUTH_TOKEN = 'test-bearer-token-abc123';

const MOCK_BALANCE: WalletBalance = {
  accountId: ACCOUNT_ID,
  available: { amountCents: 10050, currency: 'USD', display: '$100.50' },
  total: { amountCents: 10050, currency: 'USD', display: '$100.50' },
  pendingOut: { amountCents: 0, currency: 'USD', display: '$0.00' },
  asOf: new Date('2026-01-01T00:00:00Z'),
};

function makeStubWalletPort(overrides: Partial<WalletPort> = {}): WalletPort {
  return {
    getBalance: jest.fn().mockResolvedValue(MOCK_BALANCE),
    sendPayment: jest.fn(),
    createInvoice: jest.fn(),
    getInvoice: jest.fn(),
    getTransactionHistory: jest.fn(),
    getExchangeRate: jest.fn(),
    estimateFee: jest.fn(),
    resolveRecipient: jest.fn(),
    ping: jest.fn().mockResolvedValue(true),
    setAuthToken: jest.fn(),
    ...overrides,
  } as unknown as WalletPort;
}

function makeLinkedContext() {
  return createDefaultContext(PHONE_HASH, {
    identity: {
      phoneHash: PHONE_HASH,
      phoneNumber: '+18765551234',
      accountLinked: true,
      flashAccountId: ACCOUNT_ID,
      authToken: AUTH_TOKEN,
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

function makeContext(
  userContext: ReturnType<typeof createDefaultContext>,
  walletPort?: WalletPort,
): ToolExecutionContext {
  return {
    userContext,
    updateContext: jest.fn(),
    requestId: 'req-test-001',
    walletPort: walletPort ?? makeStubWalletPort(),
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
      expect((tool.parameters as Record<string, unknown>).type).toBe('object');
    });
  });

  // ── Unlinked account ─────────────────────────────────────────────────────

  describe('unlinked account', () => {
    it('returns fail when no flashAccountId is set', async () => {
      const ctx = makeContext(makeUnlinkedContext());
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

  // ── Linked account — auth token missing ──────────────────────────────────

  describe('linked account without auth token', () => {
    it('returns fail when authToken is missing from context', async () => {
      const ctxNoToken = createDefaultContext(PHONE_HASH, {
        identity: {
          phoneHash: PHONE_HASH,
          accountLinked: true,
          flashAccountId: ACCOUNT_ID,
          kycTier: 1,
        },
      });
      const ctx = makeContext(ctxNoToken);
      const result = await tool.execute({}, ctx);
      expect(result.success).toBe(false);
      expect(result.output).toContain('auth token');
    });
  });

  // ── Linked account with WalletPort ───────────────────────────────────────

  describe('linked account with injected WalletPort', () => {
    it('calls walletPort.getBalance with the correct accountId', async () => {
      const walletPort = makeStubWalletPort();
      const ctx = makeContext(makeLinkedContext(), walletPort);
      await tool.execute({}, ctx);
      expect(walletPort.getBalance).toHaveBeenCalledWith(ACCOUNT_ID);
    });

    it('registers the auth token via setAuthToken', async () => {
      const walletPort = makeStubWalletPort();
      const ctx = makeContext(makeLinkedContext(), walletPort);
      await tool.execute({}, ctx);
      expect((walletPort as unknown as { setAuthToken: jest.Mock }).setAuthToken)
        .toHaveBeenCalledWith(ACCOUNT_ID, AUTH_TOKEN);
    });

    it('returns success with balance info', async () => {
      const walletPort = makeStubWalletPort();
      const ctx = makeContext(makeLinkedContext(), walletPort);
      const result = await tool.execute({}, ctx);
      expect(result.success).toBe(true);
      expect(result.output).toContain('$100.50');
      expect(result.output).toContain(ACCOUNT_ID);
    });

    it('returns data with accountId, availableCents, currency', async () => {
      const walletPort = makeStubWalletPort();
      const ctx = makeContext(makeLinkedContext(), walletPort);
      const result = await tool.execute({}, ctx);
      expect(result.data).toMatchObject({
        accountId: ACCOUNT_ID,
        availableCents: 10050,
        currency: 'USD',
      });
    });

    it('returns fail when walletPort.getBalance throws', async () => {
      const walletPort = makeStubWalletPort({
        getBalance: jest.fn().mockRejectedValue(new Error('Network timeout')),
      });
      const ctx = makeContext(makeLinkedContext(), walletPort);
      const result = await tool.execute({}, ctx);
      expect(result.success).toBe(false);
      expect(result.output).toContain('Network timeout');
    });
  });

  // ── Parameter handling ───────────────────────────────────────────────────

  describe('parameter handling', () => {
    it('accepts an optional currency parameter without error', async () => {
      const ctx = makeContext(makeUnlinkedContext());
      const result = await tool.execute({ currency: 'JMD' }, ctx);
      expect(result.success).toBe(false); // fails on unlinked, not on bad params
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
      const ctx = makeContext(makeUnlinkedContext());
      const result = await tool.execute({}, ctx);
      expect(result.success).toBe(false);
      expect(result.signal).toBe('continue');
    });
  });
});
