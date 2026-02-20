/**
 * ContextBuilder — fluent builder for constructing UserContext in tests and onboarding flows.
 */

import { type UserContext, UserContextSchema, createDefaultContext } from './UserContext.js';

/**
 * Fluent builder for UserContext.
 *
 * Useful in tests and onboarding flows where you need to construct
 * a context with specific fields set.
 *
 * ```typescript
 * const ctx = new ContextBuilder('sha256hash...')
 *   .withLinkedAccount('alice', 'acc-123')
 *   .withMerchant('Alice\'s Shop', 'merchant-456')
 *   .withCountry('JM')
 *   .build();
 * ```
 */
export class ContextBuilder {
  private context: UserContext;

  constructor(phoneHash: string, phoneNumber?: string) {
    this.context = createDefaultContext(phoneHash, {
      identity: { phoneHash, phoneNumber, accountLinked: false, kycTier: 0 },
    });
  }

  /** Set the phone number. */
  withPhoneNumber(phoneNumber: string): this {
    this.context.identity.phoneNumber = phoneNumber;
    return this;
  }

  /** Mark the account as linked to a Flash account. */
  withLinkedAccount(username: string, accountId: string): this {
    this.context.identity.accountLinked = true;
    this.context.identity.flashUsername = username;
    this.context.identity.flashAccountId = accountId;
    return this;
  }

  /** Set the KYC tier. */
  withKycTier(tier: 0 | 1 | 2): this {
    this.context.identity.kycTier = tier;
    return this;
  }

  /** Set the country code. */
  withCountry(countryCode: string): this {
    this.context.identity.countryCode = countryCode;
    return this;
  }

  /** Set the preferred currency. */
  withPreferredCurrency(currency: string): this {
    this.context.understanding.preferredCurrency = currency;
    return this;
  }

  /** Set the dialect. */
  withDialect(dialect: string, confidence?: number): this {
    this.context.understanding.dialect = dialect;
    if (confidence !== undefined) {
      this.context.understanding.dialectConfidence = confidence;
    }
    return this;
  }

  /** Mark the user as a merchant. */
  withMerchant(businessName: string, merchantId: string): this {
    this.context.financial.isMerchant = true;
    this.context.financial.merchantDetails = {
      businessName,
      merchantId,
      defaultInvoiceExpirySecs: 3600,
    };
    return this;
  }

  /** Set the display name. */
  withDisplayName(name: string): this {
    this.context.identity.displayName = name;
    return this;
  }

  /** Set whether the user is in a sandbox environment. */
  withSandbox(isSandbox: boolean): this {
    this.context.meta.isSandbox = isSandbox;
    return this;
  }

  /** Build and validate the final UserContext. */
  build(): UserContext {
    return UserContextSchema.parse(this.context);
  }
}
