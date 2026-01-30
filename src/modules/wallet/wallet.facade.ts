import { Inject, Injectable, Logger } from '@nestjs/common';
import { UserId } from '../../core/types';
import {
  UserInfo,
  WalletPort,
  TransactionRecord,
  PendingPayment,
  UndoResult,
  Contact,
  ContactHistoryEntry,
  PaymentRequest,
} from '../../core/ports/wallet.port';
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

  async getTransactionHistory(userId: UserId, limit?: number): Promise<TransactionRecord[]> {
    const authToken = await this.getAuthToken(userId);
    const result = await this.transactionService.getTransactionHistory(authToken, limit);
    return (result?.edges?.map((e) => e.node) ?? []) as unknown as TransactionRecord[];
  }

  async getTransaction(userId: UserId, transactionId: string): Promise<TransactionRecord | null> {
    this.logger.warn(`getTransaction not yet implemented: ${userId.value} -> ${transactionId}`);
    return null;
  }

  async getPendingPayments(
    userId: UserId,
    direction?: 'sent' | 'received',
  ): Promise<PendingPayment[]> {
    this.logger.warn(`getPendingPayments not yet implemented: ${userId.value} -> ${direction}`);
    return [];
  }

  async claimPendingPayment(
    userId: UserId,
    claimCode: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.warn(`claimPendingPayment not yet implemented: ${userId.value} -> ${claimCode}`);
    return { success: false, message: 'Not yet implemented' };
  }

  async undoLastTransaction(userId: UserId): Promise<UndoResult> {
    this.logger.warn(`undoLastTransaction not yet implemented: ${userId.value}`);
    return { success: false, message: 'Not yet implemented' };
  }

  async getPrice(currency: string): Promise<unknown> {
    return this.priceService.getPrice(currency);
  }

  async getUserInfo(userId: UserId): Promise<UserInfo> {
    this.logger.warn(`getUserInfo not yet implemented for ${userId.value}`);
    return {};
  }

  async setUsername(userId: UserId, username: string): Promise<void> {
    this.logger.warn(`setUsername not yet implemented: ${userId.value} -> ${username}`);
  }

  async setConsent(userId: UserId, consent: boolean): Promise<void> {
    this.logger.warn(`setConsent not yet implemented: ${userId.value} -> ${consent}`);
  }

  async getContacts(userId: UserId): Promise<Contact[]> {
    this.logger.warn(`getContacts not yet implemented: ${userId.value}`);
    return [];
  }

  async addContact(
    userId: UserId,
    name: string,
    phone?: string,
    username?: string,
  ): Promise<Contact> {
    this.logger.warn(`addContact not yet implemented: ${userId.value} -> ${name}`);
    return { name, phone, username, source: 'manual', addedAt: new Date() };
  }

  async removeContact(userId: UserId, name: string): Promise<boolean> {
    this.logger.warn(`removeContact not yet implemented: ${userId.value} -> ${name}`);
    return false;
  }

  async getContactHistory(userId: UserId, contactName: string): Promise<ContactHistoryEntry[]> {
    this.logger.warn(`getContactHistory not yet implemented: ${userId.value} -> ${contactName}`);
    return [];
  }

  async requestPayment(
    userId: UserId,
    target: string,
    amount: number,
    currency: string,
    memo?: string,
  ): Promise<PaymentRequest> {
    this.logger.warn(`requestPayment not yet implemented: ${userId.value} -> ${target} ${amount}`);
    return {
      id: `req-${Date.now()}`,
      fromUserId: userId.value,
      toTarget: target,
      amount,
      currency,
      memo,
      status: 'pending',
      createdAt: new Date(),
    };
  }

  private async getAuthToken(userId: UserId): Promise<string> {
    const session = await this.sessionPort.getSession(userId);
    if (!session?.flashAuthToken) {
      throw new Error(`No Flash auth token for user ${userId.value}`);
    }
    return session.flashAuthToken;
  }
}
