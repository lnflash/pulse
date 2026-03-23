/**
 * GetExchangeRate — get the current exchange rate between two currencies.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class GetExchangeRate extends BaseTool {
  readonly name = 'get_exchange_rate';
  readonly description =
    'Get the current exchange rate between two currencies. ' +
    'Supports fiat currencies (USD, JMD, TTD, BBD, etc.) and Bitcoin/Satoshis. ' +
    'Use this before quoting amounts to users to show accurate local currency values.';
  readonly category = 'wallet' as const;
  readonly requiresAuth = false;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        description: "Source currency code, e.g. 'USD', 'SAT', 'BTC'.",
      },
      to: {
        type: 'string',
        description: "Target currency code, e.g. 'JMD', 'TTD', 'USD'.",
      },
    },
    required: ['from', 'to'],
  };

  async execute(
    params: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const { walletPort } = context;
    const from = params['from'] as string | undefined;
    const to = params['to'] as string | undefined;

    if (!from || !to) {
      return this.fail("Both 'from' and 'to' currency codes are required.");
    }

    try {
      const rate = await walletPort.getExchangeRate(from, to);

      return this.success(
        `Exchange rate: 1 ${rate.from} = ${rate.rate.toFixed(6)} ${rate.to}\n` +
          `  Effective rate (incl. fees): ${rate.effectiveRate.toFixed(6)} ${rate.to}\n` +
          `  Valid for: ${rate.validForSeconds}s`,
        {
          from: rate.from,
          to: rate.to,
          rate: rate.rate,
          effectiveRate: rate.effectiveRate,
          timestamp: rate.timestamp.toISOString(),
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.fail(`Failed to fetch exchange rate: ${message}`);
    }
  }
}
