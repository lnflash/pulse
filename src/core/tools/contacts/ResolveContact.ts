/**
 * ResolveContact — resolve a human-readable identifier to a payable destination.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

/** Minimal shape of the accountDefaultWallet query response. */
interface AccountDefaultWalletResponse {
  data?: {
    accountDefaultWallet?: {
      id: string;
      walletCurrency?: string;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

const FLASH_API_URL = process.env['FLASH_API_URL'] ?? 'https://api.flashapp.me';
const FLASH_API_TIMEOUT_MS = Number(process.env['FLASH_API_TIMEOUT_MS'] ?? 10_000);

const ACCOUNT_DEFAULT_WALLET_QUERY = `
  query accountDefaultWallet($username: Username!) {
    accountDefaultWallet(username: $username) {
      id
      walletCurrency
    }
  }
`;

/** Returns true if the string looks like a phone number (E.164 or digits-only). */
function looksLikePhone(s: string): boolean {
  return /^\+?\d{7,15}$/.test(s.replace(/[\s\-().]/g, ''));
}

export class ResolveContact extends BaseTool {
  readonly name = 'resolve_contact';
  readonly description =
    "Resolve a name, alias, or phone number to a payable destination (Flash username or Lightning address). " +
    "First checks the user's saved contacts, then queries the Flash directory. " +
    "Use this before attempting a payment when the destination is ambiguous.";
  readonly category = 'contacts' as const;
  readonly requiresAuth = false;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: "Name, alias, phone number, or partial Flash username to look up.",
      },
    },
    required: ['query'],
  };

  async execute(
    params: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const query = String(params['query'] ?? '').trim();
    if (!query) {
      return this.fail('No contact query provided.');
    }

    const { userContext } = context;
    const savedContacts = userContext.financial.savedContacts ?? [];

    // ── Step 1: Check saved contacts first (case-insensitive) ────────────────
    const lowerQuery = query.toLowerCase();
    const match = savedContacts.find(
      (c) =>
        c.alias.toLowerCase().includes(lowerQuery) ||
        c.flashUsername?.toLowerCase() === lowerQuery ||
        c.phoneNumber === query,
    );

    if (match) {
      const destination = match.lightningAddress ?? match.flashUsername ?? match.phoneNumber;
      return this.success(
        `Found saved contact "${match.alias}": destination is ${destination}`,
        { contact: match },
      );
    }

    // ── Step 2: If it looks like a phone number, we can't resolve via Flash ──
    if (looksLikePhone(query)) {
      return this.fail(
        `No saved contact found with phone number "${query}". ` +
          'You can add them with the add_contact tool, or ask them for their Flash username.',
      );
    }

    // ── Step 3: Try Flash API username lookup ─────────────────────────────────
    // Strip leading @ if the user typed @username
    const username = query.startsWith('@') ? query.slice(1) : query;

    try {
      const response = await fetch(`${FLASH_API_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: ACCOUNT_DEFAULT_WALLET_QUERY,
          variables: { username },
        }),
        signal: AbortSignal.timeout(FLASH_API_TIMEOUT_MS),
      });

      if (response.ok) {
        const json = (await response.json()) as AccountDefaultWalletResponse;
        const wallet = json.data?.accountDefaultWallet;

        if (wallet?.id) {
          return this.success(
            `Found Flash user "@${username}" with wallet ID ${wallet.id} (${wallet.walletCurrency ?? 'BTC'}).`,
            {
              flashUsername: username,
              walletId: wallet.id,
              walletCurrency: wallet.walletCurrency ?? 'BTC',
            },
          );
        }
      }
    } catch {
      // Network or timeout — fall through to not-found response
    }

    return this.fail(
      `Could not find anyone matching "${query}" in your contacts or on Flash. ` +
        'Double-check the name or username and try again.',
    );
  }
}
