/**
 * MockWalletPort — configurable mock for WalletPort.
 */

import type {
  WalletPort,
  WalletBalance,
  Money,
  PaymentResult,
  SendPaymentParams,
  CreateInvoiceParams,
  Invoice,
  TransactionHistory,
  TransactionHistoryParams,
  ExchangeRate,
  FeeEstimate,
  CurrencyCode,
} from '../../src/ports/WalletPort';

/** Make a Money object with a display string. */
export function makeMoney(
  amountCents: number,
  currency: CurrencyCode = 'USD',
): Money {
  const major = amountCents / 100;
  return {
    amountCents,
    currency,
    display: currency === 'SAT'
      ? `${amountCents} sats`
      : `${currency} ${major.toFixed(2)}`,
  };
}

/** Make a WalletBalance with given available amount. */
export function makeBalance(
  accountId: string,
  availableCents: number,
  currency: CurrencyCode = 'USD',
): WalletBalance {
  const available = makeMoney(availableCents, currency);
  return {
    accountId,
    available,
    total: available,
    pendingOut: makeMoney(0, currency),
    asOf: new Date(),
  };
}

/**
 * MockWalletPort — in-memory implementation for tests.
 */
export class MockWalletPort implements WalletPort {
  /** accountId → balance */
  private balances: Map<string, WalletBalance> = new Map();
  /** Payments recorded by sendPayment() */
  readonly sentPayments: SendPaymentParams[] = [];
  /** Invoices created by createInvoice() */
  readonly createdInvoices: Invoice[] = [];

  private shouldFailBalance = false;
  private shouldFailPayment: string | null = null;

  // ── Setup helpers ────────────────────────────────────────────────────────

  setBalance(accountId: string, balance: WalletBalance): this {
    this.balances.set(accountId, balance);
    return this;
  }

  setSimpleBalance(accountId: string, amountCents: number, currency: CurrencyCode = 'USD'): this {
    return this.setBalance(accountId, makeBalance(accountId, amountCents, currency));
  }

  failOnGetBalance(): this {
    this.shouldFailBalance = true;
    return this;
  }

  failOnSendPayment(reason: string): this {
    this.shouldFailPayment = reason;
    return this;
  }

  reset(): this {
    this.balances.clear();
    this.sentPayments.length = 0;
    this.createdInvoices.length = 0;
    this.shouldFailBalance = false;
    this.shouldFailPayment = null;
    return this;
  }

  // ── WalletPort implementation ────────────────────────────────────────────

  async getBalance(accountId: string): Promise<WalletBalance> {
    if (this.shouldFailBalance) {
      this.shouldFailBalance = false;
      throw new Error('MockWalletPort: getBalance failed (configured to fail)');
    }
    const balance = this.balances.get(accountId);
    if (!balance) {
      throw new Error(`MockWalletPort: no balance configured for accountId "${accountId}"`);
    }
    return balance;
  }

  async sendPayment(params: SendPaymentParams): Promise<PaymentResult> {
    if (this.shouldFailPayment) {
      const reason = this.shouldFailPayment;
      this.shouldFailPayment = null;
      throw new Error(`MockWalletPort: payment failed — ${reason}`);
    }
    this.sentPayments.push(params);
    return {
      transactionId: `tx-${Date.now()}`,
      amountSent: params.amount ?? makeMoney(100),
      fee: makeMoney(1),
      paymentHash: `hash-${Date.now()}`,
      settledAt: new Date(),
      destinationDisplay: params.destination,
    };
  }

  async createInvoice(params: CreateInvoiceParams): Promise<Invoice> {
    const invoice: Invoice = {
      paymentRequest: `lnbc${Date.now()}`,
      paymentHash: `hash-${Date.now()}`,
      amount: params.amount,
      expiresAt: new Date(Date.now() + (params.expirySeconds ?? 3600) * 1000),
      isPaid: false,
    };
    this.createdInvoices.push(invoice);
    return invoice;
  }

  async getInvoice(paymentHash: string): Promise<Invoice> {
    const found = this.createdInvoices.find((i) => i.paymentHash === paymentHash);
    if (!found) throw new Error(`MockWalletPort: invoice not found for hash "${paymentHash}"`);
    return found;
  }

  async getTransactionHistory(
    _params: TransactionHistoryParams,
  ): Promise<TransactionHistory> {
    return { transactions: [], totalCount: 0 };
  }

  async getExchangeRate(from: CurrencyCode, to: CurrencyCode): Promise<ExchangeRate> {
    return {
      from,
      to,
      rate: 1.0,
      effectiveRate: 1.0,
      timestamp: new Date(),
      validForSeconds: 300,
    };
  }

  async estimateFee(
    _destination: string,
    amount: Money,
  ): Promise<FeeEstimate> {
    const fee = makeMoney(Math.ceil(amount.amountCents * 0.001));
    return { low: fee, medium: fee, high: fee, estimatedSettlementSeconds: 60 };
  }

  async resolveRecipient(
    identifier: string,
  ): Promise<{ accountId: string; displayName: string } | null> {
    // Simple mock: any identifier that looks like "user:accountId"
    if (identifier.startsWith('user:')) {
      return { accountId: identifier.slice(5), displayName: identifier };
    }
    return null;
  }

  async ping(): Promise<boolean> {
    return true;
  }
}
