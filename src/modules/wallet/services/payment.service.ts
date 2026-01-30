import { Injectable, Logger } from '@nestjs/common';
import { FlashApiClient } from '../flash-api.client';
import {
  LN_INVOICE_PAYMENT_SEND_MUTATION,
  LN_NO_AMOUNT_INVOICE_PAYMENT_SEND_MUTATION,
  INTRA_LEDGER_PAYMENT_SEND_MUTATION,
} from '../graphql/mutations';
import { ME_WALLETS_QUERY } from '../graphql/queries';

export interface PaymentResponse {
  status?: string;
  errors?: Array<{ message: string }>;
}

export interface WalletInfo {
  id: string;
  balance: number;
  walletCurrency: string;
}

export interface UserWalletsInfo {
  defaultWalletId: string;
  btcWallet?: WalletInfo;
  usdWallet?: WalletInfo;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(private readonly client: FlashApiClient) {}

  async getUserWallets(authToken: string): Promise<UserWalletsInfo> {
    const result = await this.client.execute<{
      me: {
        id: string;
        defaultAccount: {
          id: string;
          defaultWalletId: string;
          wallets: WalletInfo[];
        };
      };
    }>(ME_WALLETS_QUERY, {}, authToken);

    const wallets = result.me.defaultAccount.wallets;
    return {
      defaultWalletId: result.me.defaultAccount.defaultWalletId,
      btcWallet: wallets.find((w) => w.walletCurrency === 'BTC'),
      usdWallet: wallets.find((w) => w.walletCurrency === 'USD'),
    };
  }

  async sendLightningPayment(
    authToken: string,
    input: { walletId: string; paymentRequest: string; memo?: string },
  ): Promise<PaymentResponse> {
    const result = await this.client.execute<{
      lnInvoicePaymentSend: PaymentResponse;
    }>(LN_INVOICE_PAYMENT_SEND_MUTATION, { input }, authToken);
    return result.lnInvoicePaymentSend;
  }

  async sendLightningNoAmountPayment(
    authToken: string,
    input: { walletId: string; paymentRequest: string; amount: number; memo?: string },
  ): Promise<PaymentResponse> {
    const result = await this.client.execute<{
      lnNoAmountInvoicePaymentSend: PaymentResponse;
    }>(LN_NO_AMOUNT_INVOICE_PAYMENT_SEND_MUTATION, { input }, authToken);
    return result.lnNoAmountInvoicePaymentSend;
  }

  async sendIntraLedgerPayment(
    authToken: string,
    input: { walletId: string; recipientWalletId: string; amount: number; memo?: string },
  ): Promise<PaymentResponse> {
    const result = await this.client.execute<{
      intraLedgerPaymentSend: PaymentResponse;
    }>(INTRA_LEDGER_PAYMENT_SEND_MUTATION, { input }, authToken);
    return result.intraLedgerPaymentSend;
  }
}
