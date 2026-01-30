import { UserId } from '../types';

export interface UserInfo {
  username?: string;
  lightningAddress?: string;
  language?: string;
  displayCurrency?: string;
  consentGiven?: boolean;
}

export interface WalletPort {
  getBalance(userId: UserId): Promise<unknown>;
  sendPayment(userId: UserId, params: unknown): Promise<unknown>;
  createInvoice(userId: UserId, params: unknown): Promise<unknown>;
  getTransactionHistory(userId: UserId, limit?: number): Promise<unknown[]>;
  getPrice(currency: string): Promise<unknown>;
  getUserInfo(userId: UserId): Promise<UserInfo>;
  setUsername(userId: UserId, username: string): Promise<void>;
  setConsent(userId: UserId, consent: boolean): Promise<void>;
}
