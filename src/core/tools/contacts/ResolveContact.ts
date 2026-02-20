/**
 * ResolveContact — resolve a human-readable identifier to a payable destination.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

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

    // Check saved contacts first (case-insensitive)
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

    // Fall through to WalletPort resolution (not yet implemented)
    throw new Error('WalletPort not injected. ResolveContact requires a WalletPort adapter for directory lookup.');
  }
}
