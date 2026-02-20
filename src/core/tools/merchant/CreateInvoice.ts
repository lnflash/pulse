/**
 * CreateInvoice — merchant tool to create a payment invoice.
 * Stub — full implementation in a later sprint.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class CreateInvoice extends BaseTool {
  readonly name = 'create_invoice';
  readonly description =
    'Create a payment invoice for a merchant to share with customers. ' +
    'Generates a Lightning invoice with optional description and amount.';
  readonly category = 'merchant' as const;
  readonly requiresAuth = true;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      amount: {
        type: 'object',
        properties: {
          value: { type: 'number' },
          currency: { type: 'string' },
        },
        required: ['value', 'currency'],
      },
      description: { type: 'string', description: 'Invoice description shown to payer.' },
      expiryMinutes: { type: 'number', description: 'Invoice expiry in minutes. Default: 60.' },
    },
    required: ['amount'],
  };

  async execute(
    _params: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    throw new Error('Not implemented: CreateInvoice — merchant tools planned for Week 6.');
  }
}
