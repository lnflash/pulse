import { Test, TestingModule } from '@nestjs/testing';
import { GaloyService } from './galoy.service';
import { FlashApiService } from '../../modules/flash-api/flash-api.service';

describe('GaloyService', () => {
  let service: GaloyService;
  let flashApiService: jest.Mocked<FlashApiService>;

  const mockAuthToken = 'auth-token-123';

  const mockWallets = [
    {
      id: 'wallet1',
      walletCurrency: 'BTC',
      balance: 100000,
    },
    {
      id: 'wallet2',
      walletCurrency: 'USD',
      balance: 5000,
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GaloyService,
        {
          provide: FlashApiService,
          useValue: {
            executeQuery: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GaloyService>(GaloyService);
    flashApiService = module.get(FlashApiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeQuery', () => {
    it('should delegate to FlashApiService', async () => {
      // Arrange
      const query = 'query Test { test }';
      const variables = { id: '123' };
      const expectedResult = { test: 'result' };
      flashApiService.executeQuery.mockResolvedValue(expectedResult);

      // Act
      const result = await service.executeQuery(query, variables, mockAuthToken);

      // Assert
      expect(result).toEqual(expectedResult);
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(query, variables, mockAuthToken);
    });

    it('should work without variables', async () => {
      // Arrange
      const query = 'query Test { test }';
      flashApiService.executeQuery.mockResolvedValue({ test: 'data' });

      // Act
      await service.executeQuery(query);

      // Assert
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(query, {}, undefined);
    });
  });

  describe('getWallets', () => {
    it('should fetch wallets successfully', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        me: {
          defaultAccount: {
            wallets: mockWallets,
          },
        },
      });

      // Act
      const result = await service.getWallets(mockAuthToken);

      // Assert
      expect(result).toEqual(mockWallets);
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('GetWallets'),
        {},
        mockAuthToken
      );
    });

    it('should return empty array when no wallets', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        me: {
          defaultAccount: {
            wallets: null,
          },
        },
      });

      // Act
      const result = await service.getWallets(mockAuthToken);

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle missing user data', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({ me: null });

      // Act
      const result = await service.getWallets(mockAuthToken);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('sendIntraledger', () => {
    it('should send intraledger payment', async () => {
      // Arrange
      const params = {
        walletId: 'wallet1',
        recipientWalletId: 'wallet2',
        amount: 1000,
        memo: 'Test payment',
      };
      const expectedResponse = {
        intraLedgerPaymentSend: {
          status: 'SUCCESS',
          errors: [],
        },
      };
      flashApiService.executeQuery.mockResolvedValue(expectedResponse);

      // Act
      const result = await service.sendIntraledger(params, mockAuthToken);

      // Assert
      expect(result).toEqual(expectedResponse);
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('intraLedgerPaymentSend'),
        { input: params },
        mockAuthToken
      );
    });

    it('should handle payment errors', async () => {
      // Arrange
      const params = { walletId: 'invalid' };
      const errorResponse = {
        intraLedgerPaymentSend: {
          status: 'FAILED',
          errors: [{ message: 'Insufficient balance' }],
        },
      };
      flashApiService.executeQuery.mockResolvedValue(errorResponse);

      // Act
      const result = await service.sendIntraledger(params, mockAuthToken);

      // Assert
      expect(result).toEqual(errorResponse);
    });
  });

  describe('payInvoice', () => {
    it('should pay Lightning invoice', async () => {
      // Arrange
      const params = {
        walletId: 'wallet1',
        paymentRequest: 'lnbc1234...',
        memo: 'Invoice payment',
      };
      const expectedResponse = {
        lnInvoicePaymentSend: {
          status: 'SUCCESS',
          errors: [],
        },
      };
      flashApiService.executeQuery.mockResolvedValue(expectedResponse);

      // Act
      const result = await service.payInvoice(params, mockAuthToken);

      // Assert
      expect(result).toEqual(expectedResponse);
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('lnInvoicePaymentSend'),
        { input: params },
        mockAuthToken
      );
    });

    it('should handle invoice payment failure', async () => {
      // Arrange
      const params = { walletId: 'wallet1', paymentRequest: 'invalid' };
      const errorResponse = {
        lnInvoicePaymentSend: {
          status: 'FAILED',
          errors: [{ message: 'Invalid invoice' }],
        },
      };
      flashApiService.executeQuery.mockResolvedValue(errorResponse);

      // Act
      const result = await service.payInvoice(params, mockAuthToken);

      // Assert
      expect(result).toEqual(errorResponse);
    });
  });

  describe('decodeInvoice', () => {
    it('should decode Lightning invoice', async () => {
      // Arrange
      const invoice = 'lnbc1234...';
      const decodedData = {
        lnInvoiceDecode: {
          amount: 10000,
          description: 'Test invoice',
          expiresAt: '2024-12-31T23:59:59Z',
        },
      };
      flashApiService.executeQuery.mockResolvedValue(decodedData);

      // Act
      const result = await service.decodeInvoice(invoice, mockAuthToken);

      // Assert
      expect(result).toEqual(decodedData);
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('lnInvoiceDecode'),
        { invoice },
        mockAuthToken
      );
    });

    it('should handle invalid invoice', async () => {
      // Arrange
      const invoice = 'invalid';
      flashApiService.executeQuery.mockResolvedValue({
        lnInvoiceDecode: null,
      });

      // Act
      const result = await service.decodeInvoice(invoice, mockAuthToken);

      // Assert
      expect(result).toEqual({ lnInvoiceDecode: null });
    });
  });

  describe('sendOnchain', () => {
    it('should send onchain payment', async () => {
      // Arrange
      const params = {
        walletId: 'wallet1',
        address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        amount: 50000,
        memo: 'Onchain payment',
      };
      const expectedResponse = {
        onChainPaymentSend: {
          status: 'SUCCESS',
          errors: [],
        },
      };
      flashApiService.executeQuery.mockResolvedValue(expectedResponse);

      // Act
      const result = await service.sendOnchain(params, mockAuthToken);

      // Assert
      expect(result).toEqual(expectedResponse);
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('onChainPaymentSend'),
        { input: params },
        mockAuthToken
      );
    });

    it('should handle onchain payment errors', async () => {
      // Arrange
      const params = { walletId: 'wallet1', address: 'invalid', amount: 1000 };
      const errorResponse = {
        onChainPaymentSend: {
          status: 'FAILED',
          errors: [{ message: 'Invalid address' }],
        },
      };
      flashApiService.executeQuery.mockResolvedValue(errorResponse);

      // Act
      const result = await service.sendOnchain(params, mockAuthToken);

      // Assert
      expect(result).toEqual(errorResponse);
    });
  });

  describe('Mock implementations', () => {
    it('should check if user exists', async () => {
      // Act
      const result = await service.checkUserExists('user123', mockAuthToken);

      // Assert
      expect(result).toBe(true);
    });

    it('should get node info', async () => {
      // Act
      const result = await service.getNodeInfo(mockAuthToken);

      // Assert
      expect(result).toEqual({ isOnline: true });
    });

    it('should get onchain fee estimates', async () => {
      // Act
      const result = await service.getOnchainFeeEstimates(mockAuthToken);

      // Assert
      expect(result).toEqual({ fast: 20, medium: 10, slow: 5 });
    });

    it('should get onchain balance', async () => {
      // Act
      const result = await service.getOnchainBalance(mockAuthToken);

      // Assert
      expect(result).toEqual({ confirmed: 1000000, unconfirmed: 0 });
    });
  });

  describe('Error handling', () => {
    it('should propagate executeQuery errors', async () => {
      // Arrange
      flashApiService.executeQuery.mockRejectedValue(new Error('Network error'));

      // Act & Assert
      await expect(service.getWallets(mockAuthToken)).rejects.toThrow('Network error');
    });

    it('should handle GraphQL errors in response', async () => {
      // Arrange
      const graphqlError = {
        errors: [
          {
            message: 'Authentication required',
            extensions: { code: 'UNAUTHENTICATED' },
          },
        ],
      };
      flashApiService.executeQuery.mockResolvedValue(graphqlError);

      // Act
      const result = await service.getWallets(mockAuthToken);

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle timeout errors', async () => {
      // Arrange
      flashApiService.executeQuery.mockRejectedValue(new Error('Request timeout'));

      // Act & Assert
      await expect(service.payInvoice({}, mockAuthToken)).rejects.toThrow('Request timeout');
    });
  });

  describe('Query construction', () => {
    it('should construct valid wallet query', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({ me: null });

      // Act
      await service.getWallets(mockAuthToken);

      // Assert
      const query = flashApiService.executeQuery.mock.calls[0][0];
      expect(query).toContain('query GetWallets');
      expect(query).toContain('walletCurrency');
      expect(query).toContain('balance');
    });

    it('should construct valid intraledger mutation', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({});

      // Act
      await service.sendIntraledger({}, mockAuthToken);

      // Assert
      const mutation = flashApiService.executeQuery.mock.calls[0][0];
      expect(mutation).toContain('mutation intraLedgerPaymentSend');
      expect(mutation).toContain('$input: IntraLedgerPaymentSendInput!');
    });

    it('should construct valid invoice payment mutation', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({});

      // Act
      await service.payInvoice({}, mockAuthToken);

      // Assert
      const mutation = flashApiService.executeQuery.mock.calls[0][0];
      expect(mutation).toContain('mutation lnInvoicePaymentSend');
      expect(mutation).toContain('$input: LnInvoicePaymentInput!');
    });

    it('should construct valid invoice decode query', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({});

      // Act
      await service.decodeInvoice('invoice', mockAuthToken);

      // Assert
      const query = flashApiService.executeQuery.mock.calls[0][0];
      expect(query).toContain('query lnInvoiceDecode');
      expect(query).toContain('$invoice: LnPaymentRequest!');
    });

    it('should construct valid onchain payment mutation', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({});

      // Act
      await service.sendOnchain({}, mockAuthToken);

      // Assert
      const mutation = flashApiService.executeQuery.mock.calls[0][0];
      expect(mutation).toContain('mutation onChainPaymentSend');
      expect(mutation).toContain('$input: OnChainPaymentSendInput!');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty auth token', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({ me: null });

      // Act
      await service.getWallets('');

      // Assert
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        {},
        ''
      );
    });

    it('should handle complex nested response', async () => {
      // Arrange
      const complexResponse = {
        me: {
          defaultAccount: {
            wallets: [
              {
                id: 'wallet1',
                walletCurrency: 'BTC',
                balance: 100000,
                transactions: {
                  edges: [{ node: { id: 'tx1' } }],
                },
              },
            ],
          },
        },
      };
      flashApiService.executeQuery.mockResolvedValue(complexResponse);

      // Act
      const result = await service.getWallets(mockAuthToken);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].transactions).toBeDefined();
    });

    it('should handle concurrent requests', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        me: { defaultAccount: { wallets: mockWallets } },
      });

      // Act
      const promises = Array(5).fill(null).map(() => 
        service.getWallets(mockAuthToken)
      );
      const results = await Promise.all(promises);

      // Assert
      expect(results).toHaveLength(5);
      results.forEach(result => expect(result).toEqual(mockWallets));
      expect(flashApiService.executeQuery).toHaveBeenCalledTimes(5);
    });
  });
});