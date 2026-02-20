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
    const { userContext } = context;
    const accountId = userContext.identity.flashAccountId;

    if (!accountId) {
      return this.fail('No Flash account ID found. Account may not be fully linked.');
    }

    // WalletPort is injected at runtime by the Orchestrator via DI
    // For now, return a not-implemented error that signals the adapter is missing
    throw new Error('WalletPort not injected. CheckBalance requires a WalletPort adapter.');
  }
}
