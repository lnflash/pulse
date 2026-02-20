/**
 * GetAccountStatus — get the user's Flash account status and capabilities.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class GetAccountStatus extends BaseTool {
  readonly name = 'get_account_status';
  readonly description =
    "Get the user's current Flash account status, including whether they're linked, " +
    "their KYC tier, and which features are available to them.";
  readonly category = 'identity' as const;
  readonly requiresAuth = false;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {},
    required: [],
  };

  async execute(
    _params: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const { identity, financial } = context.userContext;

    if (!identity.accountLinked) {
      return this.complete(
        "Your WhatsApp number is not yet linked to a Flash account. " +
        "To get started, I can help you create or connect your Flash wallet.",
        { linked: false },
      );
    }

    const status = [
      `✅ Account linked: @${identity.flashUsername ?? 'unknown'}`,
      `📋 KYC tier: ${identity.kycTier}/2`,
      `💼 Account type: ${financial.isMerchant ? 'Merchant' : 'Personal'}`,
    ].join('\n');

    return this.complete(status, {
      linked: true,
      username: identity.flashUsername,
      kycTier: identity.kycTier,
      isMerchant: financial.isMerchant,
    });
  }
}
