import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { PriceService } from './price.service';
import { FlashApiService } from '../flash-api.service';
import { RedisService } from '../../redis/redis.service';

describe('PriceService', () => {
  let service: PriceService;
  let configService: jest.Mocked<ConfigService>;
  let flashApiService: jest.Mocked<FlashApiService>;
  let redisService: jest.Mocked<RedisService>;

  const mockPriceData = {
    realtimePrice: {
      btcSatPrice: {
        base: 43215,
        offset: 6
      },
      usdCentPrice: {
        base: 4321500,
        offset: 2
      },
      denominatorCurrency: 'USD',
      timestamp: 1704067200 // 2024-01-01 00:00:00 UTC
    }
  };

  const mockAuthenticatedPriceData = {
    me: {
      defaultAccount: {
        realtimePrice: mockPriceData.realtimePrice
      }
    }
  };

  const authToken = 'auth-token-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn()
          }
        },
        {
          provide: FlashApiService,
          useValue: {
            executeQuery: jest.fn()
          }
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn()
          }
        }
      ],
    }).compile();

    service = module.get<PriceService>(PriceService);
    configService = module.get(ConfigService);
    flashApiService = module.get(FlashApiService);
    redisService = module.get(RedisService);

    // Mock Date.now() for consistent testing
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T00:30:00Z').getTime());
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Constructor', () => {
    it('should use default cache TTL when not configured', () => {
      // Arrange
      configService.get.mockReturnValue(undefined);

      // Act
      const newService = new PriceService(configService, flashApiService, redisService);

      // Assert
      expect((newService as any).cacheTtl).toBe(900); // 15 minutes default
    });

    it('should use configured cache TTL', () => {
      // Arrange
      configService.get.mockReturnValue(1800);

      // Act
      const newService = new PriceService(configService, flashApiService, redisService);

      // Assert
      expect((newService as any).cacheTtl).toBe(1800);
    });
  });

  describe('getBitcoinPrice', () => {
    it('should return cached price when available', async () => {
      // Arrange
      const cachedPrice = {
        btcPrice: 43215.00,
        currency: 'USD',
        timestamp: new Date('2024-01-01T00:00:00Z')
      };
      redisService.get.mockResolvedValue(JSON.stringify(cachedPrice));

      // Act
      const result = await service.getBitcoinPrice('USD');

      // Assert
      expect(result).toEqual(cachedPrice);
      expect(redisService.get).toHaveBeenCalledWith('price:btc:USD');
      expect(flashApiService.executeQuery).not.toHaveBeenCalled();
    });

    it('should fetch from API when cache is empty', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);
      flashApiService.executeQuery.mockResolvedValue(mockPriceData);
      redisService.set.mockResolvedValue(undefined);

      // Act
      const result = await service.getBitcoinPrice('USD');

      // Assert
      expect(result.btcPrice).toBeCloseTo(43215.00, 2);
      expect(result.currency).toBe('USD');
      expect(flashApiService.executeQuery).toHaveBeenCalled();
      expect(redisService.set).toHaveBeenCalled();
    });

    it('should use authenticated query when authToken provided', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);
      flashApiService.executeQuery.mockResolvedValue(mockAuthenticatedPriceData);
      redisService.set.mockResolvedValue(undefined);

      // Act
      const result = await service.getBitcoinPrice('USD', authToken);

      // Assert
      expect(result.btcPrice).toBeCloseTo(43215.00, 2);
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('me {'),
        {},
        authToken
      );
    });

    it('should use unauthenticated query without authToken', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);
      flashApiService.executeQuery.mockResolvedValue(mockPriceData);
      redisService.set.mockResolvedValue(undefined);

      // Act
      const result = await service.getBitcoinPrice('USD');

      // Assert
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('realtimePriceUnauthed'),
        { currency: 'USD' },
        undefined
      );
    });

    it('should handle different currencies', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);
      const eurPriceData = {
        realtimePrice: {
          ...mockPriceData.realtimePrice,
          denominatorCurrency: 'EUR'
        }
      };
      flashApiService.executeQuery.mockResolvedValue(eurPriceData);
      redisService.set.mockResolvedValue(undefined);

      // Act
      const result = await service.getBitcoinPrice('EUR');

      // Assert
      expect(result.currency).toBe('EUR');
      expect(redisService.get).toHaveBeenCalledWith('price:btc:EUR');
    });

    it('should throw BadRequestException when no price data available', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);
      flashApiService.executeQuery.mockResolvedValue({});

      // Act & Assert
      await expect(service.getBitcoinPrice('USD')).rejects.toThrow(BadRequestException);
      await expect(service.getBitcoinPrice('USD')).rejects.toThrow(
        'Price not available for USD'
      );
    });

    it('should handle network errors gracefully', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);
      flashApiService.executeQuery.mockRejectedValue(new Error('Network fetch failed'));

      // Act & Assert
      await expect(service.getBitcoinPrice('USD')).rejects.toThrow(BadRequestException);
      await expect(service.getBitcoinPrice('USD')).rejects.toThrow(
        'Network error: Unable to connect to price service'
      );
    });

    it('should handle generic errors', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);
      flashApiService.executeQuery.mockRejectedValue(new Error('Unknown error'));

      // Act & Assert
      await expect(service.getBitcoinPrice('USD')).rejects.toThrow(BadRequestException);
      await expect(service.getBitcoinPrice('USD')).rejects.toThrow(
        'Failed to retrieve Bitcoin price'
      );
    });
  });

  describe('formatPriceMessage', () => {
    it('should format USD price message correctly', () => {
      // Arrange
      const priceInfo = {
        btcPrice: 43215.00,
        currency: 'USD',
        timestamp: new Date('2024-01-01T00:00:00Z')
      };

      // Act
      const result = service.formatPriceMessage(priceInfo);

      // Assert
      expect(result).toContain('*Bitcoin Price*');
      expect(result).toContain('1 BTC = $43,215.00');
      expect(result).toContain('30 minutes ago');
    });

    it('should format EUR price message correctly', () => {
      // Arrange
      const priceInfo = {
        btcPrice: 39500.50,
        currency: 'EUR',
        timestamp: new Date('2024-01-01T00:00:00Z')
      };

      // Act
      const result = service.formatPriceMessage(priceInfo);

      // Assert
      expect(result).toContain('€39,500.50');
    });

    it('should format JMD price message correctly', () => {
      // Arrange
      const priceInfo = {
        btcPrice: 6700000.00,
        currency: 'JMD',
        timestamp: new Date('2024-01-01T00:00:00Z')
      };

      // Act
      const result = service.formatPriceMessage(priceInfo);

      // Assert
      expect(result).toContain('J$6,700,000.00');
    });

    it('should format unknown currency with code prefix', () => {
      // Arrange
      const priceInfo = {
        btcPrice: 12345.67,
        currency: 'XYZ',
        timestamp: new Date('2024-01-01T00:00:00Z')
      };

      // Act
      const result = service.formatPriceMessage(priceInfo);

      // Assert
      expect(result).toContain('XYZ 12,345.67');
    });

    it('should show "just now" for recent prices', () => {
      // Arrange
      const priceInfo = {
        btcPrice: 43215.00,
        currency: 'USD',
        timestamp: new Date('2024-01-01T00:29:30Z') // 30 seconds ago
      };

      // Act
      const result = service.formatPriceMessage(priceInfo);

      // Assert
      expect(result).toContain('just now');
    });

    it('should show minutes for prices within an hour', () => {
      // Arrange
      const priceInfo = {
        btcPrice: 43215.00,
        currency: 'USD',
        timestamp: new Date('2024-01-01T00:15:00Z') // 15 minutes ago
      };

      // Act
      const result = service.formatPriceMessage(priceInfo);

      // Assert
      expect(result).toContain('15 minutes ago');
    });

    it('should show hours for older prices', () => {
      // Arrange
      const priceInfo = {
        btcPrice: 43215.00,
        currency: 'USD',
        timestamp: new Date('2023-12-31T22:30:00Z') // 2 hours ago
      };

      // Act
      const result = service.formatPriceMessage(priceInfo);

      // Assert
      expect(result).toContain('2 hours ago');
    });
  });

  describe('Private Methods', () => {
    describe('getCachedPrice', () => {
      it('should return parsed cached price', async () => {
        // Arrange
        const cachedData = {
          btcPrice: 43215.00,
          currency: 'USD',
          timestamp: new Date('2024-01-01T00:00:00Z')
        };
        redisService.get.mockResolvedValue(JSON.stringify(cachedData));

        // Act
        const result = await (service as any).getCachedPrice('price:btc:USD');

        // Assert
        expect(result).toEqual(cachedData);
      });

      it('should return null when cache is empty', async () => {
        // Arrange
        redisService.get.mockResolvedValue(null);

        // Act
        const result = await (service as any).getCachedPrice('price:btc:USD');

        // Assert
        expect(result).toBeNull();
      });

      it('should handle malformed JSON gracefully', async () => {
        // Arrange
        redisService.get.mockResolvedValue('invalid json');

        // Act
        const result = await (service as any).getCachedPrice('price:btc:USD');

        // Assert
        expect(result).toBeNull();
      });

      it('should handle Redis errors gracefully', async () => {
        // Arrange
        redisService.get.mockRejectedValue(new Error('Redis error'));

        // Act
        const result = await (service as any).getCachedPrice('price:btc:USD');

        // Assert
        expect(result).toBeNull();
      });
    });

    describe('cachePrice', () => {
      it('should cache price with correct TTL', async () => {
        // Arrange
        const priceInfo = {
          btcPrice: 43215.00,
          currency: 'USD',
          timestamp: new Date('2024-01-01T00:00:00Z')
        };
        redisService.set.mockResolvedValue(undefined);

        // Act
        await (service as any).cachePrice('price:btc:USD', priceInfo);

        // Assert
        expect(redisService.set).toHaveBeenCalledWith(
          'price:btc:USD',
          JSON.stringify(priceInfo),
          900 // Default TTL
        );
      });

      it('should handle cache errors gracefully', async () => {
        // Arrange
        const priceInfo = {
          btcPrice: 43215.00,
          currency: 'USD',
          timestamp: new Date()
        };
        redisService.set.mockRejectedValue(new Error('Redis error'));

        // Act & Assert - Should not throw
        await expect(
          (service as any).cachePrice('price:btc:USD', priceInfo)
        ).resolves.toBeUndefined();
      });
    });

    describe('fetchPriceFromApi', () => {
      it('should calculate BTC price correctly from satoshi price', async () => {
        // Arrange
        flashApiService.executeQuery.mockResolvedValue(mockPriceData);

        // Act
        const result = await (service as any).fetchPriceFromApi('USD');

        // Assert
        // btcSatPrice.base = 43215, offset = 6
        // 1 sat = 0.043215 cents
        // 1 BTC = 100,000,000 sats * 0.043215 cents = 4,321,500 cents = $43,215.00
        expect(result.btcPrice).toBeCloseTo(43215.00, 2);
      });

      it('should handle different price offsets', async () => {
        // Arrange
        const customPriceData = {
          realtimePrice: {
            btcSatPrice: {
              base: 432150,
              offset: 7
            },
            denominatorCurrency: 'USD',
            timestamp: 1704067200
          }
        };
        flashApiService.executeQuery.mockResolvedValue(customPriceData);

        // Act
        const result = await (service as any).fetchPriceFromApi('USD');

        // Assert
        expect(result.btcPrice).toBeCloseTo(43215.00, 2);
      });

      it('should convert Unix timestamp to Date', async () => {
        // Arrange
        flashApiService.executeQuery.mockResolvedValue(mockPriceData);

        // Act
        const result = await (service as any).fetchPriceFromApi('USD');

        // Assert
        expect(result.timestamp).toEqual(new Date('2024-01-01T00:00:00Z'));
      });

      it('should throw error when API returns no data', async () => {
        // Arrange
        flashApiService.executeQuery.mockResolvedValue({});

        // Act & Assert
        await expect(
          (service as any).fetchPriceFromApi('USD')
        ).rejects.toThrow('No price data available');
      });
    });

    describe('formatCurrencyAmount', () => {
      it('should format USD with dollar sign', () => {
        // Act
        const result = (service as any).formatCurrencyAmount(43215.00, 'USD');

        // Assert
        expect(result).toBe('$43,215.00');
      });

      it('should format EUR with euro sign', () => {
        // Act
        const result = (service as any).formatCurrencyAmount(39500.50, 'EUR');

        // Assert
        expect(result).toBe('€39,500.50');
      });

      it('should format JMD with J$ prefix', () => {
        // Act
        const result = (service as any).formatCurrencyAmount(6700000.00, 'JMD');

        // Assert
        expect(result).toBe('J$6,700,000.00');
      });

      it('should format unknown currency with code', () => {
        // Act
        const result = (service as any).formatCurrencyAmount(12345.67, 'GBP');

        // Assert
        expect(result).toBe('GBP 12,345.67');
      });

      it('should handle zero amounts', () => {
        // Act
        const result = (service as any).formatCurrencyAmount(0, 'USD');

        // Assert
        expect(result).toBe('$0.00');
      });

      it('should handle negative amounts', () => {
        // Act
        const result = (service as any).formatCurrencyAmount(-1000, 'USD');

        // Assert
        expect(result).toBe('$-1,000.00');
      });
    });

    describe('getTimeAgo', () => {
      it('should return "just now" for times less than 60 seconds', () => {
        // Arrange
        const timestamp = new Date('2024-01-01T00:29:45Z'); // 15 seconds ago

        // Act
        const result = (service as any).getTimeAgo(timestamp);

        // Assert
        expect(result).toBe('just now');
      });

      it('should return singular minute', () => {
        // Arrange
        const timestamp = new Date('2024-01-01T00:29:00Z'); // 1 minute ago

        // Act
        const result = (service as any).getTimeAgo(timestamp);

        // Assert
        expect(result).toBe('1 minute ago');
      });

      it('should return plural minutes', () => {
        // Arrange
        const timestamp = new Date('2024-01-01T00:00:00Z'); // 30 minutes ago

        // Act
        const result = (service as any).getTimeAgo(timestamp);

        // Assert
        expect(result).toBe('30 minutes ago');
      });

      it('should return singular hour', () => {
        // Arrange
        const timestamp = new Date('2023-12-31T23:30:00Z'); // 1 hour ago

        // Act
        const result = (service as any).getTimeAgo(timestamp);

        // Assert
        expect(result).toBe('1 hour ago');
      });

      it('should return plural hours', () => {
        // Arrange
        const timestamp = new Date('2023-12-31T21:30:00Z'); // 3 hours ago

        // Act
        const result = (service as any).getTimeAgo(timestamp);

        // Assert
        expect(result).toBe('3 hours ago');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large BTC prices', async () => {
      // Arrange
      const largePriceData = {
        realtimePrice: {
          btcSatPrice: {
            base: 1000000,
            offset: 6
          },
          denominatorCurrency: 'USD',
          timestamp: 1704067200
        }
      };
      redisService.get.mockResolvedValue(null);
      flashApiService.executeQuery.mockResolvedValue(largePriceData);
      redisService.set.mockResolvedValue(undefined);

      // Act
      const result = await service.getBitcoinPrice('USD');

      // Assert
      expect(result.btcPrice).toBeCloseTo(1000000.00, 2);
    });

    it('should handle very small BTC prices', async () => {
      // Arrange
      const smallPriceData = {
        realtimePrice: {
          btcSatPrice: {
            base: 1,
            offset: 6
          },
          denominatorCurrency: 'USD',
          timestamp: 1704067200
        }
      };
      redisService.get.mockResolvedValue(null);
      flashApiService.executeQuery.mockResolvedValue(smallPriceData);
      redisService.set.mockResolvedValue(undefined);

      // Act
      const result = await service.getBitcoinPrice('USD');

      // Assert
      expect(result.btcPrice).toBeCloseTo(1.00, 2);
    });

    it('should handle zero offset in price data', async () => {
      // Arrange
      const zeroOffsetData = {
        realtimePrice: {
          btcSatPrice: {
            base: 43215000000,
            offset: 0
          },
          denominatorCurrency: 'USD',
          timestamp: 1704067200
        }
      };
      redisService.get.mockResolvedValue(null);
      flashApiService.executeQuery.mockResolvedValue(zeroOffsetData);
      redisService.set.mockResolvedValue(undefined);

      // Act
      const result = await service.getBitcoinPrice('USD');

      // Assert
      expect(result.btcPrice).toBeCloseTo(432150000000000.00, 0);
    });

    it('should handle concurrent requests for same currency', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);
      flashApiService.executeQuery.mockResolvedValue(mockPriceData);
      redisService.set.mockResolvedValue(undefined);

      // Act - Make multiple concurrent requests
      const promises = [
        service.getBitcoinPrice('USD'),
        service.getBitcoinPrice('USD'),
        service.getBitcoinPrice('USD')
      ];
      const results = await Promise.all(promises);

      // Assert - All should get the same result
      expect(results[0].btcPrice).toBeCloseTo(43215.00, 2);
      expect(results[1].btcPrice).toBeCloseTo(43215.00, 2);
      expect(results[2].btcPrice).toBeCloseTo(43215.00, 2);
    });

    it('should handle price with change24h property', async () => {
      // Arrange
      const priceWithChange = {
        btcPrice: 43215.00,
        currency: 'USD',
        timestamp: new Date('2024-01-01T00:00:00Z'),
        change24h: 5.25
      };

      // Act
      const result = service.formatPriceMessage(priceWithChange);

      // Assert
      expect(result).toContain('$43,215.00');
      // Note: Current implementation doesn't display change24h, but it's in the interface
    });
  });
});