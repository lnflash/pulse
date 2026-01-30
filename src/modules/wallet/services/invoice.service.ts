import { Injectable, Logger } from '@nestjs/common';
import { FlashApiClient } from '../flash-api.client';

export interface InvoiceResult {
  paymentRequest: string;
  paymentHash: string;
  errors?: Array<{ code?: string; message: string }>;
}

const LN_USD_INVOICE_CREATE = `
  mutation lnUsdInvoiceCreate($input: LnUsdInvoiceCreateInput!) {
    lnUsdInvoiceCreate(input: $input) {
      errors { code, message }
      invoice { paymentRequest, paymentHash, satoshis }
    }
  }
`;

const LN_NO_AMOUNT_INVOICE_CREATE = `
  mutation lnNoAmountInvoiceCreate($input: LnNoAmountInvoiceCreateInput!) {
    lnNoAmountInvoiceCreate(input: $input) {
      errors { code, message }
      invoice { paymentRequest, paymentHash, paymentSecret }
    }
  }
`;

const WALLETS_QUERY = `
  query me {
    me {
      defaultAccount {
        wallets { id, walletCurrency }
      }
    }
  }
`;

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(private readonly client: FlashApiClient) {}

  async createInvoice(
    authToken: string,
    params: { amount?: number; memo?: string },
  ): Promise<InvoiceResult> {
    const walletId = await this.getUsdWalletId(authToken);

    if (params.amount) {
      return this.createUsdInvoice(authToken, walletId, params.amount, params.memo);
    }
    return this.createNoAmountInvoice(authToken, walletId, params.memo);
  }

  private async createUsdInvoice(
    authToken: string,
    walletId: string,
    amount: number,
    memo?: string,
  ): Promise<InvoiceResult> {
    const amountInCents = Math.round(amount * 100);
    const result = await this.client.execute<{ lnUsdInvoiceCreate: any }>(
      LN_USD_INVOICE_CREATE,
      { input: { walletId, amount: amountInCents, memo: memo || `$${amount.toFixed(2)} payment` } },
      authToken,
    );

    if (result.lnUsdInvoiceCreate?.errors?.length) {
      return { paymentRequest: '', paymentHash: '', errors: result.lnUsdInvoiceCreate.errors };
    }

    const invoice = result.lnUsdInvoiceCreate.invoice;
    return { paymentRequest: invoice.paymentRequest, paymentHash: invoice.paymentHash };
  }

  private async createNoAmountInvoice(
    authToken: string,
    walletId: string,
    memo?: string,
  ): Promise<InvoiceResult> {
    const result = await this.client.execute<{ lnNoAmountInvoiceCreate: any }>(
      LN_NO_AMOUNT_INVOICE_CREATE,
      { input: { walletId, memo: memo || 'Flash Wallet Payment' } },
      authToken,
    );

    if (result.lnNoAmountInvoiceCreate?.errors?.length) {
      return { paymentRequest: '', paymentHash: '', errors: result.lnNoAmountInvoiceCreate.errors };
    }

    const invoice = result.lnNoAmountInvoiceCreate.invoice;
    return { paymentRequest: invoice.paymentRequest, paymentHash: invoice.paymentHash };
  }

  private async getUsdWalletId(authToken: string): Promise<string> {
    const result = await this.client.execute<{
      me: { defaultAccount: { wallets: Array<{ id: string; walletCurrency: string }> } };
    }>(WALLETS_QUERY, {}, authToken);

    const usdWallet = result.me.defaultAccount.wallets.find((w) => w.walletCurrency === 'USD');
    if (!usdWallet) throw new Error('USD wallet not found');
    return usdWallet.id;
  }
}
