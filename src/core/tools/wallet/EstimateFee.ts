/**
 * EstimateFee — estimate the network fee before sending a payment.
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
    params: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const { userContext, walletPort } = context;
    const accountId = userContext.identity.flashAccountId;

    if (!accountId) {
      return this.fail('No Flash account ID found. Account may not be fully linked.');
    }

    if (accountId) registerToken(context, accountId);

    const destination = params['destination'] as string | undefined;
    if (!destination) return this.fail('Destination is required.');

    const amountParam = params['amount'] as { value: number; currency: string } | undefined;
    const amount: Money = amountParam
      ? {
          amountCents: Math.round(amountParam.value * 100),
          currency: amountParam.currency,
          display: `${amountParam.value} ${amountParam.currency}`,
        }
      : { amountCents: 0, currency: 'SAT', display: '0 SAT' };

    try {
      const estimate = await walletPort.estimateFee(destination, amount);

      return this.success(
        [
          'Fee estimates:',
          `  Low:    ${estimate.low.display}`,
          `  Medium: ${estimate.medium.display} (recommended)`,
          `  High:   ${estimate.high.display}`,
          `  Est. settlement time: ~${Math.round(estimate.estimatedSettlementSeconds / 60)} min`,
        ].join('\n'),
        {
          lowCents: estimate.low.amountCents,
          mediumCents: estimate.medium.amountCents,
          highCents: estimate.high.amountCents,
          currency: estimate.medium.currency,
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.fail(`Failed to estimate fee: ${message}`);
    }
  }
}
