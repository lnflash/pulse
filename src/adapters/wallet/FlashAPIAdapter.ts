/**
 * FlashAPIAdapter — WalletPort implementation for the Flash GraphQL API.
 *
 * Stub implementation. Full implementation in Week 3 (Wallet Integration sprint).
 */

import type {
  WalletPort,
  WalletBalance,
  SendPaymentParams,
  PaymentResult,
  CreateInvoiceParams,
  Invoice,
  TransactionHistory,
  TransactionHistoryParams,
  ExchangeRate,
  FeeEstimate,
  Money,
  CurrencyCode,
} from '../../ports/WalletPort.js';
import { logger } from '../../config/logger.js';

/** Configuration for the Flash API adapter. */
export interface FlashAPIConfig {
  /** Flash API base URL */
  apiUrl: string;
  /** GraphQL endpoint path (relative to apiUrl) */
  graphqlPath?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * FlashAPIAdapter — implements WalletPort against the Flash GraphQL API.
 *
 * @todo Week 3: Full implementation
 * - Implement getBalance via galoy/flash balance query
 * - Implement sendPayment via lnInvoicePaymentSend / intraLedgerPaymentSend
 * - Implement createInvoice via lnInvoiceCreate
 * - Implement getTransactionHistory via transactionsByAccount
 * - Implement getExchangeRate via real-time price endpoint
 * - Handle auth tokens and refresh
 */
export class FlashAPIAdapter implements WalletPort {
  private readonly config: Required<FlashAPIConfig>;

  constructor(config: FlashAPIConfig) {
    this.config = {
      apiUrl: config.apiUrl,
      graphqlPath: config.graphqlPath ?? '/graphql',
      timeoutMs: config.timeoutMs ?? 10_000,
    };
  }

  async getBalance(_accountId: string): Promise<WalletBalance> {
    logger.debug({ accountId: _accountId }, 'FlashAPIAdapter.getBalance (stub)');
    throw new Error('FlashAPIAdapter.getBalance not implemented — Week 3');
  }

  async sendPayment(_params: SendPaymentParams): Promise<PaymentResult> {
    throw new Error('FlashAPIAdapter.sendPayment not implemented — Week 3');
  }

  async createInvoice(_params: CreateInvoiceParams): Promise<Invoice> {
    throw new Error('FlashAPIAdapter.createInvoice not implemented — Week 3');
  }

  async getInvoice(_paymentHash: string): Promise<Invoice> {
    throw new Error('FlashAPIAdapter.getInvoice not implemented — Week 3');
  }

  async getTransactionHistory(
    _params: TransactionHistoryParams,
  ): Promise<TransactionHistory> {
    throw new Error('FlashAPIAdapter.getTransactionHistory not implemented — Week 3');
  }

  async getExchangeRate(
    _from: CurrencyCode,
    _to: CurrencyCode,
  ): Promise<ExchangeRate> {
    throw new Error('FlashAPIAdapter.getExchangeRate not implemented — Week 3');
  }

  async estimateFee(_destination: string, _amount: Money): Promise<FeeEstimate> {
    throw new Error('FlashAPIAdapter.estimateFee not implemented — Week 3');
  }

  async resolveRecipient(
    _identifier: string,
  ): Promise<{ accountId: string; displayName: string } | null> {
    throw new Error('FlashAPIAdapter.resolveRecipient not implemented — Week 3');
  }

  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.apiUrl}/health`, {
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
