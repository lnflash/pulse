/**
 * CheckBalance — retrieve the user's current wallet balance.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class CheckBalance extends BaseTool {
  readonly name = 'check_balance';
  readonly description =
    "Retrieve the user's current Flash wallet balance. " +
    'Returns available balance and pending amounts. ' +
    'Always fetch fresh balance — never rely on cached values for financial decisions.';
  readonly category = 'wallet' as const;
  readonly requiresAuth = true;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      currency: {
        type: 'string',
        description: "Optional currency to display balance in. E.g. 'USD', 'JMD'. Defaults to user's preferred currency.",
      },
    },
    required: [],
  };

  async execute(
    params: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const { userContext, walletPort } = context;
    const accountId = userContext.identity.flashAccountId;
    const authToken = userContext.identity.authToken;

    if (!accountId) {
      return this.fail('No Flash account ID found. Account may not be fully linked.');
    }

    if (!authToken) {
      return this.fail('No auth token found. Please link your Flash account first.');
    }

    try {
      // Register this user's auth token before querying
      // Register token so the adapter can authenticate this user's requests
      if ('setAuthToken' in walletPort) {
        (walletPort as unknown as { setAuthToken(id: string, tok: string): void }).setAuthToken(accountId, authToken);
      }

      const balance = await walletPort.getBalance(accountId);
      const { available, total, pendingOut } = balance;

      const lines: string[] = [
        `Balance for account ${accountId}:`,
        `  Available: ${available.display} ${available.currency}`,
      ];

      if (total.amountCents !== available.amountCents) {
        lines.push(`  Total (incl. pending): ${total.display} ${total.currency}`);
      }

      if (pendingOut.amountCents > 0) {
        lines.push(`  Pending outgoing: ${pendingOut.display} ${pendingOut.currency}`);
      }

      lines.push(`  As of: ${balance.asOf.toISOString()}`);

      return this.success(lines.join('\n'), {
        accountId,
        availableCents: available.amountCents,
        currency: available.currency,
        asOf: balance.asOf.toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.fail(`Failed to fetch balance: ${message}`);
    }
  }
}
