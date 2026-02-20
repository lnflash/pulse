/**
 * FlashAPIAdapter — WalletPort implementation for the Flash GraphQL API.
 *
 * Connects to the Flash (Galoy-based) GraphQL API at https://api.flashapp.me/graphql.
 * Auth is per-user Bearer token; tokens are supplied per-call or via setAuthToken().
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
import { childLogger } from '../../config/logger.js';

const log = childLogger({ adapter: 'FlashAPIAdapter' });

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Configuration for the Flash API adapter. */
export interface FlashAPIConfig {
  /** Flash API base URL, e.g. https://api.flashapp.me */
  apiUrl: string;
  /** GraphQL endpoint path (relative to apiUrl) */
  graphqlPath?: string;
  /** Request timeout in milliseconds (default: 15_000) */
  defaultTimeout?: number;
  /**
   * Default auth token used when no per-call token is provided.
   * For single-user scenarios or testing.
   */
  authToken?: string;
}

// ---------------------------------------------------------------------------
// Flash API response shapes (raw GraphQL types)
// ---------------------------------------------------------------------------

interface FlashWallet {
  id: string;
  balance: number;
  walletCurrency: 'BTC' | 'USD';
}

interface FlashRealtimePrice {
  btcSatPrice: { base: number; offset: number };
  usdCentPrice: { base: number; offset: number };
}

interface FlashDefaultAccount {
  displayCurrency: string;
  realtimePrice: FlashRealtimePrice;
  wallets: FlashWallet[];
}

interface FlashMeResponse {
  data: {
    me: {
      defaultAccount: FlashDefaultAccount;
    };
  };
  errors?: Array<{ message: string }>;
}

interface FlashTransactionNode {
  id: string;
  status: string;
  direction: string;
  memo: string | null;
  createdAt: number;
  settlementAmount: number;
  settlementFee: number;
  settlementCurrency: string;
  settlementDisplayAmount: string;
  settlementDisplayCurrency: string;
  initiationVia: {
    counterPartyUsername?: string;
    paymentHash?: string;
  };
}

interface FlashTransactionsResponse {
  data: {
    me: {
      defaultAccount: {
        transactions: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          edges: Array<{ node: FlashTransactionNode }>;
        };
      };
    };
  };
  errors?: Array<{ message: string }>;
}

interface FlashPaymentSendResponse {
  data: {
    lnInvoicePaymentSend?: { errors: Array<{ message: string }>; status: string };
    intraLedgerPaymentSend?: { errors: Array<{ message: string }>; status: string };
  };
  errors?: Array<{ message: string }>;
}

interface FlashInvoiceCreateResponse {
  data: {
    lnUsdInvoiceCreate?: {
      errors: Array<{ code?: string; message: string }>;
      invoice: { paymentRequest: string; paymentHash: string } | null;
    };
    lnNoAmountInvoiceCreate?: {
      errors: Array<{ code?: string; message: string }>;
      invoice: { paymentRequest: string; paymentHash: string } | null;
    };
  };
  errors?: Array<{ message: string }>;
}

interface FlashFeeProbeResponse {
  data: {
    lnInvoiceFeeProbe?: { errors: Array<{ message: string }>; amount: number | null };
  };
  errors?: Array<{ message: string }>;
}

interface FlashAccountDefaultWalletResponse {
  data: {
    accountDefaultWallet?: { id: string };
  };
  errors?: Array<{ message: string }>;
}

// ---------------------------------------------------------------------------
// GraphQL query/mutation strings
// ---------------------------------------------------------------------------

const ME_QUERY = `
  query me {
    me {
      defaultAccount {
        displayCurrency
        realtimePrice {
          btcSatPrice { base offset }
          usdCentPrice { base offset }
        }
        wallets {
          id
          balance
          walletCurrency
        }
      }
    }
  }
`;

const TRANSACTION_LIST_QUERY = `
  query transactionListForDefaultAccount($first: Int, $after: String) {
    me {
      defaultAccount {
        transactions(first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              status
              direction
              memo
              createdAt
              settlementAmount
              settlementFee
              settlementCurrency
              settlementDisplayAmount
              settlementDisplayCurrency
              initiationVia {
                ... on InitiationViaIntraLedger { counterPartyUsername }
                ... on InitiationViaLn { paymentHash }
              }
            }
          }
        }
      }
    }
  }
`;

const LN_INVOICE_PAYMENT_SEND = `
  mutation lnInvoicePaymentSend($input: LnInvoicePaymentInput!) {
    lnInvoicePaymentSend(input: $input) {
      errors { message }
      status
    }
  }
`;

const INTRA_LEDGER_PAYMENT_SEND = `
  mutation intraLedgerPaymentSend($input: IntraLedgerPaymentSendInput!) {
    intraLedgerPaymentSend(input: $input) {
      errors { message }
      status
    }
  }
`;

const LN_USD_INVOICE_CREATE = `
  mutation lnUsdInvoiceCreate($input: LnUsdInvoiceCreateInput!) {
    lnUsdInvoiceCreate(input: $input) {
      errors { code message }
      invoice { paymentRequest paymentHash }
    }
  }
`;

const LN_NO_AMOUNT_INVOICE_CREATE = `
  mutation lnNoAmountInvoiceCreate($input: LnNoAmountInvoiceCreateInput!) {
    lnNoAmountInvoiceCreate(input: $input) {
      errors { code message }
      invoice { paymentRequest paymentHash }
    }
  }
`;

const LN_INVOICE_FEE_PROBE = `
  mutation lnInvoiceFeeProbe($input: LnInvoiceFeeProbeInput!) {
    lnInvoiceFeeProbe(input: $input) {
      errors { message }
      amount
    }
  }
`;

const ACCOUNT_DEFAULT_WALLET_QUERY = `
  query accountDefaultWallet($username: Username!) {
    accountDefaultWallet(username: $username) {
      id
    }
  }
`;

const PING_QUERY = `
  query ping {
    globals {
      network
    }
  }
`;

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/** Detect if a string looks like a BOLT11 Lightning invoice. */
function isBolt11Invoice(s: string): boolean {
  const lower = s.toLowerCase();
  return (
    lower.startsWith('lnbc') ||
    lower.startsWith('lntb') ||
    lower.startsWith('lnbcrt') ||
    lower.startsWith('lntbs') ||
    lower.startsWith('lnsb')
  );
}

/** Detect if a string looks like an E.164 phone number. */
function isPhoneNumber(s: string): boolean {
  return /^\+\d{7,15}$/.test(s);
}

/** Detect if a string looks like a Lightning address (user@domain). */
function isLightningAddress(s: string): boolean {
  return /^[^@]+@[^@]+\.[^@]+$/.test(s);
}

/**
 * Decode a Flash realtimePrice value.
 * rate = base * 10^(-offset)
 */
function decodePrice(price: { base: number; offset: number }): number {
  return price.base * Math.pow(10, -price.offset);
}

/** Build a Money object. */
function money(amountCents: number, currency: CurrencyCode, display?: string): Money {
  const displayStr =
    display ??
    (currency === 'SAT' || currency === 'BTC'
      ? `${amountCents} sats`
      : `${(amountCents / 100).toFixed(2)} ${currency}`);
  return { amountCents, currency, display: displayStr };
}

/** Zero Money in a given currency. */
function zeroMoney(currency: CurrencyCode): Money {
  return money(0, currency, `0 ${currency}`);
}

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 500,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const isRetryable =
        err instanceof FlashAPIError && err.isRetryable;
      if (!isRetryable || attempt === maxRetries) break;
      const delay = baseDelayMs * Math.pow(2, attempt);
      log.warn({ attempt, delay, err }, 'Retrying Flash API request');
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Custom error type
// ---------------------------------------------------------------------------

export class FlashAPIError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly isRetryable = false,
  ) {
    super(message);
    this.name = 'FlashAPIError';
  }
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

/**
 * FlashAPIAdapter — implements WalletPort against the Flash GraphQL API.
 *
 * ### Auth token management
 * Flash uses per-user Bearer tokens. Since WalletPort methods do not include
 * an authToken parameter, this adapter supports two modes:
 *
 * 1. **Single-user mode**: pass `authToken` in the constructor config.
 * 2. **Multi-user mode**: call `setAuthToken(accountId, token)` to register
 *    tokens before calling wallet methods, then `getBalance(accountId)` will
 *    look up the right token automatically.
 *
 * If no matching token is found, methods throw a FlashAPIError.
 */
export class FlashAPIAdapter implements WalletPort {
  private readonly apiUrl: string;
  private readonly graphqlPath: string;
  private readonly defaultTimeout: number;
  /** Token registry: accountId → Bearer token */
  private readonly tokenRegistry = new Map<string, string>();
  /** Fallback token for single-user scenarios */
  private defaultAuthToken: string | undefined;

  constructor(config: FlashAPIConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.graphqlPath = config.graphqlPath ?? '/graphql';
    this.defaultTimeout = config.defaultTimeout ?? 15_000;
    this.defaultAuthToken = config.authToken;
  }

  // -------------------------------------------------------------------------
  // Token management (beyond WalletPort interface)
  // -------------------------------------------------------------------------

  /**
   * Register an auth token for a specific Flash account ID.
   * Call this before making requests on behalf of a user.
   */
  setAuthToken(accountId: string, token: string): void {
    this.tokenRegistry.set(accountId, token);
  }

  /**
   * Set the default auth token (used when accountId has no registered token).
   */
  setDefaultAuthToken(token: string): void {
    this.defaultAuthToken = token;
  }

  /** Resolve the auth token for an account. */
  private resolveToken(accountId?: string): string {
    if (accountId) {
      const tok = this.tokenRegistry.get(accountId);
      if (tok) return tok;
    }
    if (this.defaultAuthToken) return this.defaultAuthToken;
    throw new FlashAPIError(
      `No auth token registered for account ${accountId ?? '(default)'}. ` +
        'Call setAuthToken() or provide authToken in constructor config.',
      'NO_AUTH_TOKEN',
    );
  }

  // -------------------------------------------------------------------------
  // Core HTTP/GraphQL transport
  // -------------------------------------------------------------------------

  private get graphqlUrl(): string {
    return `${this.apiUrl}${this.graphqlPath}`;
  }

  /**
   * Execute a GraphQL query or mutation against the Flash API.
   * Handles auth headers, timeouts, HTTP errors, and GraphQL-level errors.
   * 5xx responses trigger a retryable FlashAPIError.
   */
  private async executeGraphQL<T>(
    query: string,
    variables: Record<string, unknown>,
    authToken: string,
  ): Promise<T> {
    const url = this.graphqlUrl;
    const body = JSON.stringify({ query, variables });

    log.debug({ url, variables }, 'Flash GraphQL request');

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body,
        signal: AbortSignal.timeout(this.defaultTimeout),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err, url }, 'Flash API network error');
      throw new FlashAPIError(`Network error calling Flash API: ${message}`, 'NETWORK_ERROR', false);
    }

    if (response.status >= 500) {
      log.warn({ status: response.status, url }, 'Flash API 5xx — will retry');
      throw new FlashAPIError(
        `Flash API returned ${response.status}`,
        `HTTP_${response.status}`,
        true, // retryable
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      log.error({ status: response.status, body: text, url }, 'Flash API error');
      throw new FlashAPIError(
        `Flash API HTTP ${response.status}: ${text}`,
        `HTTP_${response.status}`,
        false,
      );
    }

    let json: { data?: T; errors?: Array<{ message: string }> };
    try {
      json = (await response.json()) as typeof json;
    } catch (err) {
      throw new FlashAPIError('Flash API returned invalid JSON', 'INVALID_JSON', false);
    }

    if (json.errors && json.errors.length > 0) {
      const messages = json.errors.map((e) => e.message).join('; ');
      log.error({ errors: json.errors, url }, 'Flash GraphQL errors');
      throw new FlashAPIError(`Flash GraphQL error: ${messages}`, 'GRAPHQL_ERROR', false);
    }

    if (!json.data) {
      throw new FlashAPIError('Flash API returned no data', 'NO_DATA', false);
    }

    log.debug({ url }, 'Flash GraphQL response OK');
    return json.data;
  }

  // -------------------------------------------------------------------------
  // WalletPort implementation
  // -------------------------------------------------------------------------

  /**
   * Get the current balance for a Flash account.
   * The accountId is used to look up the registered auth token.
   * Returns BTC wallet balance (in sats, displayed as sats).
   *
   * If the account has both BTC and USD wallets, defaults to BTC.
   * To get USD wallet balance, use accountId that matches the USD wallet ID.
   */
  async getBalance(accountId: string): Promise<WalletBalance> {
    const authToken = this.resolveToken(accountId);

    return withRetry(async () => {
      const data = await this.executeGraphQL<FlashMeResponse['data']>(
        ME_QUERY,
        {},
        authToken,
      );

      const account = data.me.defaultAccount;
      const wallets = account.wallets;

      // Find the matching wallet by ID, or default to BTC wallet
      let wallet = wallets.find((w) => w.id === accountId);
      if (!wallet) {
        wallet = wallets.find((w) => w.walletCurrency === 'BTC') ?? wallets[0];
      }

      if (!wallet) {
        throw new FlashAPIError('No wallet found in Flash account', 'NO_WALLET');
      }

      const currency: CurrencyCode = wallet.walletCurrency === 'USD' ? 'USD' : 'SAT';
      // Flash balance: BTC is in sats, USD is in cents
      const balanceAmount = wallet.balance;

      const available = money(balanceAmount, currency);
      const total = money(balanceAmount, currency);
      const pendingOut = zeroMoney(currency);

      log.info({ accountId, currency, balance: balanceAmount }, 'Balance fetched');

      return {
        accountId,
        available,
        total,
        pendingOut,
        asOf: new Date(),
      } satisfies WalletBalance;
    });
  }

  /**
   * Send a Lightning or intra-ledger payment.
   *
   * Destination detection order:
   * 1. BOLT11 invoice → lnInvoicePaymentSend
   * 2. Flash username / phone number → resolve wallet ID → intraLedgerPaymentSend
   * 3. Lightning address → not directly supported (throws descriptive error)
   */
  async sendPayment(params: SendPaymentParams): Promise<PaymentResult> {
    const authToken = this.resolveToken(params.fromAccountId);
    const { destination, amount, memo, fromAccountId } = params;

    return withRetry(async () => {
      // --- Get the sender's wallet ID (we need the BTC wallet for LN payments) ---
      const meData = await this.executeGraphQL<FlashMeResponse['data']>(
        ME_QUERY,
        {},
        authToken,
      );
      const wallets = meData.me.defaultAccount.wallets;
      // Prefer the wallet matching fromAccountId, else use BTC wallet
      const senderWallet =
        wallets.find((w) => w.id === fromAccountId) ??
        wallets.find((w) => w.walletCurrency === 'BTC') ??
        wallets[0];

      if (!senderWallet) {
        throw new FlashAPIError('Sender wallet not found', 'NO_WALLET');
      }

      // -----------------------------------------------------------------------
      // Routing logic
      // -----------------------------------------------------------------------

      if (isBolt11Invoice(destination)) {
        // Lightning invoice payment
        const sendData = await this.executeGraphQL<FlashPaymentSendResponse['data']>(
          LN_INVOICE_PAYMENT_SEND,
          {
            input: {
              walletId: senderWallet.id,
              paymentRequest: destination,
              memo: memo ?? '',
            },
          },
          authToken,
        );

        const result = sendData.lnInvoicePaymentSend;
        if (!result) throw new FlashAPIError('No lnInvoicePaymentSend result', 'NO_RESULT');
        if (result.errors.length > 0) {
          throw new FlashAPIError(
            `Payment failed: ${result.errors.map((e) => e.message).join('; ')}`,
            'PAYMENT_ERROR',
          );
        }
        if (result.status !== 'SUCCESS' && result.status !== 'PENDING') {
          throw new FlashAPIError(`Payment status: ${result.status}`, 'PAYMENT_FAILED');
        }

        const sentAmount = amount ?? money(0, 'SAT', 'amount from invoice');
        return {
          transactionId: params.idempotencyKey,
          amountSent: sentAmount,
          fee: zeroMoney('SAT'),
          settledAt: new Date(),
          destinationDisplay: destination.slice(0, 20) + '...',
        } satisfies PaymentResult;
      }

      if (isLightningAddress(destination)) {
        throw new FlashAPIError(
          'Lightning address payments are not directly supported by the Flash API. ' +
            'Resolve the BOLT11 invoice first, then call sendPayment with the invoice.',
          'UNSUPPORTED_DESTINATION',
        );
      }

      // Username or phone number → intraledger
      const recipientIdentifier = destination;

      // Resolve recipient wallet ID
      const walletData =
        await this.executeGraphQL<FlashAccountDefaultWalletResponse['data']>(
          ACCOUNT_DEFAULT_WALLET_QUERY,
          { username: recipientIdentifier },
          authToken,
        );

      const recipientWalletId = walletData.accountDefaultWallet?.id;
      if (!recipientWalletId) {
        throw new FlashAPIError(
          `Recipient not found: ${recipientIdentifier}`,
          'RECIPIENT_NOT_FOUND',
        );
      }

      if (!amount) {
        throw new FlashAPIError(
          'Amount is required for intra-ledger (username) payments',
          'AMOUNT_REQUIRED',
        );
      }

      const sendData = await this.executeGraphQL<FlashPaymentSendResponse['data']>(
        INTRA_LEDGER_PAYMENT_SEND,
        {
          input: {
            walletId: senderWallet.id,
            recipientWalletId,
            amount: amount.amountCents,
            memo: memo ?? '',
          },
        },
        authToken,
      );

      const result = sendData.intraLedgerPaymentSend;
      if (!result) throw new FlashAPIError('No intraLedgerPaymentSend result', 'NO_RESULT');
      if (result.errors.length > 0) {
        throw new FlashAPIError(
          `Intra-ledger payment failed: ${result.errors.map((e) => e.message).join('; ')}`,
          'PAYMENT_ERROR',
        );
      }
      if (result.status !== 'SUCCESS' && result.status !== 'PENDING') {
        throw new FlashAPIError(`Payment status: ${result.status}`, 'PAYMENT_FAILED');
      }

      log.info(
        { fromAccountId, recipientIdentifier, amount: amount.amountCents },
        'Intra-ledger payment sent',
      );

      return {
        transactionId: params.idempotencyKey,
        amountSent: amount,
        fee: zeroMoney(amount.currency),
        settledAt: new Date(),
        destinationDisplay: recipientIdentifier,
      } satisfies PaymentResult;
    });
  }

  /**
   * Create a Lightning invoice to receive payment.
   * - With a USD amount → lnUsdInvoiceCreate (amount in cents)
   * - Without amount → lnNoAmountInvoiceCreate
   */
  async createInvoice(params: CreateInvoiceParams): Promise<Invoice> {
    const authToken = this.resolveToken(params.accountId);
    const { accountId, amount, description, expirySeconds } = params;

    return withRetry(async () => {
      // Find the wallet matching accountId; default to USD wallet for USD amounts
      const meData = await this.executeGraphQL<FlashMeResponse['data']>(
        ME_QUERY,
        {},
        authToken,
      );
      const wallets = meData.me.defaultAccount.wallets;
      let wallet = wallets.find((w) => w.id === accountId);
      if (!wallet) {
        // Default: use USD wallet for USD invoices, BTC wallet for sat/BTC invoices
        if (amount && (amount.currency === 'USD' || amount.currency === 'JMD')) {
          wallet = wallets.find((w) => w.walletCurrency === 'USD') ?? wallets[0];
        } else {
          wallet = wallets.find((w) => w.walletCurrency === 'BTC') ?? wallets[0];
        }
      }

      if (!wallet) {
        throw new FlashAPIError('No wallet found to create invoice', 'NO_WALLET');
      }

      const expiryInSeconds = expirySeconds ?? 3600;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + expiryInSeconds * 1000);

      if (amount) {
        // Amount-specific invoice (USD cents)
        const amountInCents =
          amount.currency === 'SAT' || amount.currency === 'BTC'
            ? amount.amountCents // sats passed as-is; Flash lnUsdInvoiceCreate needs USD cents
            : amount.amountCents;

        const invoiceData =
          await this.executeGraphQL<FlashInvoiceCreateResponse['data']>(
            LN_USD_INVOICE_CREATE,
            {
              input: {
                walletId: wallet.id,
                amount: amountInCents,
                memo: description ?? '',
              },
            },
            authToken,
          );

        const result = invoiceData.lnUsdInvoiceCreate;
        if (!result) throw new FlashAPIError('No lnUsdInvoiceCreate result', 'NO_RESULT');
        if (result.errors.length > 0) {
          throw new FlashAPIError(
            `Invoice creation failed: ${result.errors.map((e) => e.message).join('; ')}`,
            'INVOICE_ERROR',
          );
        }
        if (!result.invoice) {
          throw new FlashAPIError('No invoice returned from Flash API', 'NO_INVOICE');
        }

        log.info({ accountId, amountCents: amountInCents }, 'USD invoice created');

        return {
          paymentRequest: result.invoice.paymentRequest,
          paymentHash: result.invoice.paymentHash,
          amount,
          expiresAt,
          isPaid: false,
        } satisfies Invoice;
      }

      // No-amount invoice
      const invoiceData = await this.executeGraphQL<FlashInvoiceCreateResponse['data']>(
        LN_NO_AMOUNT_INVOICE_CREATE,
        {
          input: {
            walletId: wallet.id,
            memo: description ?? '',
          },
        },
        authToken,
      );

      const result = invoiceData.lnNoAmountInvoiceCreate;
      if (!result) throw new FlashAPIError('No lnNoAmountInvoiceCreate result', 'NO_RESULT');
      if (result.errors.length > 0) {
        throw new FlashAPIError(
          `Invoice creation failed: ${result.errors.map((e) => e.message).join('; ')}`,
          'INVOICE_ERROR',
        );
      }
      if (!result.invoice) {
        throw new FlashAPIError('No invoice returned from Flash API', 'NO_INVOICE');
      }

      log.info({ accountId }, 'No-amount invoice created');

      return {
        paymentRequest: result.invoice.paymentRequest,
        paymentHash: result.invoice.paymentHash,
        expiresAt,
        isPaid: false,
      } satisfies Invoice;
    });
  }

  /**
   * Look up an invoice by payment hash.
   * Note: The Flash API does not expose a direct "get invoice by hash" query.
   * This is implemented by scanning recent transactions for a matching payment hash.
   */
  async getInvoice(paymentHash: string): Promise<Invoice> {
    const authToken = this.resolveToken();

    return withRetry(async () => {
      const data = await this.executeGraphQL<FlashTransactionsResponse['data']>(
        TRANSACTION_LIST_QUERY,
        { first: 50 },
        authToken,
      );

      const edges = data.me.defaultAccount.transactions.edges;
      const matching = edges.find(
        (edge) => edge.node.initiationVia?.paymentHash === paymentHash,
      );

      if (!matching) {
        // Return an unpaid invoice stub (we can't fully reconstruct it)
        log.warn({ paymentHash }, 'Invoice not found in recent transactions');
        return {
          paymentRequest: '',
          paymentHash,
          expiresAt: new Date(Date.now() + 3600 * 1000),
          isPaid: false,
        } satisfies Invoice;
      }

      const tx = matching.node;
      const isPaid = tx.status === 'SUCCESS';
      const currency: CurrencyCode = tx.settlementCurrency === 'USD' ? 'USD' : 'SAT';
      const amount = money(Math.abs(tx.settlementAmount), currency);
      const settledDate = new Date(tx.createdAt * 1000);

      return {
        paymentRequest: '',
        paymentHash,
        amount,
        expiresAt: new Date(Date.now() + 3600 * 1000),
        isPaid,
        paidAt: isPaid ? settledDate : undefined,
      } satisfies Invoice;
    });
  }

  /**
   * Retrieve paginated transaction history.
   */
  async getTransactionHistory(
    params: TransactionHistoryParams,
  ): Promise<TransactionHistory> {
    const authToken = this.resolveToken(params.accountId);
    const { limit = 20, after, direction, type, from, to } = params;

    return withRetry(async () => {
      const data = await this.executeGraphQL<FlashTransactionsResponse['data']>(
        TRANSACTION_LIST_QUERY,
        { first: Math.min(limit, 100), after: after ?? null },
        authToken,
      );

      const txPage = data.me.defaultAccount.transactions;
      let edges = txPage.edges;

      // Client-side filtering (Flash API doesn't support server-side filters for these)
      if (direction) {
        const flashDir = direction === 'credit' ? 'RECEIVE' : 'SEND';
        edges = edges.filter((e) => e.node.direction === flashDir);
      }

      if (type) {
        edges = edges.filter((e) => {
          const via = e.node.initiationVia;
          switch (type) {
            case 'lightning':
              return 'paymentHash' in via;
            case 'internal':
              return 'counterPartyUsername' in via;
            default:
              return true;
          }
        });
      }

      if (from) {
        const fromTs = from.getTime() / 1000;
        edges = edges.filter((e) => e.node.createdAt >= fromTs);
      }

      if (to) {
        const toTs = to.getTime() / 1000;
        edges = edges.filter((e) => e.node.createdAt <= toTs);
      }

      const transactions = edges.map((edge): import('../../ports/WalletPort.js').Transaction => {
        const tx = edge.node;
        const txDirection: 'credit' | 'debit' =
          tx.direction === 'RECEIVE' ? 'credit' : 'debit';
        const currency: CurrencyCode = tx.settlementCurrency === 'USD' ? 'USD' : 'SAT';
        const txAmount = money(Math.abs(tx.settlementAmount), currency);
        const fee = tx.settlementFee
          ? money(Math.abs(tx.settlementFee), currency)
          : undefined;
        const createdAt = new Date(tx.createdAt * 1000);

        // Determine transaction type
        let txType: import('../../ports/WalletPort.js').Transaction['type'] = 'internal';
        if ('paymentHash' in tx.initiationVia) txType = 'lightning';
        else if ('counterPartyUsername' in tx.initiationVia) txType = 'internal';

        // Map status
        let status: import('../../ports/WalletPort.js').Transaction['status'] = 'pending';
        switch (tx.status) {
          case 'SUCCESS':
            status = 'settled';
            break;
          case 'FAILURE':
            status = 'failed';
            break;
          case 'PENDING':
            status = 'pending';
            break;
          default:
            status = 'pending';
        }

        const counterparty =
          tx.initiationVia.counterPartyUsername ??
          (tx.initiationVia.paymentHash
            ? `ln:${tx.initiationVia.paymentHash.slice(0, 8)}…`
            : undefined);

        return {
          id: tx.id,
          direction: txDirection,
          amount: txAmount,
          fee,
          type: txType,
          status,
          description: tx.memo ?? undefined,
          counterparty,
          createdAt,
          settledAt: status === 'settled' ? createdAt : undefined,
        };
      });

      const nextCursor =
        txPage.pageInfo.hasNextPage && txPage.pageInfo.endCursor
          ? txPage.pageInfo.endCursor
          : undefined;

      return {
        transactions,
        nextCursor,
        totalCount: transactions.length,
      } satisfies TransactionHistory;
    });
  }

  /**
   * Get exchange rate between two currencies using Flash realtimePrice.
   *
   * Flash provides:
   * - btcSatPrice: price of 1 sat in USD cents  → sats per USD = 1/btcSatPrice
   * - usdCentPrice: price of 1 cent in sats
   *
   * Supported pairs: SAT↔USD, BTC↔USD (and reverse).
   */
  async getExchangeRate(from: CurrencyCode, to: CurrencyCode): Promise<ExchangeRate> {
    const authToken = this.resolveToken();

    return withRetry(async () => {
      const data = await this.executeGraphQL<FlashMeResponse['data']>(
        ME_QUERY,
        {},
        authToken,
      );

      const price = data.me.defaultAccount.realtimePrice;
      // btcSatPrice: sats per USD (base * 10^-offset)
      const satsPerUsdCent = decodePrice(price.usdCentPrice);
      // usdCentPrice: USD cents per sat
      const usdCentsPerSat = decodePrice(price.btcSatPrice);

      const now = new Date();

      // Compute the requested rate
      let rate: number;
      const fromNorm = from.toUpperCase();
      const toNorm = to.toUpperCase();

      if ((fromNorm === 'SAT' || fromNorm === 'BTC') && toNorm === 'USD') {
        // sats → USD
        const multiplier = fromNorm === 'BTC' ? 100_000_000 : 1;
        rate = (usdCentsPerSat * multiplier) / 100; // convert cents to USD
      } else if (fromNorm === 'USD' && (toNorm === 'SAT' || toNorm === 'BTC')) {
        // USD → sats
        const divisor = toNorm === 'BTC' ? 100_000_000 : 1;
        rate = (satsPerUsdCent * 100) / divisor; // satsPerUsdCent * 100 cents per dollar
      } else if (fromNorm === toNorm) {
        rate = 1;
      } else {
        throw new FlashAPIError(
          `Exchange rate from ${from} to ${to} is not supported. ` +
            'Supported pairs: SAT↔USD, BTC↔USD.',
          'UNSUPPORTED_PAIR',
        );
      }

      log.debug({ from, to, rate }, 'Exchange rate fetched');

      return {
        from,
        to,
        rate,
        effectiveRate: rate, // Flash doesn't expose spread separately
        timestamp: now,
        validForSeconds: 60,
      } satisfies ExchangeRate;
    });
  }

  /**
   * Estimate fee for a Lightning invoice payment.
   * Uses lnInvoiceFeeProbe mutation. Returns the same fee for low/medium/high tiers.
   */
  async estimateFee(destination: string, amount: Money): Promise<FeeEstimate> {
    const authToken = this.resolveToken();

    if (!isBolt11Invoice(destination)) {
      // Intraledger fees are always 0 on Flash
      const zeroFee = zeroMoney(amount.currency);
      return {
        low: zeroFee,
        medium: zeroFee,
        high: zeroFee,
        estimatedSettlementSeconds: 5,
      } satisfies FeeEstimate;
    }

    return withRetry(async () => {
      // Get sender wallet
      const meData = await this.executeGraphQL<FlashMeResponse['data']>(
        ME_QUERY,
        {},
        authToken,
      );
      const wallets = meData.me.defaultAccount.wallets;
      const btcWallet = wallets.find((w) => w.walletCurrency === 'BTC') ?? wallets[0];
      if (!btcWallet) throw new FlashAPIError('No BTC wallet for fee probe', 'NO_WALLET');

      const probeData = await this.executeGraphQL<FlashFeeProbeResponse['data']>(
        LN_INVOICE_FEE_PROBE,
        {
          input: {
            walletId: btcWallet.id,
            paymentRequest: destination,
          },
        },
        authToken,
      );

      const probeResult = probeData.lnInvoiceFeeProbe;
      if (!probeResult) throw new FlashAPIError('No lnInvoiceFeeProbe result', 'NO_RESULT');
      if (probeResult.errors.length > 0) {
        log.warn({ errors: probeResult.errors }, 'Fee probe errors — returning zero fee');
        const zeroFee = zeroMoney('SAT');
        return {
          low: zeroFee,
          medium: zeroFee,
          high: zeroFee,
          estimatedSettlementSeconds: 60,
        } satisfies FeeEstimate;
      }

      const feeSats = probeResult.amount ?? 0;
      const feeMoney = money(feeSats, 'SAT', `${feeSats} sats`);

      log.debug({ feeSats, destination: destination.slice(0, 20) }, 'Fee probe complete');

      return {
        low: feeMoney,
        medium: feeMoney,
        high: feeMoney,
        estimatedSettlementSeconds: 30,
      } satisfies FeeEstimate;
    });
  }

  /**
   * Resolve a Flash username, phone number, or Lightning address to an account ID.
   */
  async resolveRecipient(
    identifier: string,
  ): Promise<{ accountId: string; displayName: string } | null> {
    const authToken = this.resolveToken();

    // Phone numbers and Lightning addresses aren't directly resolvable via
    // accountDefaultWallet (which needs a username). Treat them accordingly.
    if (isPhoneNumber(identifier)) {
      log.debug({ identifier }, 'Phone number resolution not directly supported via Flash API');
      return null;
    }

    if (isLightningAddress(identifier)) {
      log.debug({ identifier }, 'Lightning address resolution not supported via Flash API');
      return null;
    }

    return withRetry(async () => {
      try {
        const data =
          await this.executeGraphQL<FlashAccountDefaultWalletResponse['data']>(
            ACCOUNT_DEFAULT_WALLET_QUERY,
            { username: identifier },
            authToken,
          );

        const walletId = data.accountDefaultWallet?.id;
        if (!walletId) return null;

        log.debug({ identifier, walletId }, 'Recipient resolved');
        return { accountId: walletId, displayName: identifier };
      } catch (err) {
        if (err instanceof FlashAPIError && err.code === 'GRAPHQL_ERROR') {
          // Username not found is typically a GraphQL error
          log.debug({ identifier, err }, 'Recipient not found');
          return null;
        }
        throw err;
      }
    });
  }

  /**
   * Health check — returns true if the Flash GraphQL API is reachable.
   */
  async ping(): Promise<boolean> {
    const authToken = this.defaultAuthToken ?? 'ping-test';

    try {
      const response = await fetch(this.graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ query: PING_QUERY, variables: {} }),
        signal: AbortSignal.timeout(this.defaultTimeout),
      });
      // Any HTTP response (even 401) means the API is reachable
      log.debug({ status: response.status }, 'Flash API ping');
      return response.status < 500;
    } catch {
      log.warn('Flash API ping failed');
      return false;
    }
  }
}
