/**
 * GetMerchantStats — merchant analytics and statistics.
 * Stub — full implementation in a later sprint.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class GetMerchantStats extends BaseTool {
  readonly name = 'get_merchant_stats';
  readonly description =
    "Get aggregate merchant analytics: revenue trends, top customers, busiest hours, and more.";
  readonly category = 'merchant' as const;
  readonly requiresAuth = true;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        enum: ['day', 'week', 'month', 'year'],
        description: 'Time period for the statistics.',
      },
    },
    required: [],
  };

  async execute(
    _params: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    throw new Error('Not implemented: GetMerchantStats — merchant tools planned for Week 6.');
  }
}
