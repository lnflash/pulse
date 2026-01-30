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

export interface Contact {
  name: string;
  phone?: string;
  username?: string;
  source: 'manual' | 'vcard';
  addedAt: Date;
}

export interface ContactHistoryEntry {
  type: 'send' | 'receive' | 'request';
  amount: number;
  currency: string;
  date: Date;
  memo?: string;
}

export interface PaymentRequest {
  id: string;
  fromUserId: string;
  toTarget: string;
  amount: number;
  currency: string;
  memo?: string;
  status: 'pending' | 'paid' | 'expired';
  createdAt: Date;
}

export interface DecodedInvoice {
  paymentHash: string;
  amount: number;
  currency: string;
  memo?: string;
  destination: string;
  expiresAt: Date;
  isExpired: boolean;
}

export interface PayInvoiceResult {
  success: boolean;
  preimage?: string;
  paymentHash?: string;
  feeSats?: number;
  message: string;
}

export interface ConfirmPaymentResult {
  success: boolean;
  message: string;
  transactionId?: string;
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

  // Social / Contacts
  getContacts(userId: UserId): Promise<Contact[]>;
  addContact(userId: UserId, name: string, phone?: string, username?: string): Promise<Contact>;
  removeContact(userId: UserId, name: string): Promise<boolean>;
  getContactHistory(userId: UserId, contactName: string): Promise<ContactHistoryEntry[]>;

  // Invoice / Pay
  payInvoice(userId: UserId, invoice: string): Promise<PayInvoiceResult>;
  decodeInvoice(userId: UserId, invoice: string): Promise<DecodedInvoice>;
  confirmPendingPayment(
    userId: UserId,
    paymentId: string,
    action: 'confirm' | 'cancel',
  ): Promise<ConfirmPaymentResult>;

  // Payment Requests
  requestPayment(
    userId: UserId,
    target: string,
    amount: number,
    currency: string,
    memo?: string,
  ): Promise<PaymentRequest>;
}
