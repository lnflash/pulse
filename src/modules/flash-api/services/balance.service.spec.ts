import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { BalanceService, BalanceInfo } from './balance.service';
import { FlashApiService } from '../flash-api.service';
import { RedisService } from '../../redis/redis.service';

describe('BalanceService', () => {
  let service: BalanceService;
  let configService: jest.Mocked<ConfigService>;
  let flashApiService: jest.Mocked<FlashApiService>;
  let redisService: jest.Mocked<RedisService>;

  const mockBalanceInfo: BalanceInfo = {
    btcBalance: 100000, // 100,000 sats
    fiatBalance: 30.50,
    fiatCurrency: 'USD',
    lastUpdated: new Date('2024-01-01T00:00:00Z'),
    exchangeRate: {
      usdCentPrice: {
        base: 43215,
        offset: 2
      }
    }
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceService,
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
            getBalance: jest.fn()
          }
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            getEncrypted: jest.fn(),
            setEncrypted: jest.fn()
          }
        }
      ],
    }).compile();

    service = module.get<BalanceService>(BalanceService);
    configService = module.get(ConfigService);
    flashApiService = module.get(FlashApiService);
    redisService = module.get(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserBalance', () => {
    const userId = 'user123';
    const authToken = 'auth-token-123';

    it('should return cached balance when available and not skipping cache', async () => {
      // Arrange
      redisService.getEncrypted.mockResolvedValue(mockBalanceInfo);

      // Act
      const result = await service.getUserBalance(userId, authToken, false);

      // Assert
      expect(result).toEqual(mockBalanceInfo);
      expect(redisService.getEncrypted).toHaveBeenCalledWith(`balance:${userId}`);
      expect(flashApiService.executeQuery).not.toHaveBeenCalled();
    });

    it('should fetch from API when cache is empty', async () => {
      // Arrange
      redisService.getEncrypted.mockResolvedValue(null);
      jest.spyOn(service as any, 'fetchBalanceFromApi').mockResolvedValue(mockBalanceInfo);
      jest.spyOn(service as any, 'cacheBalance').mockResolvedValue(undefined);

      // Act
      const result = await service.getUserBalance(userId, authToken, false);

      // Assert
      expect(result).toEqual(mockBalanceInfo);
      expect(redisService.getEncrypted).toHaveBeenCalledWith(`balance:${userId}`);
      expect((service as any).fetchBalanceFromApi).toHaveBeenCalledWith(userId, authToken);
      expect((service as any).cacheBalance).toHaveBeenCalledWith(userId, mockBalanceInfo);
    });

    it('should skip cache when skipCache is true', async () => {
      // Arrange
      redisService.getEncrypted.mockResolvedValue(mockBalanceInfo);
      jest.spyOn(service as any, 'fetchBalanceFromApi').mockResolvedValue(mockBalanceInfo);
      jest.spyOn(service as any, 'cacheBalance').mockResolvedValue(undefined);

      // Act
      const result = await service.getUserBalance(userId, authToken, true);

      // Assert
      expect(result).toEqual(mockBalanceInfo);
      expect(redisService.getEncrypted).not.toHaveBeenCalled();
      expect((service as any).fetchBalanceFromApi).toHaveBeenCalledWith(userId, authToken);
    });

    it('should throw BadRequestException on error', async () => {
      // Arrange
      redisService.getEncrypted.mockResolvedValue(null);
      jest.spyOn(service as any, 'fetchBalanceFromApi').mockRejectedValue(new Error('API error'));

      // Act & Assert
      await expect(service.getUserBalance(userId, authToken)).rejects.toThrow(BadRequestException);
    });

    it('should handle cache miss gracefully and fetch from API', async () => {
      // Arrange
      redisService.getEncrypted.mockRejectedValue(new Error('Cache error'));
      jest.spyOn(service as any, 'fetchBalanceFromApi').mockResolvedValue(mockBalanceInfo);
      jest.spyOn(service as any, 'cacheBalance').mockResolvedValue(undefined);

      // Act
      const result = await service.getUserBalance(userId, authToken, false);

      // Assert
      expect(result).toEqual(mockBalanceInfo);
      expect((service as any).fetchBalanceFromApi).toHaveBeenCalled();
    });
  });

  describe('clearBalanceCache', () => {
    it('should clear balance cache for a user', async () => {
      // Arrange
      const userId = 'user123';
      redisService.del.mockResolvedValue(1);

      // Act
      await service.clearBalanceCache(userId);

      // Assert
      expect(redisService.del).toHaveBeenCalledWith(`balance:${userId}`);
    });

    it('should handle cache clear errors gracefully', async () => {
      // Arrange
      const userId = 'user123';
      redisService.del.mockRejectedValue(new Error('Redis error'));
      const loggerWarnSpy = jest.spyOn((service as any).logger, 'warn');

      // Act
      await service.clearBalanceCache(userId);

      // Assert
      expect(loggerWarnSpy).toHaveBeenCalledWith('Error clearing balance cache: Redis error');
      expect(redisService.del).toHaveBeenCalledWith(`balance:${userId}`);
    });
  });

  describe('Configuration', () => {
    it('should use default cache TTL when not configured', () => {
      // Arrange
      configService.get.mockReturnValue(undefined);

      // Act
      const newService = new BalanceService(configService, flashApiService, redisService);

      // Assert
      expect((newService as any).cacheTtl).toBe(30);
    });

    it('should use configured cache TTL from cache.balanceTtl', () => {
      // Arrange
      configService.get.mockImplementation((key: string) => {
        if (key === 'cache.balanceTtl') return 60;
        return undefined;
      });

      // Act
      const newService = new BalanceService(configService, flashApiService, redisService);

      // Assert
      expect((newService as any).cacheTtl).toBe(60);
    });

    it('should use legacy balanceCacheTtl config', () => {
      // Arrange
      configService.get.mockImplementation((key: string) => {
        if (key === 'balanceCacheTtl') return 120;
        return undefined;
      });

      // Act
      const newService = new BalanceService(configService, flashApiService, redisService);

      // Assert
      expect((newService as any).cacheTtl).toBe(120);
    });
  });

  describe('Private Methods', () => {
    describe('getCachedBalance', () => {
      it('should return cached balance when available', async () => {
        // Arrange
        const userId = 'user123';
        redisService.getEncrypted.mockResolvedValue(mockBalanceInfo);

        // Act
        const result = await (service as any).getCachedBalance(userId);

        // Assert
        expect(result).toEqual(mockBalanceInfo);
        expect(redisService.getEncrypted).toHaveBeenCalledWith(`balance:${userId}`);
      });

      it('should return null when cache is empty', async () => {
        // Arrange
        const userId = 'user123';
        redisService.getEncrypted.mockResolvedValue(null);

        // Act
        const result = await (service as any).getCachedBalance(userId);

        // Assert
        expect(result).toBeNull();
      });

      it('should return null on cache error', async () => {
        // Arrange
        const userId = 'user123';
        redisService.getEncrypted.mockRejectedValue(new Error('Cache error'));
        const loggerWarnSpy = jest.spyOn((service as any).logger, 'warn');

        // Act
        const result = await (service as any).getCachedBalance(userId);

        // Assert
        expect(result).toBeNull();
        expect(loggerWarnSpy).toHaveBeenCalledWith('Error getting cached balance: Cache error');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero balance correctly', async () => {
      // Arrange
      const zeroBalance: BalanceInfo = {
        ...mockBalanceInfo,
        btcBalance: 0,
        fiatBalance: 0
      };
      redisService.getEncrypted.mockResolvedValue(zeroBalance);

      // Act
      const result = await service.getUserBalance('user123', 'token', false);

      // Assert
      expect(result.btcBalance).toBe(0);
      expect(result.fiatBalance).toBe(0);
    });

    it('should handle negative balance correctly', async () => {
      // Arrange
      const negativeBalance: BalanceInfo = {
        ...mockBalanceInfo,
        btcBalance: -1000,
        fiatBalance: -10
      };
      redisService.getEncrypted.mockResolvedValue(negativeBalance);

      // Act
      const result = await service.getUserBalance('user123', 'token', false);

      // Assert
      expect(result.btcBalance).toBe(-1000);
      expect(result.fiatBalance).toBe(-10);
    });

    it('should handle missing exchange rate', async () => {
      // Arrange
      const balanceWithoutRate: BalanceInfo = {
        ...mockBalanceInfo,
        exchangeRate: undefined
      };
      redisService.getEncrypted.mockResolvedValue(balanceWithoutRate);

      // Act
      const result = await service.getUserBalance('user123', 'token', false);

      // Assert
      expect(result.exchangeRate).toBeUndefined();
    });
  });
});