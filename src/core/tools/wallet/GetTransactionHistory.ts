/**
 * GetTransactionHistory — retrieve recent transactions from the user's wallet.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

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
    _params: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    throw new Error('WalletPort not injected. GetTransactionHistory requires a WalletPort adapter.');
  }
}
