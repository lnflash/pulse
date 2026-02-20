/**
 * IssueRefund — merchant tool to issue a refund for a transaction.
 * Stub — full implementation in a later sprint.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class IssueRefund extends BaseTool {
  readonly name = 'issue_refund';
  readonly description =
    'Issue a refund for a previous payment. Merchant-only tool.';
  readonly category = 'merchant' as const;
  readonly requiresAuth = true;
  readonly requiresConfirmation = true;

  readonly parameters = {
    type: 'object',
    properties: {
      transactionId: { type: 'string', description: 'The original transaction ID to refund.' },
      amount: {
        type: 'object',
        description: 'Partial refund amount. Omit for full refund.',
        properties: {
          value: { type: 'number' },
          currency: { type: 'string' },
        },
      },
      reason: { type: 'string', description: 'Reason for the refund.' },
    },
    required: ['transactionId'],
  };

  async execute(
    _params: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    throw new Error('Not implemented: IssueRefund — merchant tools planned for Week 6.');
  }
}
