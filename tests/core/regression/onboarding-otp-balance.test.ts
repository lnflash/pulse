/**
 * Regression test: onboarding → OTP → balance → repeat balance
 *
 * Covers the P0 session persistence bug (pulse#38) and wallet adapter injection
 * (pulse#40). Both blockers must be fixed for this suite to pass.
 *
 * Test philosophy:
 *   - Test behavior, not implementation. Verify observable outcomes.
 *   - Use real ContextManager, real ToolRegistry, real CheckBalance/GetAccountStatus.
 *   - Mock only external I/O: AI provider, Flash API, context stores.
 *   - Each test section maps to one step in the happy path.
 *
 * If this test regresses, session persistence or adapter injection is broken.
 */

// ---------------------------------------------------------------------------
// Mocks (must be before imports)
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/logger', () => ({
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

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { ToolRegistry } from '../../../src/core/agent/ToolRegistry';
import { ContextManager } from '../../../src/core/context/ContextManager';
import { createDefaultContext, patchContext } from '../../../src/core/context/UserContext';
import { CheckBalance } from '../../../src/core/tools/wallet/CheckBalance';
import { GetAccountStatus } from '../../../src/core/tools/identity/GetAccountStatus';
import { MockWalletPort, makeBalance } from '../../mocks/MockWalletPort';
import { MockContextStore } from '../../mocks/MockContextStore';
import type { ToolExecutionContext } from '../../../src/core/tools/Tool';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PHONE = '+18765551234';
const PHONE_HASH = ContextManager.hashPhone(PHONE);
const ACCOUNT_ID = 'acct-jabs-001';
const AUTH_TOKEN = 'test-bearer-token-xyz';
const BALANCE_CENTS = 2303; // $23.03

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLinkedContext() {
  return createDefaultContext(PHONE_HASH, {
    identity: {
      phoneHash: PHONE_HASH,
      phoneNumber: PHONE,
      accountLinked: true,
      flashAccountId: ACCOUNT_ID,
      authToken: AUTH_TOKEN,
      flashUsername: 'jabs',
      kycTier: 1,
    },
  });
}

function makeUnlinkedContext() {
  return createDefaultContext(PHONE_HASH, {
    identity: {
      phoneHash: PHONE_HASH,
      phoneNumber: PHONE,
    },
  });
}

function makeExecContext(
  walletPort: MockWalletPort,
  userContext = makeLinkedContext(),
): ToolExecutionContext {
  return {
    userContext,
    updateContext: jest.fn(),
    requestId: 'req-regression-001',
    walletPort: walletPort as unknown as import('../../../src/ports/WalletPort').WalletPort,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Regression: onboarding → OTP → balance → repeat balance', () => {
  let walletPort: MockWalletPort;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    walletPort = new MockWalletPort();
    walletPort.setSimpleBalance(ACCOUNT_ID, BALANCE_CENTS, 'USD');
    // Support setAuthToken call from CheckBalance
    (walletPort as unknown as Record<string, unknown>)['setAuthToken'] = jest.fn();

    toolRegistry = new ToolRegistry();
    toolRegistry.register(new CheckBalance());
    toolRegistry.register(new GetAccountStatus());
  });

  // ── Step 1: Unlinked user — wallet tools NOT available ───────────────────

  describe('Step 1: unlinked user — wallet tools filtered out', () => {
    it('check_balance is not available to unlinked users', () => {
      const tools = toolRegistry.getToolsForUser(makeUnlinkedContext());
      expect(tools.map((t) => t.name)).not.toContain('check_balance');
    });

    it('get_account_status is available without auth', () => {
      const tools = toolRegistry.getToolsForUser(makeUnlinkedContext());
      expect(tools.map((t) => t.name)).toContain('get_account_status');
    });

    it('get_account_status reports unlinked state', async () => {
      const tool = new GetAccountStatus();
      const ctx = makeExecContext(walletPort, makeUnlinkedContext());
      const result = await tool.execute({}, ctx);
      expect(result.output).toContain('not yet linked');
      expect(result.data?.['linked']).toBe(false);
    });
  });

  // ── Step 2: OTP success — context updated correctly ──────────────────────

  describe('Step 2: OTP success — authToken + accountLinked stored in context', () => {
    it('patchContext preserves authToken after OTP verification', () => {
      const unlinked = makeUnlinkedContext();
      const afterOtp = patchContext(unlinked, {
        identity: {
          ...unlinked.identity,
          accountLinked: true,
          flashAccountId: ACCOUNT_ID,
          authToken: AUTH_TOKEN,
          flashUsername: 'jabs',
        },
      });

      expect(afterOtp.identity.accountLinked).toBe(true);
      expect(afterOtp.identity.authToken).toBe(AUTH_TOKEN);
      expect(afterOtp.identity.flashAccountId).toBe(ACCOUNT_ID);
    });

    it('context round-trip through UserContextSchema preserves authToken', () => {
      const linked = makeLinkedContext();
      expect(linked.identity.authToken).toBe(AUTH_TOKEN);
      expect(linked.identity.accountLinked).toBe(true);
    });
  });

  // ── Step 3: Balance check — CORE REGRESSION ──────────────────────────────

  describe('Step 3: check_balance available and working for linked user', () => {
    it('check_balance is available once accountLinked=true', () => {
      const tools = toolRegistry.getToolsForUser(makeLinkedContext());
      expect(tools.map((t) => t.name)).toContain('check_balance');
    });

    it('check_balance calls walletPort.getBalance with correct accountId', async () => {
      const getBalanceSpy = jest.spyOn(walletPort, 'getBalance');
      const tool = new CheckBalance();
      const ctx = makeExecContext(walletPort);

      await tool.execute({}, ctx);

      expect(getBalanceSpy).toHaveBeenCalledWith(ACCOUNT_ID);
    });

    it('check_balance returns balance data (not a re-link error)', async () => {
      const tool = new CheckBalance();
      const ctx = makeExecContext(walletPort);

      const result = await tool.execute({}, ctx);

      expect(result.success).toBe(true);
      expect(result.output).toContain('23.03');
      expect(result.output).toContain(ACCOUNT_ID);
      expect(result.data?.['availableCents']).toBe(BALANCE_CENTS);
    });

    it('check_balance fails gracefully without auth token', async () => {
      const tool = new CheckBalance();
      const noTokenCtx = createDefaultContext(PHONE_HASH, {
        identity: {
          phoneHash: PHONE_HASH,
          accountLinked: true,
          flashAccountId: ACCOUNT_ID,
          kycTier: 1,
          // NO authToken
        },
      });
      const ctx = makeExecContext(walletPort, noTokenCtx);

      const result = await tool.execute({}, ctx);
      expect(result.success).toBe(false);
      expect(result.output).toContain('auth token');
    });

    it('check_balance registers authToken with walletPort before calling getBalance', async () => {
      const setAuthTokenSpy = jest.fn();
      (walletPort as unknown as Record<string, unknown>)['setAuthToken'] = setAuthTokenSpy;

      const tool = new CheckBalance();
      const ctx = makeExecContext(walletPort);

      await tool.execute({}, ctx);

      expect(setAuthTokenSpy).toHaveBeenCalledWith(ACCOUNT_ID, AUTH_TOKEN);
    });
  });

  // ── Step 4: Session persistence — context survives save/load ─────────────

  describe('Step 4: session persistence — context survives across turns', () => {
    let contextStore: MockContextStore;
    let contextManager: ContextManager;

    beforeEach(() => {
      contextStore = new MockContextStore();
      contextManager = new ContextManager(contextStore, contextStore);
    });

    it('linked context persists correctly via saveContext/loadContext', async () => {
      const linked = makeLinkedContext();
      await contextManager.saveContext(linked);

      const reloaded = await contextManager.loadContext(PHONE_HASH);
      expect(reloaded.identity.accountLinked).toBe(true);
      expect(reloaded.identity.authToken).toBe(AUTH_TOKEN);
      expect(reloaded.identity.flashAccountId).toBe(ACCOUNT_ID);
    });

    it('save(phone)/load(phone) round-trip preserves linked state', async () => {
      const linked = makeLinkedContext();
      await contextManager.save(PHONE, linked);

      const reloaded = await contextManager.load(PHONE);
      expect(reloaded.identity.accountLinked).toBe(true);
      expect(reloaded.identity.authToken).toBe(AUTH_TOKEN);
    });

    it('wallet tools available after context round-trip through store', async () => {
      await contextManager.saveContext(makeLinkedContext());
      const reloaded = await contextManager.loadContext(PHONE_HASH);

      const tools = toolRegistry.getToolsForUser(reloaded);
      expect(tools.map((t) => t.name)).toContain('check_balance');
    });

    it('authToken survives 3 save/load cycles', async () => {
      await contextManager.saveContext(makeLinkedContext());
      const r1 = await contextManager.loadContext(PHONE_HASH);
      await contextManager.saveContext(r1);
      const r2 = await contextManager.loadContext(PHONE_HASH);
      await contextManager.saveContext(r2);
      const r3 = await contextManager.loadContext(PHONE_HASH);

      expect(r3.identity.accountLinked).toBe(true);
      expect(r3.identity.authToken).toBe(AUTH_TOKEN);
    });

    it('second balance check uses same linked context as first', async () => {
      await contextManager.saveContext(makeLinkedContext());

      // Turn 3: first balance check
      const ctx3 = await contextManager.loadContext(PHONE_HASH);
      const tool = new CheckBalance();
      const result3 = await tool.execute({}, makeExecContext(walletPort, ctx3));
      expect(result3.success).toBe(true);

      // Turn 4: second balance check — same context
      const ctx4 = await contextManager.loadContext(PHONE_HASH);
      const result4 = await tool.execute({}, makeExecContext(walletPort, ctx4));
      expect(result4.success).toBe(true);
      expect(result4.data?.['availableCents']).toBe(BALANCE_CENTS);
    });
  });

  // ── Step 5: Resilience — memCache survives store write failure ────────────

  describe('Step 5: session resilience when store write fails', () => {
    it('memCache holds linked context even when cold store write fails', async () => {
      // Use separate stores so we can fail only the cold store
      const hotStore = new MockContextStore();
      const coldStore = new MockContextStore();
      const mgr = new ContextManager(hotStore, coldStore);

      const linked = makeLinkedContext();

      // Fail the cold store (authoritative) write
      coldStore.failOnSave();

      // Save throws because cold store failed
      let threw = false;
      try {
        await mgr.saveContext(linked);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);

      // Load should return from memCache — NOT a new default context
      const reloaded = await mgr.loadContext(PHONE_HASH);
      expect(reloaded.identity.accountLinked).toBe(true);
      expect(reloaded.identity.authToken).toBe(AUTH_TOKEN);
    });

    it('new user is NOT returned when memCache has linked context', async () => {
      const store = new MockContextStore();
      const mgr = new ContextManager(store, store);

      // Save succeeds — populates memCache
      await mgr.saveContext(makeLinkedContext());

      // Now break the store
      store.failOnLoad();

      // loadContext should return memCache, not fall through to create default
      const reloaded = await mgr.loadContext(PHONE_HASH);
      expect(reloaded.identity.accountLinked).toBe(true);
    });
  });
});
