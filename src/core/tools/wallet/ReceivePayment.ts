/**
 * ReceivePayment — generate a Lightning invoice to receive payment.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';
import type { Money } from '../../../ports/WalletPort.js';

function registerToken(context: ToolExecutionContext, accountId: string): void {
  const { authToken } = context.userContext.identity;
  if (authToken && 'setAuthToken' in context.walletPort) {
    (context.walletPort as unknown as { setAuthToken(id: string, tok: string): void })
      .setAuthToken(accountId, authToken);
  }
}

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

    const amountParam = params['amount'] as { value: number; currency: string } | undefined;
    const description = params['description'] as string | undefined;
    const expiryMinutes = Number(params['expiryMinutes'] ?? 60);

    let amount: Money | undefined;
    if (amountParam) {
      amount = {
        amountCents: Math.round(amountParam.value * 100),
        currency: amountParam.currency,
        display: `${amountParam.value} ${amountParam.currency}`,
      };
    }

    try {
      const invoice = await walletPort.createInvoice({
        accountId,
        amount,
        description,
        expirySeconds: expiryMinutes * 60,
      });

      const lines = [
        amount
          ? `✅ Invoice created for ${amount.display}:`
          : '✅ Open-amount invoice created:',
        `  Payment request: ${invoice.paymentRequest}`,
        `  Expires: ${invoice.expiresAt.toISOString()}`,
      ];

      if (description) {
        lines.push(`  Description: ${description}`);
      }

      return this.success(lines.join('\n'), {
        paymentRequest: invoice.paymentRequest,
        paymentHash: invoice.paymentHash,
        expiresAt: invoice.expiresAt.toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.fail(`Failed to create invoice: ${message}`);
    }
  }
}
