/**
 * SendPayment — send a Lightning payment from the user's Flash wallet.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class SendPayment extends BaseTool {
  readonly name = 'send_payment';
  readonly description =
    'Send a payment to a recipient via Lightning Network. ' +
    'Accepts a Flash username, phone number, Lightning address, or BOLT11 invoice. ' +
    'Always confirm amount and recipient with the user before calling this tool. ' +
    'Returns transaction confirmation details.';
  readonly category = 'wallet' as const;
  readonly requiresAuth = true;
  readonly requiresConfirmation = true;

  readonly parameters = {
    type: 'object',
    properties: {
      destination: {
        type: 'string',
        description: 'Payment destination: Flash username, phone number, Lightning address, or BOLT11 invoice.',
      },
      amount: {
        type: 'object',
        description: 'Amount to send. Omit if paying a fixed-amount invoice.',
        properties: {
          value: { type: 'number', description: 'Numeric amount.' },
          currency: { type: 'string', description: "Currency code, e.g. 'USD', 'JMD', 'SAT'." },
        },
        required: ['value', 'currency'],
      },
      memo: {
        type: 'string',
        description: 'Optional payment note or memo.',
      },
    },
    required: ['destination'],
  };

  async execute(
    _params: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    throw new Error('WalletPort not injected. SendPayment requires a WalletPort adapter.');
  }
}
