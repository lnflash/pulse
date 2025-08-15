import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlashApiService } from '../flash-api.service';
import * as bolt11 from 'bolt11';

interface InvoiceInfo {
  paymentRequest: string;
  paymentHash: string;
  amount?: number;
  memo?: string;
  expiresAt: Date;
  walletCurrency: 'BTC' | 'USD';
}

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly flashApiService: FlashApiService,
  ) {}

  /**
   * Create a Lightning invoice (USD only)
   */
  async createInvoice(
    authToken: string,
    amount?: number,
    memo?: string,
    currency: 'BTC' | 'USD' = 'USD',
  ): Promise<InvoiceInfo> {
    try {
      // Only USD invoices are supported
      if (currency === 'BTC') {
        throw new BadRequestException('BTC invoices are not currently supported');
      }

      // Determine which mutation to use based on amount
      if (!amount) {
        return await this.createNoAmountInvoice(authToken, memo);
      } else {
        return await this.createUsdInvoice(authToken, amount, memo);
      }
    } catch (error) {
      this.logger.error(`Error creating invoice: ${error.message}`, error.stack);

      // Re-throw BadRequestException with original message
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Generic error for unexpected exceptions
      throw new BadRequestException('Failed to create invoice');
    }
  }

  /**
   * Create a no-amount Lightning invoice
   */
  private async createNoAmountInvoice(authToken: string, memo?: string): Promise<InvoiceInfo> {
    const mutation = `
      mutation lnNoAmountInvoiceCreate($input: LnNoAmountInvoiceCreateInput!) {
        lnNoAmountInvoiceCreate(input: $input) {
          errors {
            code
            message
          }
          invoice {
            paymentRequest
            paymentHash
            paymentSecret
          }
        }
      }
    `;

    // For no-amount invoices, we need to use a wallet ID
    // Default to USD wallet for no-amount invoices
    const walletId = await this.getUsdWalletId(authToken);

    const variables = {
      input: {
        walletId,
        memo: memo || 'Flash Wallet Payment',
      },
    };

    const result = await this.flashApiService.executeQuery<any>(mutation, variables, authToken);

    if (result.lnNoAmountInvoiceCreate?.errors?.length > 0) {
      const error = result.lnNoAmountInvoiceCreate.errors[0];
      this.logger.error(
        `GraphQL error creating no-amount invoice: ${error.code} - ${error.message}`,
      );

      // Provide user-friendly error messages
      if (error.code === 'IBEX_ERROR') {
        throw new BadRequestException(
          'Unable to create invoice. Please try again with a shorter memo.',
        );
      }

      throw new BadRequestException(error.message || 'Failed to create invoice');
    }

    const invoice = result.lnNoAmountInvoiceCreate?.invoice;
    if (!invoice) {
      throw new BadRequestException('No invoice returned from API');
    }

    // Parse the payment request to get expiration info
    const parsedInvoice = this.parseInvoice(invoice.paymentRequest);

    return {
      paymentRequest: invoice.paymentRequest,
      paymentHash: invoice.paymentHash,
      memo:
        (parsedInvoice.tags.find((tag: any) => tag.tagName === 'description')?.data as string) ||
        memo,
      expiresAt: parsedInvoice.timeExpireDate
        ? new Date(parsedInvoice.timeExpireDate * 1000)
        : new Date(Date.now() + 3600000), // 1 hour default
      walletCurrency: 'USD', // No-amount invoices use USD wallet
    };
  }

  /**
   * Create a USD-denominated Lightning invoice
   */
  private async createUsdInvoice(
    authToken: string,
    amount: number,
    memo?: string,
  ): Promise<InvoiceInfo> {
    const mutation = `
      mutation lnUsdInvoiceCreate($input: LnUsdInvoiceCreateInput!) {
        lnUsdInvoiceCreate(input: $input) {
          errors {
            code
            message
          }
          invoice {
            paymentRequest
            paymentHash
            satoshis
          }
        }
      }
    `;

    // Convert dollars to cents
    const amountInCents = Math.round(amount * 100);

    const variables = {
      input: {
        walletId: await this.getUsdWalletId(authToken),
        amount: amountInCents,
        memo: memo || `$${amount.toFixed(2)} payment`,
      },
    };

    const result = await this.flashApiService.executeQuery<any>(mutation, variables, authToken);

    if (result.lnUsdInvoiceCreate?.errors?.length > 0) {
      const error = result.lnUsdInvoiceCreate.errors[0];
      this.logger.error(`GraphQL error creating USD invoice: ${error.code} - ${error.message}`);

      // Provide user-friendly error messages
      if (error.code === 'IBEX_ERROR') {
        throw new BadRequestException(
          'Unable to create invoice. Please try again with a shorter memo or smaller amount.',
        );
      }
      if (error.code === 'INSUFFICIENT_BALANCE') {
        throw new BadRequestException(error.message || 'Insufficient balance to create this invoice.');
      }

      throw new BadRequestException(error.message || 'Failed to create invoice');
    }

    const invoice = result.lnUsdInvoiceCreate?.invoice;
    if (!invoice) {
      throw new BadRequestException('No invoice returned from API');
    }

    // Parse the payment request to get expiration info
    const parsedInvoice = this.parseInvoice(invoice.paymentRequest);

    return {
      paymentRequest: invoice.paymentRequest,
      paymentHash: invoice.paymentHash,
      amount: amount,
      memo:
        (parsedInvoice.tags.find((tag: any) => tag.tagName === 'description')?.data as string) ||
        memo,
      expiresAt: parsedInvoice.timeExpireDate
        ? new Date(parsedInvoice.timeExpireDate * 1000)
        : new Date(Date.now() + 3600000),
      walletCurrency: 'USD',
    };
  }

  /**
   * Create a BTC-denominated Lightning invoice
   * @deprecated BTC invoices are not currently supported
   */
  private async createBtcInvoice(
    authToken: string,
    amount: number,
    memo?: string,
  ): Promise<InvoiceInfo> {
    const mutation = `
      mutation lnInvoiceCreate($input: LnInvoiceCreateInput!) {
        lnInvoiceCreate(input: $input) {
          errors {
            code
            message
          }
          invoice {
            paymentRequest
            paymentHash
            satoshis
          }
        }
      }
    `;

    // Convert BTC to satoshis
    const satoshis = Math.round(amount * 100000000);

    const variables = {
      input: {
        walletId: await this.getBtcWalletId(authToken),
        amount: satoshis,
        memo: memo || `${amount} BTC payment`,
      },
    };

    const result = await this.flashApiService.executeQuery<any>(mutation, variables, authToken);

    if (result.lnInvoiceCreate?.errors?.length > 0) {
      const error = result.lnInvoiceCreate.errors[0];
      throw new BadRequestException(error.message || 'Failed to create invoice');
    }

    const invoice = result.lnInvoiceCreate?.invoice;
    if (!invoice) {
      throw new BadRequestException('No invoice returned from API');
    }

    // Parse the payment request to get expiration info
    const parsedInvoice = this.parseInvoice(invoice.paymentRequest);

    return {
      paymentRequest: invoice.paymentRequest,
      paymentHash: invoice.paymentHash,
      amount: amount,
      memo:
        (parsedInvoice.tags.find((tag: any) => tag.tagName === 'description')?.data as string) ||
        memo,
      expiresAt: parsedInvoice.timeExpireDate
        ? new Date(parsedInvoice.timeExpireDate * 1000)
        : new Date(Date.now() + 3600000),
      walletCurrency: 'BTC',
    };
  }

  /**
   * Get USD wallet ID for the user
   */
  private async getUsdWalletId(authToken: string): Promise<string> {
    const query = `
      query me {
        me {
          defaultAccount {
            wallets {
              id
              walletCurrency
            }
          }
        }
      }
    `;

    const result = await this.flashApiService.executeQuery<any>(query, {}, authToken);
    const wallets = result.me?.defaultAccount?.wallets || [];
    const usdWallet = wallets.find((w: any) => w.walletCurrency === 'USD');

    if (!usdWallet) {
      throw new BadRequestException('USD wallet not found');
    }

    return usdWallet.id;
  }

  /**
   * Get BTC wallet ID for the user
   */
  private async getBtcWalletId(authToken: string): Promise<string> {
    const query = `
      query me {
        me {
          defaultAccount {
            wallets {
              id
              walletCurrency
            }
          }
        }
      }
    `;

    const result = await this.flashApiService.executeQuery<any>(query, {}, authToken);
    const wallets = result.me?.defaultAccount?.wallets || [];
    const btcWallet = wallets.find((w: any) => w.walletCurrency === 'BTC');

    if (!btcWallet) {
      throw new BadRequestException('BTC wallet not found');
    }

    return btcWallet.id;
  }

  /**
   * Parse a BOLT11 invoice
   */
  private parseInvoice(paymentRequest: string): any {
    try {
      return bolt11.decode(paymentRequest);
    } catch (error) {
      this.logger.warn(`Failed to parse invoice: ${error.message}`);
      // Return a basic parsed object if parsing fails
      return {
        timeExpireDate: Date.now() / 1000 + 3600, // 1 hour from now
        tags: [],
      };
    }
  }

  /**
   * Format invoice for display
   */
  formatInvoiceMessage(invoice: InvoiceInfo): string {
    const timeLeft = this.getTimeLeft(invoice.expiresAt);
    const amountText = invoice.amount ? `$${invoice.amount.toFixed(2)} USD` : 'Any amount (USD)';

    return (
      `*Lightning Invoice*\n\n` +
      `Amount: ${amountText}\n` +
      (invoice.memo ? `Memo: ${invoice.memo}\n` : '') +
      `Valid for: ${timeLeft}\n\n` +
      `\`\`\`${invoice.paymentRequest}\`\`\`\n\n` +
      `Copy and paste this invoice to pay, or scan the QR code below.`
    );
  }

  /**
   * Get human-readable time left for invoice
   */
  private getTimeLeft(expiresAt: Date): string {
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();

    if (diffMs <= 0) {
      return 'Expired';
    }

    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    } else if (diffMins > 0) {
      return `${diffMins} minute${diffMins > 1 ? 's' : ''}`;
    } else {
      const diffSecs = Math.floor(diffMs / 1000);
      return `${diffSecs} second${diffSecs > 1 ? 's' : ''}`;
    }
  }
}
