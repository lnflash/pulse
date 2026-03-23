/**
 * GetTransactionHistory — retrieve recent transactions from the user's wallet.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

function registerToken(context: ToolExecutionContext, accountId: string): void {
  const { authToken } = context.userContext.identity;
  if (authToken && 'setAuthToken' in context.walletPort) {
    (context.walletPort as unknown as { setAuthToken(id: string, tok: string): void })
      .setAuthToken(accountId, authToken);
  }
}

export class GetTransactionHistory extends BaseTool {
  readonly name = 'get_transaction_history';
  readonly description =
    "Retrieve a list of recent transactions from the user's Flash wallet. " +
    'Can be filtered by direction (sent/received), date range, or type. ' +
    'Returns transaction amounts, dates, counterparties, and status.';
  readonly category = 'wallet' as const;
  readonly requiresAuth = true;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of transactions to return. Default: 10, max: 50.',
      },
      direction: {
        type: 'string',
        enum: ['credit', 'debit'],
        description: "Filter by direction: 'credit' (received) or 'debit' (sent).",
      },
      fromDate: {
        type: 'string',
        description: 'Start date in ISO 8601 format (YYYY-MM-DD).',
      },
      toDate: {
        type: 'string',
        description: 'End date in ISO 8601 format (YYYY-MM-DD).',
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

    if (!accountId) {
      return this.fail('No Flash account ID found. Account may not be fully linked.');
    }
    if (!userContext.identity.authToken) {
      return this.fail('No auth token found. Please link your Flash account first.');
    }

    registerToken(context, accountId);

    const limit = Math.min(Number(params['limit'] ?? 10), 50);
    const direction = params['direction'] as 'credit' | 'debit' | undefined;
    const from = params['fromDate'] ? new Date(params['fromDate'] as string) : undefined;
    const to = params['toDate'] ? new Date(params['toDate'] as string) : undefined;

    try {
      const history = await walletPort.getTransactionHistory({
        accountId,
        limit,
        direction,
        from,
        to,
      });

      if (history.transactions.length === 0) {
        return this.success('No transactions found matching your criteria.');
      }

      const lines = history.transactions.map((tx) => {
        const arrow = tx.direction === 'credit' ? '↓ Received' : '↑ Sent';
        const counterparty = tx.counterparty ? ` ${tx.direction === 'credit' ? 'from' : 'to'} ${tx.counterparty}` : '';
        const date = tx.createdAt.toLocaleDateString();
        return `${arrow} ${tx.amount.display}${counterparty} — ${tx.status} (${date})`;
      });

      return this.success(
        `Last ${history.transactions.length} transaction(s):\n${lines.join('\n')}`,
        { count: history.transactions.length },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.fail(`Failed to fetch transactions: ${message}`);
    }
  }
}
