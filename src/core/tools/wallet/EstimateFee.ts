/**
 * EstimateFee — estimate the network fee before sending a payment.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class EstimateFee extends BaseTool {
  readonly name = 'estimate_fee';
  readonly description =
    'Estimate the Lightning Network fee for a proposed payment before sending. ' +
    "Returns low/medium/high fee estimates. Always check fees before large payments. " +
    'Fees are typically very small for Lightning payments.';
  readonly category = 'wallet' as const;
  readonly requiresAuth = true;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      destination: {
        type: 'string',
        description: 'Payment destination: BOLT11 invoice, Lightning address, or Flash username.',
      },
      amount: {
        type: 'object',
        description: 'Amount to send (required if destination is not a fixed-amount invoice).',
        properties: {
          value: { type: 'number', description: 'Numeric amount.' },
          currency: { type: 'string', description: "Currency code." },
        },
        required: ['value', 'currency'],
      },
    },
    required: ['destination'],
  };

  async execute(
    _params: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    throw new Error('WalletPort not injected. EstimateFee requires a WalletPort adapter.');
  }
}
