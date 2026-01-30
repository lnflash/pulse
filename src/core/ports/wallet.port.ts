import { UserId } from '../types';

export interface WalletPort {
  getBalance(userId: UserId): Promise<unknown>;
  sendPayment(userId: UserId, params: unknown): Promise<unknown>;
  createInvoice(userId: UserId, params: unknown): Promise<unknown>;
  getTransactionHistory(userId: UserId, limit?: number): Promise<unknown[]>;
  getPrice(currency: string): Promise<unknown>;
}
