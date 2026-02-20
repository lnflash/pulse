/**
 * GetDailySummary — merchant tool to get daily sales summary.
 * Stub — full implementation in a later sprint.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class GetDailySummary extends BaseTool {
  readonly name = 'get_daily_summary';
  readonly description =
    "Get a merchant's daily sales summary including total revenue, transaction count, and average transaction size.";
  readonly category = 'merchant' as const;
  readonly requiresAuth = true;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'Date in YYYY-MM-DD format. Defaults to today.' },
    },
    required: [],
  };

  async execute(
    _params: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    throw new Error('Not implemented: GetDailySummary — merchant tools planned for Week 6.');
  }
}
