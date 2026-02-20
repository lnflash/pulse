/**
 * GetKYCStatus — get the user's KYC verification status and limits.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

/** Human-readable info per KYC tier. */
interface TierInfo {
  label: string;
  limits: string;
  next: string;
}

const TIER_INFO: Record<number, TierInfo> = {
  0: {
    label: 'Unverified',
    limits: 'Verification is required before you can send or receive payments.',
    next: 'Complete basic ID verification to unlock Tier 1 and standard limits.',
  },
  1: {
    label: 'Basic Verified',
    limits: 'Standard transaction limits apply.',
    next: 'Submit full identity documents to reach Tier 2 and unlock higher limits.',
  },
  2: {
    label: 'Fully Verified',
    limits: 'Maximum transaction limits — all features are unlocked.',
    next: 'You have achieved the highest KYC level. No further action required.',
  },
};

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
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const { identity } = context.userContext;

    if (!identity.accountLinked) {
      return this.fail(
        'No Flash account is linked. Please link your account first to check KYC status.',
      );
    }

    const kycTier: number = identity.kycTier;
    const info: TierInfo = TIER_INFO[kycTier] ?? TIER_INFO[0]!;

    const output = [
      `🔐 KYC Status: Tier ${kycTier}/2 — ${info.label}`,
      `📊 Limits: ${info.limits}`,
      `➡️  ${info.next}`,
    ].join('\n');

    return this.complete(output, {
      kycTier,
      label: info.label,
      accountId: identity.flashAccountId ?? null,
      flashUsername: identity.flashUsername ?? null,
    });
  }
}
