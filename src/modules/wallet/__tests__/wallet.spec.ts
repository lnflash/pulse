import { FlashApiClient } from '../flash-api.client';
import { BalanceService, BalanceInfo } from '../services/balance.service';
import { PaymentService } from '../services/payment.service';
import { InvoiceService } from '../services/invoice.service';
import { PriceService } from '../services/price.service';
import { TransactionService } from '../services/transaction.service';
import { UserService } from '../services/user.service';
import { WalletFacade } from '../wallet.facade';
import { UserId } from '../../../core/types';
import { SessionPort, Session } from '../../../core/ports/session.port';

function mockClient(): jest.Mocked<FlashApiClient> {
  return { execute: jest.fn() } as any;
}

function mockSessionPort(authToken = 'test-token'): jest.Mocked<SessionPort> {
  return {
    getSession: jest.fn().mockResolvedValue({
      userId: UserId.generate(),
      flashAuthToken: authToken,
      lastActivity: new Date(),
    } as Session),
    getOrCreateSession: jest.fn(),
    updateSession: jest.fn(),
    deleteSession: jest.fn(),
  };
}

const AUTH_TOKEN = 'test-auth-token';
const TEST_USER_ID = UserId.generate();
const USER_ID_STR = TEST_USER_ID.value;

describe('BalanceService', () => {
  let client: jest.Mocked<FlashApiClient>;
  let service: BalanceService;

  beforeEach(() => {
    client = mockClient();
    service = new BalanceService(client);
  });

  const apiResponse = {
    me: {
      defaultAccount: {
        displayCurrency: 'USD',
        realtimePrice: {
          btcSatPrice: { base: 43215, offset: 2 },
          usdCentPrice: { base: 43215, offset: 2 },
        },
        wallets: [
          { id: 'btc-wallet', balance: 100000, walletCurrency: 'BTC' },
          { id: 'usd-wallet', balance: 3050, walletCurrency: 'USD' },
        ],
      },
    },
  };

  it('fetches balance from API', async () => {
    client.execute.mockResolvedValue(apiResponse);

    const result = await service.getBalance(AUTH_TOKEN, USER_ID_STR);

    expect(result.btcBalance).toBe(100000);
    expect(result.fiatBalance).toBe(30.5);
    expect(result.fiatCurrency).toBe('USD');
    expect(client.execute).toHaveBeenCalledTimes(1);
  });

  it('returns cached balance on second call', async () => {
    client.execute.mockResolvedValue(apiResponse);

    await service.getBalance(AUTH_TOKEN, USER_ID_STR);
    const result = await service.getBalance(AUTH_TOKEN, USER_ID_STR);

    expect(result.btcBalance).toBe(100000);
    expect(client.execute).toHaveBeenCalledTimes(1);
  });

  it('refetches after cache clear', async () => {
    client.execute.mockResolvedValue(apiResponse);

    await service.getBalance(AUTH_TOKEN, USER_ID_STR);
    service.clearCache(USER_ID_STR);
    await service.getBalance(AUTH_TOKEN, USER_ID_STR);

    expect(client.execute).toHaveBeenCalledTimes(2);
  });
});

describe('PaymentService', () => {
  let client: jest.Mocked<FlashApiClient>;
  let service: PaymentService;

  beforeEach(() => {
    client = mockClient();
    service = new PaymentService(client);
  });

  it('sends lightning payment with amount + destination', async () => {
    client.execute.mockResolvedValue({
      lnInvoicePaymentSend: { status: 'SUCCESS' },
    });

    const result = await service.sendLightningPayment(AUTH_TOKEN, {
      walletId: 'btc-wallet',
      paymentRequest: 'lnbc1000...',
      memo: 'test',
    });

    expect(result.status).toBe('SUCCESS');
    expect(client.execute).toHaveBeenCalledWith(
      expect.any(String),
      { input: { walletId: 'btc-wallet', paymentRequest: 'lnbc1000...', memo: 'test' } },
      AUTH_TOKEN,
    );
  });
});

describe('InvoiceService', () => {
  let client: jest.Mocked<FlashApiClient>;
  let service: InvoiceService;

  beforeEach(() => {
    client = mockClient();
    service = new InvoiceService(client);
  });

  it('creates invoice with amount', async () => {
    // First call: get USD wallet ID
    client.execute.mockResolvedValueOnce({
      me: { defaultAccount: { wallets: [{ id: 'usd-wallet', walletCurrency: 'USD' }] } },
    });
    // Second call: create invoice
    client.execute.mockResolvedValueOnce({
      lnUsdInvoiceCreate: {
        errors: [],
        invoice: { paymentRequest: 'lnbc500...', paymentHash: 'hash123', satoshis: 500 },
      },
    });

    const result = await service.createInvoice(AUTH_TOKEN, { amount: 5.0, memo: 'test' });

    expect(result.paymentRequest).toBe('lnbc500...');
    expect(result.paymentHash).toBe('hash123');
  });
});

describe('PriceService', () => {
  let client: jest.Mocked<FlashApiClient>;
  let service: PriceService;

  beforeEach(() => {
    client = mockClient();
    service = new PriceService(client);
  });

  it('converts satoshi price to BTC price', async () => {
    client.execute.mockResolvedValue({
      realtimePrice: {
        btcSatPrice: { base: 50000, offset: 4 },
        usdCentPrice: { base: 50000, offset: 4 },
        denominatorCurrency: 'USD',
        timestamp: Date.now() / 1000,
      },
    });

    const result = await service.getPrice('USD');

    expect(result.btcPrice).toBeGreaterThan(0);
    expect(result.currency).toBe('USD');
    expect(result.timestamp).toBeInstanceOf(Date);
  });
});

describe('TransactionService', () => {
  let client: jest.Mocked<FlashApiClient>;
  let service: TransactionService;

  beforeEach(() => {
    client = mockClient();
    service = new TransactionService(client);
  });

  it('fetches transaction history', async () => {
    client.execute.mockResolvedValue({
      me: {
        defaultAccount: {
          transactions: {
            pageInfo: { hasNextPage: false, hasPreviousPage: false },
            edges: [{ cursor: 'c1', node: { id: 'tx1', status: 'SUCCESS', direction: 'RECEIVE' } }],
          },
        },
      },
    });

    const result = await service.getTransactionHistory(AUTH_TOKEN, 10);

    expect(result).not.toBeNull();
    expect(result!.edges).toHaveLength(1);
    expect(result!.edges[0].node.id).toBe('tx1');
  });
});

describe('UserService', () => {
  let client: jest.Mocked<FlashApiClient>;
  let service: UserService;

  beforeEach(() => {
    client = mockClient();
    service = new UserService(client);
  });

  it('resolves wallet ID by username', async () => {
    client.execute.mockResolvedValue({
      accountDefaultWallet: { id: 'wallet-123' },
    });

    const walletId = await service.resolveWalletIdByUsername('testuser');
    expect(walletId).toBe('wallet-123');
  });
});

describe('WalletFacade', () => {
  let facade: WalletFacade;
  let sessionPort: jest.Mocked<SessionPort>;
  let client: jest.Mocked<FlashApiClient>;
  const userId = TEST_USER_ID;

  beforeEach(() => {
    client = mockClient();
    sessionPort = mockSessionPort(AUTH_TOKEN);
    facade = new WalletFacade(
      sessionPort,
      new BalanceService(client),
      new PaymentService(client),
      new InvoiceService(client),
      new TransactionService(client),
      new PriceService(client),
    );
  });

  it('getBalance delegates through session + balance service', async () => {
    client.execute.mockResolvedValue({
      me: {
        defaultAccount: {
          displayCurrency: 'USD',
          realtimePrice: {
            btcSatPrice: { base: 100, offset: 2 },
            usdCentPrice: { base: 100, offset: 2 },
          },
          wallets: [{ id: 'w1', balance: 5000, walletCurrency: 'BTC' }],
        },
      },
    });

    const result = (await facade.getBalance(userId)) as BalanceInfo;
    expect(result.btcBalance).toBe(5000);
    expect(sessionPort.getSession).toHaveBeenCalledWith(userId);
  });

  it('throws when no auth token in session', async () => {
    sessionPort.getSession.mockResolvedValue({
      userId,
      lastActivity: new Date(),
    } as Session);

    await expect(facade.getBalance(userId)).rejects.toThrow('No Flash auth token');
  });
});
