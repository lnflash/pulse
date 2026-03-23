/**
 * SendPayment — send a Lightning payment from the user's Flash wallet.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';
import type { Money } from '../../../ports/WalletPort.js';
import { v4 as uuidv4 } from 'uuid';

function registerToken(context: ToolExecutionContext, accountId: string): void {
  const { authToken } = context.userContext.identity;
  if (authToken && 'setAuthToken' in context.walletPort) {
    (context.walletPort as unknown as { setAuthToken(id: string, tok: string): void })
      .setAuthToken(accountId, authToken);
  }
}

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

    const destination = params['destination'] as string | undefined;
    if (!destination) {
      return this.fail('Destination is required.');
    }

    const amountParam = params['amount'] as { value: number; currency: string } | undefined;
    const memo = params['memo'] as string | undefined;

    let amount: Money | undefined;
    if (amountParam) {
      const amountCents = Math.round(amountParam.value * 100);
      amount = {
        amountCents,
        currency: amountParam.currency,
        display: `${amountParam.value} ${amountParam.currency}`,
      };
    }

    try {
      const result = await walletPort.sendPayment({
        fromAccountId: accountId,
        destination,
        amount,
        memo,
        idempotencyKey: uuidv4(),
      });

      return this.complete(
        [
          '✅ Payment sent successfully!',
          `  Amount: ${result.amountSent.display}`,
          `  Fee: ${result.fee.display}`,
          `  To: ${result.destinationDisplay}`,
          `  Transaction ID: ${result.transactionId}`,
          `  Settled: ${result.settledAt.toISOString()}`,
        ].join('\n'),
        {
          transactionId: result.transactionId,
          amountCents: result.amountSent.amountCents,
          currency: result.amountSent.currency,
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.fail(`Payment failed: ${message}`);
    }
  }
}
