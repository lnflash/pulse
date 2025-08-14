import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CacheManagerService, CacheOptions, CacheKey } from './cache-manager.service';
import { RedisService } from '../../redis/redis.service';

describe('CacheManagerService', () => {
  let service: CacheManagerService;
  let redisService: jest.Mocked<RedisService>;
  let configService: jest.Mocked<ConfigService>;

  const mockCacheConfig = {
    balance: 600,
    price: 1800,
    username: 7200,
    transaction: 172800,
    session: 3600,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheManagerService,
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(1),
            keys: jest.fn().mockResolvedValue([]),
            exists: jest.fn().mockResolvedValue(false),
            expire: jest.fn().mockResolvedValue(1),
            ttl: jest.fn().mockResolvedValue(-1),
            mget: jest.fn().mockResolvedValue([]),
            mset: jest.fn().mockResolvedValue('OK'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(mockCacheConfig),
          },
        },
      ],
    }).compile();

    service = module.get<CacheManagerService>(CacheManagerService);
    redisService = module.get(RedisService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('should return cached value on hit', async () => {
      // Arrange
      const cachedData = { id: 1, name: 'Test' };
      redisService.get.mockResolvedValue(JSON.stringify(cachedData));

      // Act
      const result = await service.get('test-key');

      // Assert
      expect(result).toEqual(cachedData);
      expect(redisService.get).toHaveBeenCalledWith('test-key');
      expect((service as any).metrics.hits).toBe(1);
    });

    it('should return null on cache miss without factory', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);

      // Act
      const result = await service.get('test-key');

      // Assert
      expect(result).toBeNull();
      expect((service as any).metrics.misses).toBe(1);
    });

    it('should fetch and cache value with factory on miss', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);
      const factoryData = { id: 2, value: 'Factory' };
      const factory = jest.fn().mockResolvedValue(factoryData);

      // Act
      const result = await service.get('test-key', factory);

      // Assert
      expect(result).toEqual(factoryData);
      expect(factory).toHaveBeenCalled();
      expect(redisService.set).toHaveBeenCalled();
    });

    it('should skip cache when skipCache option is true', async () => {
      // Arrange
      const factory = jest.fn().mockResolvedValue('direct-value');

      // Act
      const result = await service.get('test-key', factory, { skipCache: true });

      // Assert
      expect(result).toBe('direct-value');
      expect(redisService.get).not.toHaveBeenCalled();
      expect(factory).toHaveBeenCalled();
    });

    it('should force refresh when forceRefresh option is true', async () => {
      // Arrange
      const factory = jest.fn().mockResolvedValue('new-value');

      // Act
      const result = await service.get('test-key', factory, { forceRefresh: true });

      // Assert
      expect(result).toBe('new-value');
      expect(redisService.get).not.toHaveBeenCalled();
      expect(factory).toHaveBeenCalled();
      expect(redisService.set).toHaveBeenCalled();
    });

    it('should handle CacheKey object', async () => {
      // Arrange
      const cacheKey: CacheKey = {
        prefix: 'user',
        identifier: '123',
        suffix: 'profile',
      };
      redisService.get.mockResolvedValue(null);

      // Act
      await service.get(cacheKey);

      // Assert
      expect(redisService.get).toHaveBeenCalledWith('user:123:profile');
    });

    it('should handle cache errors and fallback to factory', async () => {
      // Arrange
      redisService.get.mockRejectedValue(new Error('Redis error'));
      const factory = jest.fn().mockResolvedValue('fallback-value');

      // Act
      const result = await service.get('test-key', factory);

      // Assert
      expect(result).toBe('fallback-value');
      expect((service as any).metrics.errors).toBe(1);
    });

    it('should throw error when cache fails without factory', async () => {
      // Arrange
      redisService.get.mockRejectedValue(new Error('Redis error'));

      // Act & Assert
      await expect(service.get('test-key')).rejects.toThrow('Redis error');
      expect((service as any).metrics.errors).toBe(1);
    });

    it('should use custom prefix', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);

      // Act
      await service.get('key', undefined, { prefix: 'custom' });

      // Assert
      expect(redisService.get).toHaveBeenCalledWith('custom:key');
    });
  });

  describe('set', () => {
    it('should cache value with default TTL', async () => {
      // Arrange
      const value = { data: 'test' };

      // Act
      await service.set('balance:123', value);

      // Assert
      expect(redisService.set).toHaveBeenCalledWith(
        'balance:123',
        JSON.stringify(value),
        600 // From mockCacheConfig
      );
    });

    it('should use custom TTL when provided', async () => {
      // Arrange
      const value = { data: 'test' };

      // Act
      await service.set('custom-key', value, { ttl: 3600 });

      // Assert
      expect(redisService.set).toHaveBeenCalledWith(
        'custom-key',
        JSON.stringify(value),
        3600
      );
    });

    it('should handle CacheKey object', async () => {
      // Arrange
      const cacheKey: CacheKey = {
        prefix: 'session',
        identifier: 'abc123',
      };
      const value = { active: true };

      // Act
      await service.set(cacheKey, value);

      // Assert
      expect(redisService.set).toHaveBeenCalledWith(
        'session:abc123',
        JSON.stringify(value),
        3600 // Session TTL from config
      );
    });

    it('should handle set errors', async () => {
      // Arrange
      redisService.set.mockRejectedValue(new Error('Set failed'));

      // Act & Assert
      await expect(service.set('key', 'value')).rejects.toThrow('Set failed');
      expect((service as any).metrics.errors).toBe(1);
    });
  });

  describe('delete', () => {
    it('should delete cache key', async () => {
      // Act
      await service.delete('test-key');

      // Assert
      expect(redisService.del).toHaveBeenCalledWith('test-key');
    });

    it('should handle CacheKey object', async () => {
      // Arrange
      const cacheKey: CacheKey = {
        prefix: 'user',
        identifier: '456',
        suffix: 'settings',
      };

      // Act
      await service.delete(cacheKey);

      // Assert
      expect(redisService.del).toHaveBeenCalledWith('user:456:settings');
    });

    it('should handle delete errors', async () => {
      // Arrange
      redisService.del.mockRejectedValue(new Error('Delete failed'));

      // Act & Assert
      await expect(service.delete('key')).rejects.toThrow('Delete failed');
      expect((service as any).metrics.errors).toBe(1);
    });

    it('should use custom prefix', async () => {
      // Act
      await service.delete('key', { prefix: 'temp' });

      // Assert
      expect(redisService.del).toHaveBeenCalledWith('temp:key');
    });
  });

  describe('deletePattern', () => {
    it('should delete multiple keys matching pattern', async () => {
      // Arrange
      const keys = ['cache:user:1', 'cache:user:2', 'cache:user:3'];
      redisService.keys.mockResolvedValue(keys);

      // Act
      const result = await service.deletePattern('cache:user:*');

      // Assert
      expect(redisService.keys).toHaveBeenCalledWith('cache:user:*');
      expect(redisService.del).toHaveBeenCalledWith(...keys);
      expect(result).toBe(3);
    });

    it('should handle no matching keys', async () => {
      // Arrange
      redisService.keys.mockResolvedValue([]);

      // Act
      const result = await service.deletePattern('nonexistent:*');

      // Assert
      expect(result).toBe(0);
      expect(redisService.del).not.toHaveBeenCalled();
    });

    it('should handle deletePattern errors', async () => {
      // Arrange
      redisService.keys.mockRejectedValue(new Error('Keys failed'));

      // Act & Assert
      await expect(service.deletePattern('pattern')).rejects.toThrow('Keys failed');
    });
  });

  describe('exists', () => {
    it('should check if key exists', async () => {
      // Arrange
      redisService.exists.mockResolvedValue(true);

      // Act
      const result = await service.exists('test-key');

      // Assert
      expect(result).toBe(true);
      expect(redisService.exists).toHaveBeenCalledWith('test-key');
    });

    it('should handle CacheKey object', async () => {
      // Arrange
      const cacheKey: CacheKey = {
        prefix: 'cache',
        identifier: 'check',
      };
      redisService.exists.mockResolvedValue(false);

      // Act
      const result = await service.exists(cacheKey);

      // Assert
      expect(result).toBe(false);
      expect(redisService.exists).toHaveBeenCalledWith('cache:check');
    });
  });

  describe('getMultiple', () => {
    it('should get multiple values', async () => {
      // Arrange
      const keys = ['key1', 'key2', 'key3'];
      const values = [
        JSON.stringify({ id: 1 }),
        null,
        JSON.stringify({ id: 3 }),
      ];
      redisService.mget.mockResolvedValue(values);

      // Act
      const result = await service.getMultiple(keys);

      // Assert
      expect(result).toEqual([{ id: 1 }, null, { id: 3 }]);
      expect(redisService.mget).toHaveBeenCalledWith(keys);
    });

    it('should handle empty keys array', async () => {
      // Act
      const result = await service.getMultiple([]);

      // Assert
      expect(result).toEqual([]);
      expect(redisService.mget).not.toHaveBeenCalled();
    });
  });

  describe('setMultiple', () => {
    it('should set multiple key-value pairs', async () => {
      // Arrange
      const items = [
        { key: 'key1', value: { data: 1 }, ttl: 100 },
        { key: 'key2', value: { data: 2 }, ttl: 200 },
      ];

      // Act
      await service.setMultiple(items);

      // Assert
      expect(redisService.set).toHaveBeenCalledTimes(2);
      expect(redisService.set).toHaveBeenCalledWith('key1', JSON.stringify({ data: 1 }), 100);
      expect(redisService.set).toHaveBeenCalledWith('key2', JSON.stringify({ data: 2 }), 200);
    });

    it('should use default TTL when not specified', async () => {
      // Arrange
      const items = [
        { key: 'balance:123', value: { amount: 100 } },
      ];

      // Act
      await service.setMultiple(items);

      // Assert
      expect(redisService.set).toHaveBeenCalledWith(
        'balance:123',
        JSON.stringify({ amount: 100 }),
        600 // Balance TTL from config
      );
    });
  });

  describe('getMetrics', () => {
    it('should return cache metrics', () => {
      // Arrange
      (service as any).metrics = {
        hits: 10,
        misses: 5,
        errors: 2,
        lastReset: new Date('2024-01-01'),
      };

      // Act
      const metrics = service.getMetrics();

      // Assert
      expect(metrics).toEqual({
        hits: 10,
        misses: 5,
        errors: 2,
        lastReset: new Date('2024-01-01'),
        hitRate: 0.67,
      });
    });

    it('should handle zero total requests', () => {
      // Arrange
      (service as any).metrics = {
        hits: 0,
        misses: 0,
        errors: 0,
        lastReset: new Date(),
      };

      // Act
      const metrics = service.getMetrics();

      // Assert
      expect(metrics.hitRate).toBe(0);
    });
  });

  describe('resetMetrics', () => {
    it('should reset metrics', () => {
      // Arrange
      (service as any).metrics = {
        hits: 100,
        misses: 50,
        errors: 10,
        lastReset: new Date('2024-01-01'),
      };

      // Act
      service.resetMetrics();

      // Assert
      expect((service as any).metrics.hits).toBe(0);
      expect((service as any).metrics.misses).toBe(0);
      expect((service as any).metrics.errors).toBe(0);
      expect((service as any).metrics.lastReset).toBeInstanceOf(Date);
    });
  });

  describe('warmCache', () => {
    it('should warm cache with factory results', async () => {
      // Arrange
      const keys = ['user:1', 'user:2'];
      const factories = [
        jest.fn().mockResolvedValue({ id: 1, name: 'User 1' }),
        jest.fn().mockResolvedValue({ id: 2, name: 'User 2' }),
      ];

      // Act
      await service.warmCache(keys, factories);

      // Assert
      expect(factories[0]).toHaveBeenCalled();
      expect(factories[1]).toHaveBeenCalled();
      expect(redisService.set).toHaveBeenCalledTimes(2);
    });

    it('should continue on individual warm failures', async () => {
      // Arrange
      const keys = ['key1', 'key2'];
      const factories = [
        jest.fn().mockRejectedValue(new Error('Factory 1 failed')),
        jest.fn().mockResolvedValue('value2'),
      ];

      // Act
      await service.warmCache(keys, factories);

      // Assert
      expect(redisService.set).toHaveBeenCalledTimes(1);
      expect(redisService.set).toHaveBeenCalledWith('key2', JSON.stringify('value2'), expect.any(Number));
    });
  });

  describe('Edge Cases', () => {
    it('should handle complex nested objects', async () => {
      // Arrange
      const complexObject = {
        id: 1,
        nested: {
          deep: {
            value: 'test',
            array: [1, 2, 3],
          },
        },
        date: new Date('2024-01-01'),
      };

      // Act
      await service.set('complex', complexObject);

      // Assert
      expect(redisService.set).toHaveBeenCalledWith(
        'complex',
        JSON.stringify(complexObject),
        expect.any(Number)
      );
    });

    it('should handle concurrent get operations', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);
      const factory = jest.fn().mockResolvedValue('value');

      // Act
      const promises = Array(10).fill(null).map(() => 
        service.get('concurrent-key', factory)
      );
      const results = await Promise.all(promises);

      // Assert
      expect(results).toHaveLength(10);
      expect(results.every(r => r === 'value')).toBe(true);
    });

    it('should handle TTL extraction from key patterns', async () => {
      // Arrange
      const keys = ['balance:123', 'price:btc', 'unknown:key'];

      // Act
      await Promise.all(keys.map(key => service.set(key, 'value')));

      // Assert
      expect(redisService.set).toHaveBeenCalledWith('balance:123', '"value"', 600);
      expect(redisService.set).toHaveBeenCalledWith('price:btc', '"value"', 1800);
      expect(redisService.set).toHaveBeenCalledWith('unknown:key', '"value"', 3600); // Default
    });
  });
});