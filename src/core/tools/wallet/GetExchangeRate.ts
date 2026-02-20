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
    _params: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    throw new Error('WalletPort not injected. GetExchangeRate requires a WalletPort adapter.');
  }
}
