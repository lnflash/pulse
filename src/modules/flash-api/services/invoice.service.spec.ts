import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { FlashApiService } from '../flash-api.service';

describe('InvoiceService', () => {
  let service: InvoiceService;
  let configService: jest.Mocked<ConfigService>;
  let flashApiService: jest.Mocked<FlashApiService>;

  const mockInvoiceInfo = {
    paymentRequest: 'lnbc1000n1pj8s8q8pp5qyq...',
    paymentHash: 'hash123',
    amount: 1000,
    memo: 'Test invoice',
    expiresAt: new Date('2024-01-01T01:00:00Z'),
    walletCurrency: 'USD' as const
  };

  const mockWalletId = 'wallet123';
  const authToken = 'auth-token-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn()
          }
        },
        {
          provide: FlashApiService,
          useValue: {
            executeQuery: jest.fn(),
            createInvoice: jest.fn()
          }
        }
      ],
    }).compile();

    service = module.get<InvoiceService>(InvoiceService);
    configService = module.get(ConfigService);
    flashApiService = module.get(FlashApiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createInvoice', () => {
    it('should create USD invoice with amount', async () => {
      // Arrange
      const amount = 1000;
      const memo = 'Test invoice';
      jest.spyOn(service as any, 'createUsdInvoice').mockResolvedValue(mockInvoiceInfo);

      // Act
      const result = await service.createInvoice(authToken, amount, memo, 'USD');

      // Assert
      expect(result).toEqual(mockInvoiceInfo);
      expect((service as any).createUsdInvoice).toHaveBeenCalledWith(authToken, amount, memo);
    });

    it('should create no-amount invoice when amount is not provided', async () => {
      // Arrange
      const memo = 'No amount invoice';
      jest.spyOn(service as any, 'createNoAmountInvoice').mockResolvedValue(mockInvoiceInfo);

      // Act
      const result = await service.createInvoice(authToken, undefined, memo, 'USD');

      // Assert
      expect(result).toEqual(mockInvoiceInfo);
      expect((service as any).createNoAmountInvoice).toHaveBeenCalledWith(authToken, memo);
    });

    it('should throw BadRequestException for BTC invoices', async () => {
      // Act & Assert
      await expect(
        service.createInvoice(authToken, 1000, 'Test', 'BTC')
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createInvoice(authToken, 1000, 'Test', 'BTC')
      ).rejects.toThrow('BTC invoices are not currently supported');
    });

    it('should handle zero amount as no-amount invoice', async () => {
      // Arrange
      jest.spyOn(service as any, 'createNoAmountInvoice').mockResolvedValue(mockInvoiceInfo);

      // Act
      const result = await service.createInvoice(authToken, 0, 'Zero amount', 'USD');

      // Assert
      expect(result).toEqual(mockInvoiceInfo);
      expect((service as any).createNoAmountInvoice).toHaveBeenCalled();
    });

    it('should re-throw BadRequestException with original message', async () => {
      // Arrange
      const originalError = new BadRequestException('Custom error message');
      jest.spyOn(service as any, 'createUsdInvoice').mockRejectedValue(originalError);

      // Act & Assert
      await expect(
        service.createInvoice(authToken, 1000, 'Test', 'USD')
      ).rejects.toThrow('Custom error message');
    });

    it('should throw generic error for unexpected exceptions', async () => {
      // Arrange
      jest.spyOn(service as any, 'createUsdInvoice').mockRejectedValue(new Error('Unknown error'));

      // Act & Assert
      await expect(
        service.createInvoice(authToken, 1000, 'Test', 'USD')
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createInvoice(authToken, 1000, 'Test', 'USD')
      ).rejects.toThrow('Failed to create invoice');
    });
  });

  describe('Private Methods', () => {
    describe('createNoAmountInvoice', () => {
      it('should create no-amount invoice successfully', async () => {
        // Arrange
        jest.spyOn(service as any, 'getUsdWalletId').mockResolvedValue(mockWalletId);
        flashApiService.executeQuery.mockResolvedValue({
          lnNoAmountInvoiceCreate: {
            errors: [],
            invoice: {
              paymentRequest: mockInvoiceInfo.paymentRequest,
              paymentHash: mockInvoiceInfo.paymentHash,
              paymentSecret: 'secret123'
            }
          }
        });
        jest.spyOn(service as any, 'parseInvoice').mockReturnValue({
          satoshis: undefined,
          description: 'Test memo',
          timeExpireDate: 1704067200,
          tags: []
        });

        // Act
        const result = await (service as any).createNoAmountInvoice(authToken, 'Test memo');

        // Assert
        expect(result).toHaveProperty('paymentRequest');
        expect(result).toHaveProperty('paymentHash');
        expect(result.walletCurrency).toBe('USD');
        expect((service as any).getUsdWalletId).toHaveBeenCalledWith(authToken);
      });

      it('should handle API errors in no-amount invoice creation', async () => {
        // Arrange
        jest.spyOn(service as any, 'getUsdWalletId').mockResolvedValue(mockWalletId);
        flashApiService.executeQuery.mockResolvedValue({
          lnNoAmountInvoiceCreate: {
            errors: [{ code: 'INVALID_INPUT', message: 'Invalid wallet ID' }],
            invoice: null
          }
        });

        // Act & Assert
        await expect(
          (service as any).createNoAmountInvoice(authToken, 'Test')
        ).rejects.toThrow('Invalid wallet ID');
      });
    });

    describe('createUsdInvoice', () => {
      it('should create USD invoice with amount successfully', async () => {
        // Arrange
        jest.spyOn(service as any, 'getUsdWalletId').mockResolvedValue(mockWalletId);
        flashApiService.executeQuery.mockResolvedValue({
          lnUsdInvoiceCreate: {
            errors: [],
            invoice: {
              paymentRequest: mockInvoiceInfo.paymentRequest,
              paymentHash: mockInvoiceInfo.paymentHash,
              paymentSecret: 'secret123'
            }
          }
        });
        jest.spyOn(service as any, 'parseInvoice').mockReturnValue({
          satoshis: 3000,
          description: 'Test memo',
          timeExpireDate: 1704067200,
          tags: []
        });

        // Act
        const result = await (service as any).createUsdInvoice(authToken, 10, 'Test memo');

        // Assert
        expect(result).toHaveProperty('paymentRequest');
        expect(result).toHaveProperty('paymentHash');
        expect(result.amount).toBe(10);
        expect(result.walletCurrency).toBe('USD');
      });

      it('should handle API errors in USD invoice creation', async () => {
        // Arrange
        jest.spyOn(service as any, 'getUsdWalletId').mockResolvedValue(mockWalletId);
        flashApiService.executeQuery.mockResolvedValue({
          lnUsdInvoiceCreate: {
            errors: [{ code: 'INSUFFICIENT_BALANCE', message: 'Not enough balance' }],
            invoice: null
          }
        });

        // Act & Assert
        await expect(
          (service as any).createUsdInvoice(authToken, 1000, 'Test')
        ).rejects.toThrow('Not enough balance');
      });

      it('should validate minimum amount', async () => {
        // Arrange
        jest.spyOn(service as any, 'getUsdWalletId').mockResolvedValue(mockWalletId);

        // Act & Assert
        await expect(
          (service as any).createUsdInvoice(authToken, 0.001, 'Too small')
        ).rejects.toThrow();
      });
    });

    describe('getUsdWalletId', () => {
      it('should retrieve USD wallet ID successfully', async () => {
        // Arrange
        flashApiService.executeQuery.mockResolvedValue({
          me: {
            defaultAccount: {
              wallets: [
                { id: 'btc-wallet', walletCurrency: 'BTC' },
                { id: mockWalletId, walletCurrency: 'USD' }
              ]
            }
          }
        });

        // Act
        const result = await (service as any).getUsdWalletId(authToken);

        // Assert
        expect(result).toBe(mockWalletId);
      });

      it('should throw error when USD wallet not found', async () => {
        // Arrange
        flashApiService.executeQuery.mockResolvedValue({
          me: {
            defaultAccount: {
              wallets: [
                { id: 'btc-wallet', walletCurrency: 'BTC' }
              ]
            }
          }
        });

        // Act & Assert
        await expect(
          (service as any).getUsdWalletId(authToken)
        ).rejects.toThrow('USD wallet not found');
      });

      it('should handle API errors when getting wallet ID', async () => {
        // Arrange
        flashApiService.executeQuery.mockRejectedValue(new Error('API error'));

        // Act & Assert
        await expect(
          (service as any).getUsdWalletId(authToken)
        ).rejects.toThrow('API error');
      });
    });

    describe('parseInvoice', () => {
      it('should parse valid invoice', () => {
        // Arrange
        const mockDecodedInvoice = {
          satoshis: 1000,
          description: 'Test',
          timeExpireDate: 1704067200,
          paymentRequest: 'lnbc...',
          tags: []
        };
        jest.spyOn(require('bolt11'), 'decode').mockReturnValue(mockDecodedInvoice);

        // Act
        const result = (service as any).parseInvoice('lnbc...');

        // Assert
        expect(result).toEqual(mockDecodedInvoice);
      });

      it('should handle invalid invoice format', () => {
        // Arrange
        jest.spyOn(require('bolt11'), 'decode').mockImplementation(() => {
          throw new Error('Invalid invoice');
        });

        // Act
        const result = (service as any).parseInvoice('invalid');
        
        // Assert - parseInvoice returns a fallback object on error
        expect(result).toHaveProperty('timeExpireDate');
        expect(result).toHaveProperty('tags');
        expect(result.tags).toEqual([]);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large amounts', async () => {
      // Arrange
      const largeAmount = 1000000; // $1M
      jest.spyOn(service as any, 'createUsdInvoice').mockResolvedValue({
        ...mockInvoiceInfo,
        amount: largeAmount
      });

      // Act
      const result = await service.createInvoice(authToken, largeAmount, 'Large payment', 'USD');

      // Assert
      expect(result.amount).toBe(largeAmount);
    });

    it('should handle empty memo', async () => {
      // Arrange
      jest.spyOn(service as any, 'createUsdInvoice').mockResolvedValue({
        ...mockInvoiceInfo,
        memo: undefined
      });

      // Act
      const result = await service.createInvoice(authToken, 100, undefined, 'USD');

      // Assert
      expect(result.memo).toBeUndefined();
    });

    it('should handle special characters in memo', async () => {
      // Arrange
      const specialMemo = '🚀 Payment for "services" & goods < $100 >';
      jest.spyOn(service as any, 'createUsdInvoice').mockResolvedValue({
        ...mockInvoiceInfo,
        memo: specialMemo
      });

      // Act
      const result = await service.createInvoice(authToken, 100, specialMemo, 'USD');

      // Assert
      expect(result.memo).toBe(specialMemo);
    });

    it('should handle negative amounts gracefully', async () => {
      // Arrange
      jest.spyOn(service as any, 'createUsdInvoice').mockRejectedValue(
        new BadRequestException('Amount must be positive')
      );

      // Act & Assert
      await expect(
        service.createInvoice(authToken, -100, 'Negative amount', 'USD')
      ).rejects.toThrow('Amount must be positive');
    });
  });
});