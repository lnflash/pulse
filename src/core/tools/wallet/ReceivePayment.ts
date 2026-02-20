/**
 * ReceivePayment — generate a Lightning invoice to receive payment.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class ReceivePayment extends BaseTool {
  readonly name = 'receive_payment';
  readonly description =
    'Generate a Lightning invoice so the user can receive a payment. ' +
    'Returns a BOLT11 invoice string and a QR-code friendly short link. ' +
    'Amount can be fixed or open (any amount).';
  readonly category = 'wallet' as const;
  readonly requiresAuth = true;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      amount: {
        type: 'object',
        description: "Amount to request. Omit for an open-amount invoice.",
        properties: {
          value: { type: 'number', description: 'Numeric amount.' },
          currency: { type: 'string', description: "Currency code, e.g. 'USD', 'SAT'." },
        },
        required: ['value', 'currency'],
      },
      description: {
        type: 'string',
        description: 'Payment description shown to the payer.',
      },
      expiryMinutes: {
        type: 'number',
        description: 'How many minutes until the invoice expires. Default: 60.',
      },
    },
    required: [],
  };

  async execute(
    _params: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    throw new Error('WalletPort not injected. ReceivePayment requires a WalletPort adapter.');
  }
}
