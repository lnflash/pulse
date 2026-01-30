import { UserId } from '../types';

export interface UserInfo {
  username?: string;
  lightningAddress?: string;
  language?: string;
  displayCurrency?: string;
  consentGiven?: boolean;
}

export interface PendingPayment {
  id: string;
  amount: number;
  currency: string;
  sender?: string;
  recipient?: string;
  claimCode?: string;
  expiresAt?: Date;
  status: 'pending' | 'claimed' | 'expired';
  createdAt: Date;
}

export interface TransactionRecord {
  id: string;
  type: 'send' | 'receive';
  amount: number;
  currency: string;
  counterparty?: string;
  memo?: string;
  status: string;
  createdAt: Date;
}

export interface UndoResult {
  success: boolean;
  message: string;
  transactionId?: string;
}

export interface WalletPort {
  getBalance(userId: UserId): Promise<unknown>;
  sendPayment(userId: UserId, params: unknown): Promise<unknown>;
  createInvoice(userId: UserId, params: unknown): Promise<unknown>;
  getTransactionHistory(userId: UserId, limit?: number): Promise<TransactionRecord[]>;
  getTransaction(userId: UserId, transactionId: string): Promise<TransactionRecord | null>;
  getPendingPayments(userId: UserId, direction?: 'sent' | 'received'): Promise<PendingPayment[]>;
  claimPendingPayment(
    userId: UserId,
    claimCode: string,
  ): Promise<{ success: boolean; message: string }>;
  undoLastTransaction(userId: UserId): Promise<UndoResult>;
  getPrice(currency: string): Promise<unknown>;
  getUserInfo(userId: UserId): Promise<UserInfo>;
  setUsername(userId: UserId, username: string): Promise<void>;
  setConsent(userId: UserId, consent: boolean): Promise<void>;
}
