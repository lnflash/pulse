/**
 * WalletPort — hexagonal boundary for wallet/payment backend adapters.
 * Adapters for Flash API, Lightning Network nodes, etc. implement this.
 */

/** Supported currency codes. */
export type CurrencyCode =
  | 'USD'
  | 'JMD'
  | 'TTD'
  | 'BBD'
  | 'XCD'
  | 'SAT'
  | 'BTC'
  | string;

/** A monetary amount with currency. */
export interface Money {
  /** Amount in the smallest unit (cents, satoshis, etc.) */
  amountCents: number;
  /** ISO 4217 currency code or 'SAT'/'BTC' for bitcoin */
  currency: CurrencyCode;
  /** Human-readable formatted string, e.g. "$12.50", "₿0.00001234" */
  display: string;
}

/** Wallet balance response. */
export interface WalletBalance {
  /** The user's Flash account identifier */
  accountId: string;
  /** Available balance (excluding pending transactions) */
  available: Money;
  /** Total balance including pending incoming */
  total: Money;
  /** Pending outgoing amount */
  pendingOut: Money;
  /** Timestamp of the balance snapshot */
  asOf: Date;
}

/** Parameters for initiating a payment. */
export interface SendPaymentParams {
  /** Sender's Flash account ID */
  fromAccountId: string;
  /**
   * Payment destination. One of:
   * - Lightning invoice (bolt11)
   * - Flash username
   * - Phone number
   * - Lightning address (user@domain)
   */
  destination: string;
  /** Amount to send. If null, uses the amount encoded in the invoice. */
  amount?: Money;
  /** Optional memo/note attached to the payment */
  memo?: string;
  /** Idempotency key to prevent duplicate payments */
  idempotencyKey: string;
}

/** Result of a successful payment. */
export interface PaymentResult {
  /** Platform transaction ID */
  transactionId: string;
  /** Amount that was actually sent */
  amountSent: Money;
  /** Network fee paid */
  fee: Money;
  /** Payment hash (Lightning) or on-chain TXID */
  paymentHash?: string;
  /** When the payment settled */
  settledAt: Date;
  /** Human-readable description of the destination */
  destinationDisplay: string;
}

/** Parameters for creating a Lightning invoice. */
export interface CreateInvoiceParams {
  /** Recipient's Flash account ID */
  accountId: string;
  /** Amount to request. If omitted, creates an open-amount invoice. */
  amount?: Money;
  /** Description shown to the payer */
  description?: string;
  /** Invoice expiry in seconds (default: 3600) */
  expirySeconds?: number;
}

/** A Lightning invoice. */
export interface Invoice {
  /** BOLT11-encoded payment request string */
  paymentRequest: string;
  /** Payment hash (identifies the invoice) */
  paymentHash: string;
  /** Amount encoded in the invoice, if specified */
  amount?: Money;
  /** Invoice expiry timestamp */
  expiresAt: Date;
  /** Whether the invoice has been paid */
  isPaid: boolean;
  /** When it was paid, if paid */
  paidAt?: Date;
}

/** A single wallet transaction. */
export interface Transaction {
  /** Platform transaction ID */
  id: string;
  /** 'credit' = incoming, 'debit' = outgoing */
  direction: 'credit' | 'debit';
  /** Amount (always positive) */
  amount: Money;
  /** Fee paid for this transaction */
  fee?: Money;
  /** Payment type */
  type: 'lightning' | 'onchain' | 'internal' | 'fiat';
  /** Settlement status */
  status: 'pending' | 'settled' | 'failed' | 'reversed';
  /** Human-readable description */
  description?: string;
  /** Counterparty (sender or recipient) */
  counterparty?: string;
  /** When the transaction was initiated */
  createdAt: Date;
  /** When the transaction settled (null if still pending) */
  settledAt?: Date;
}

/** Parameters for querying transaction history. */
export interface TransactionHistoryParams {
  /** Account to query */
  accountId: string;
  /** Maximum number of results (default: 20, max: 100) */
  limit?: number;
  /** Pagination cursor (last transaction ID from previous page) */
  after?: string;
  /** Filter by direction */
  direction?: 'credit' | 'debit';
  /** Filter by transaction type */
  type?: Transaction['type'];
  /** Start of date range */
  from?: Date;
  /** End of date range */
  to?: Date;
}

/** Paginated transaction history result. */
export interface TransactionHistory {
  transactions: Transaction[];
  /** Cursor to use for the next page, undefined if last page */
  nextCursor?: string;
  /** Total count (may be approximate for large histories) */
  totalCount: number;
}

/** Exchange rate between two currencies. */
export interface ExchangeRate {
  /** Source currency */
  from: CurrencyCode;
  /** Target currency */
  to: CurrencyCode;
  /** Midmarket rate: 1 unit of `from` = `rate` units of `to` */
  rate: number;
  /** Rate including provider spread/fees */
  effectiveRate: number;
  /** When this rate was fetched */
  timestamp: Date;
  /** How long this rate is valid (seconds) */
  validForSeconds: number;
}

/** Fee estimate for a proposed payment. */
export interface FeeEstimate {
  /** Low-priority fee */
  low: Money;
  /** Medium-priority fee (recommended) */
  medium: Money;
  /** High-priority fee (fastest) */
  high: Money;
  /** Estimated settlement time for medium fee (seconds) */
  estimatedSettlementSeconds: number;
}

/**
 * WalletPort — implement this for every payment backend.
 */
export interface WalletPort {
  /**
   * Get the current balance for an account.
   * @param accountId Flash account identifier
   */
  getBalance(accountId: string): Promise<WalletBalance>;

  /**
   * Send a payment to a destination.
   * @param params Payment parameters including destination and amount
   * @throws Error if payment fails, insufficient balance, or destination invalid
   */
  sendPayment(params: SendPaymentParams): Promise<PaymentResult>;

  /**
   * Create a Lightning invoice to receive payment.
   * @param params Invoice creation parameters
   */
  createInvoice(params: CreateInvoiceParams): Promise<Invoice>;

  /**
   * Look up the status of an existing invoice by payment hash.
   * @param paymentHash The invoice's payment hash
   */
  getInvoice(paymentHash: string): Promise<Invoice>;

  /**
   * Retrieve paginated transaction history for an account.
   * @param params Query parameters
   */
  getTransactionHistory(
    params: TransactionHistoryParams,
  ): Promise<TransactionHistory>;

  /**
   * Get the current exchange rate between two currencies.
   * @param from Source currency code
   * @param to Target currency code
   */
  getExchangeRate(from: CurrencyCode, to: CurrencyCode): Promise<ExchangeRate>;

  /**
   * Estimate the fee for a proposed payment before sending.
   * @param destination Payment destination (invoice, address, etc.)
   * @param amount Amount to send
   */
  estimateFee(destination: string, amount: Money): Promise<FeeEstimate>;

  /**
   * Resolve a human-readable identifier to a Flash account ID.
   * Accepts phone numbers, Flash usernames, or Lightning addresses.
   * Returns null if not found.
   */
  resolveRecipient(
    identifier: string,
  ): Promise<{ accountId: string; displayName: string } | null>;

  /**
   * Health check — returns true if the wallet API is reachable.
   */
  ping(): Promise<boolean>;
}
