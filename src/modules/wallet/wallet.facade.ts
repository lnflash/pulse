import { Inject, Injectable, Logger } from '@nestjs/common';
import { UserId } from '../../core/types';
import { WalletPort } from '../../core/ports/wallet.port';
import { SessionPort } from '../../core/ports/session.port';
import { BalanceService } from './services/balance.service';
import { PaymentService } from './services/payment.service';
import { InvoiceService } from './services/invoice.service';
import { TransactionService } from './services/transaction.service';
import { PriceService } from './services/price.service';

export const SESSION_PORT = Symbol('SessionPort');

@Injectable()
export class WalletFacade implements WalletPort {
  private readonly logger = new Logger(WalletFacade.name);

  constructor(
    @Inject(SESSION_PORT) private readonly sessionPort: SessionPort,
    private readonly balanceService: BalanceService,
    private readonly paymentService: PaymentService,
    private readonly invoiceService: InvoiceService,
    private readonly transactionService: TransactionService,
    private readonly priceService: PriceService,
  ) {}

  async getBalance(userId: UserId): Promise<unknown> {
    const authToken = await this.getAuthToken(userId);
    return this.balanceService.getBalance(authToken, userId.value);
  }

  async sendPayment(userId: UserId, params: unknown): Promise<unknown> {
    const authToken = await this.getAuthToken(userId);
    const { walletId, paymentRequest, memo } = params as {
      walletId: string;
      paymentRequest: string;
      memo?: string;
    };
    return this.paymentService.sendLightningPayment(authToken, {
      walletId,
      paymentRequest,
      memo,
    });
  }

  async createInvoice(userId: UserId, params: unknown): Promise<unknown> {
    const authToken = await this.getAuthToken(userId);
    const { amount, memo } = params as { amount?: number; memo?: string };
    return this.invoiceService.createInvoice(authToken, { amount, memo });
  }

  async getTransactionHistory(userId: UserId, limit?: number): Promise<unknown[]> {
    const authToken = await this.getAuthToken(userId);
    const result = await this.transactionService.getTransactionHistory(authToken, limit);
    return result?.edges?.map((e) => e.node) ?? [];
  }

  async getPrice(currency: string): Promise<unknown> {
    return this.priceService.getPrice(currency);
  }

  private async getAuthToken(userId: UserId): Promise<string> {
    const session = await this.sessionPort.getSession(userId);
    if (!session?.flashAuthToken) {
      throw new Error(`No Flash auth token for user ${userId.value}`);
    }
    return session.flashAuthToken;
  }
}
