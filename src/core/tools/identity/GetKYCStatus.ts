/**
 * GetKYCStatus — get the user's KYC verification status and limits.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class GetKYCStatus extends BaseTool {
  readonly name = 'get_kyc_status';
  readonly description =
    "Get the user's KYC (Know Your Customer) verification status and their current transaction limits. " +
    'Higher KYC tiers unlock higher transaction limits.';
  readonly category = 'identity' as const;
  readonly requiresAuth = true;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {},
    required: [],
  };

  async execute(
    _params: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    throw new Error('Identity service not injected. GetKYCStatus requires an identity adapter.');
  }
}
