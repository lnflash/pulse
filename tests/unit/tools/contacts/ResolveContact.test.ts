/**
 * ResolveContact tool unit tests.
 *
 * Tests alias resolution, Flash API username lookup, and not-found cases.
 * Mocks global `fetch` to avoid real HTTP calls.
 */

jest.mock('../../../../src/config/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { ResolveContact } from '../../../../src/core/tools/contacts/ResolveContact';
import { createDefaultContext } from '../../../../src/core/context/UserContext';
import type { ToolExecutionContext } from '../../../../src/core/tools/Tool';
import type { UserContext } from '../../../../src/core/context/UserContext';

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
global.fetch = mockFetch;

function mockFlashApiFound(username: string, walletId: string, walletCurrency = 'BTC') {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      data: {
        accountDefaultWallet: {
          id: walletId,
          walletCurrency,
        },
      },
    }),
  } as unknown as Response);
}

function mockFlashApiNotFound(username?: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      data: {
        accountDefaultWallet: null,
      },
    }),
  } as unknown as Response);
}

function mockFlashApiNetworkError() {
  mockFetch.mockRejectedValueOnce(new Error('Network error'));
}

function mockFlashApiHttpError(status: number) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({ errors: [{ message: 'Not found' }] }),
  } as unknown as Response);
}

// ---------------------------------------------------------------------------
// Context helpers
// ---------------------------------------------------------------------------

const PHONE_HASH = 'resolve-contact-test-hash-abc123000000000000000000000000000000000';

function makeContextWithContacts(
  contacts: UserContext['financial']['savedContacts'],
): ToolExecutionContext {
  const ctx = createDefaultContext(PHONE_HASH, {
    identity: {
      phoneHash: PHONE_HASH,
      phoneNumber: '+18765551234',
      accountLinked: true,
      kycTier: 1,
    },
  });
  const userContext: UserContext = {
    ...ctx,
    financial: {
      ...ctx.financial,
      savedContacts: contacts,
    },
  };
  return {
    userContext,
    updateContext: jest.fn(),
    requestId: 'req-resolve-001',
  };
}

function makeEmptyContext(): ToolExecutionContext {
  return makeContextWithContacts([]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResolveContact tool', () => {
  let tool: ResolveContact;

  beforeEach(() => {
    tool = new ResolveContact();
    mockFetch.mockClear();
  });

  // ── Metadata ─────────────────────────────────────────────────────────────

  describe('metadata', () => {
    it('has the correct tool name', () => {
      expect(tool.name).toBe('resolve_contact');
    });

    it('is in the contacts category', () => {
      expect(tool.category).toBe('contacts');
    });

    it('does not require authentication', () => {
      expect(tool.requiresAuth).toBe(false);
    });

    it('does not require confirmation', () => {
      expect(tool.requiresConfirmation).toBe(false);
    });

    it('has a description', () => {
      expect(tool.description).toBeTruthy();
    });

    it('requires a "query" parameter', () => {
      const params = (tool.parameters as any);
      expect(params.required).toContain('query');
    });
  });

  // ── Resolve by alias (saved contacts) ────────────────────────────────────

  describe('resolve by alias from saved contacts', () => {
    it('finds a contact by exact alias match', async () => {
      const ctx = makeContextWithContacts([
        { alias: 'Marcus', flashUsername: 'marcus123' },
      ]);

      const result = await tool.execute({ query: 'Marcus' }, ctx);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Marcus');
      expect(result.output).toContain('marcus123');
      expect(result.signal).toBe('continue');
      expect(mockFetch).not.toHaveBeenCalled(); // No API call needed
    });

    it('finds a contact by case-insensitive alias match', async () => {
      const ctx = makeContextWithContacts([
        { alias: 'Marcus', flashUsername: 'marcus123' },
      ]);

      const result = await tool.execute({ query: 'marcus' }, ctx);
      expect(result.success).toBe(true);
      expect(result.output).toContain('marcus123');
    });

    it('finds a contact by partial alias match', async () => {
      const ctx = makeContextWithContacts([
        { alias: 'Marcus Johnson', flashUsername: 'marcus.j' },
      ]);

      const result = await tool.execute({ query: 'Marcus' }, ctx);
      expect(result.success).toBe(true);
      expect(result.output).toContain('marcus.j');
    });

    it('finds a contact by flashUsername match', async () => {
      const ctx = makeContextWithContacts([
        { alias: 'Big Man', flashUsername: 'bigman99' },
      ]);

      const result = await tool.execute({ query: 'bigman99' }, ctx);
      expect(result.success).toBe(true);
      expect(result.output).toContain('bigman99');
    });

    it('finds a contact by phone number', async () => {
      const ctx = makeContextWithContacts([
        { alias: 'Keisha', phoneNumber: '+18765550001' },
      ]);

      const result = await tool.execute({ query: '+18765550001' }, ctx);
      expect(result.success).toBe(true);
      expect(result.output).toContain('Keisha');
    });

    it('returns contact data in the result', async () => {
      const ctx = makeContextWithContacts([
        { alias: 'Keisha', flashUsername: 'keisha99', lightningAddress: 'keisha@flash.me' },
      ]);

      const result = await tool.execute({ query: 'Keisha' }, ctx);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as any).contact.alias).toBe('Keisha');
    });

    it('uses lightningAddress as destination when available', async () => {
      const ctx = makeContextWithContacts([
        { alias: 'Keisha', lightningAddress: 'keisha@flash.me', flashUsername: 'keisha99' },
      ]);

      const result = await tool.execute({ query: 'Keisha' }, ctx);
      // lightningAddress takes precedence over flashUsername
      expect(result.output).toContain('keisha@flash.me');
    });

    it('uses flashUsername as destination when lightningAddress absent', async () => {
      const ctx = makeContextWithContacts([
        { alias: 'Marcus', flashUsername: 'marcus123' },
      ]);

      const result = await tool.execute({ query: 'Marcus' }, ctx);
      expect(result.output).toContain('marcus123');
    });
  });

  // ── Resolve by Flash API username ─────────────────────────────────────────

  describe('resolve by Flash API username lookup', () => {
    it('finds a Flash username via API', async () => {
      mockFlashApiFound('jamarlin', 'wallet-uuid-001');
      const ctx = makeEmptyContext();

      const result = await tool.execute({ query: 'jamarlin' }, ctx);

      expect(result.success).toBe(true);
      expect(result.output).toContain('jamarlin');
      expect(result.output).toContain('wallet-uuid-001');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('strips leading @ from username before API lookup', async () => {
      mockFlashApiFound('jamarlin', 'wallet-uuid-001');
      const ctx = makeEmptyContext();

      await tool.execute({ query: '@jamarlin' }, ctx);

      // The fetch call should use 'jamarlin', not '@jamarlin'
      const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(fetchBody.variables.username).toBe('jamarlin');
    });

    it('includes walletCurrency in the result data', async () => {
      mockFlashApiFound('keisha', 'wallet-222', 'USD');
      const ctx = makeEmptyContext();

      const result = await tool.execute({ query: 'keisha' }, ctx);
      expect((result.data as any).walletCurrency).toBe('USD');
    });

    it('defaults walletCurrency to BTC when not in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            accountDefaultWallet: { id: 'w-001' }, // no walletCurrency
          },
        }),
      } as unknown as Response);

      const ctx = makeEmptyContext();
      const result = await tool.execute({ query: 'someuser' }, ctx);
      expect((result.data as any).walletCurrency).toBe('BTC');
    });
  });

  // ── Phone number handling ─────────────────────────────────────────────────

  describe('phone number handling', () => {
    it('does not call Flash API for phone-number queries', async () => {
      const ctx = makeEmptyContext();
      const result = await tool.execute({ query: '+18765551234' }, ctx);

      expect(result.success).toBe(false);
      expect(result.output).toContain('No saved contact found');
      expect(mockFetch).not.toHaveBeenCalled(); // Phone numbers go no further
    });

    it('suggests adding to contacts for unknown phone numbers', async () => {
      const ctx = makeEmptyContext();
      const result = await tool.execute({ query: '+18765559999' }, ctx);
      expect(result.output).toContain('add');
    });
  });

  // ── Not found ────────────────────────────────────────────────────────────

  describe('contact not found', () => {
    it('returns fail when username not in contacts or Flash API', async () => {
      mockFlashApiNotFound();
      const ctx = makeEmptyContext();

      const result = await tool.execute({ query: 'unknownuser' }, ctx);

      expect(result.success).toBe(false);
      expect(result.output).toContain('Could not find');
      expect(result.output).toContain('unknownuser');
    });

    it('suggests double-checking when not found', async () => {
      mockFlashApiNotFound();
      const ctx = makeEmptyContext();
      const result = await tool.execute({ query: 'ghostuser' }, ctx);
      expect(result.output).toContain('Double-check');
    });

    it('handles Flash API returning null wallet gracefully', async () => {
      mockFlashApiNotFound();
      const ctx = makeEmptyContext();
      const result = await tool.execute({ query: 'nulluser' }, ctx);
      expect(result.success).toBe(false);
    });
  });

  // ── Error handling ────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('handles network errors gracefully (falls through to not-found)', async () => {
      mockFlashApiNetworkError();
      const ctx = makeEmptyContext();

      const result = await tool.execute({ query: 'someuser' }, ctx);

      expect(result.success).toBe(false);
      expect(result.output).toContain('Could not find');
    });

    it('handles Flash API HTTP error gracefully', async () => {
      mockFlashApiHttpError(500);
      const ctx = makeEmptyContext();

      const result = await tool.execute({ query: 'someuser' }, ctx);

      expect(result.success).toBe(false);
    });

    it('handles empty query gracefully', async () => {
      const ctx = makeEmptyContext();
      const result = await tool.execute({ query: '' }, ctx);

      expect(result.success).toBe(false);
      expect(result.output).toContain('No contact query');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles missing query param gracefully', async () => {
      const ctx = makeEmptyContext();
      const result = await tool.execute({}, ctx);

      expect(result.success).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── Signal and output format ──────────────────────────────────────────────

  describe('signal and output', () => {
    it('returns continue signal on success', async () => {
      const ctx = makeContextWithContacts([
        { alias: 'Marcus', flashUsername: 'marcus' },
      ]);
      const result = await tool.execute({ query: 'Marcus' }, ctx);
      expect(result.signal).toBe('continue');
    });

    it('returns continue signal on failure', async () => {
      mockFlashApiNotFound();
      const ctx = makeEmptyContext();
      const result = await tool.execute({ query: 'ghost' }, ctx);
      expect(result.signal).toBe('continue');
    });
  });
});
