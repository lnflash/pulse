import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisPoolService, RedisPoolConfig, PoolStats } from './redis-pool.service';
import Redis from 'ioredis';

// Mock ioredis
jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      ping: jest.fn().mockResolvedValue('PONG'),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      status: 'ready',
    })),
  };
});

describe('RedisPoolService', () => {
  let service: RedisPoolService;
  let configService: jest.Mocked<ConfigService>;
  let mockRedisClient: jest.Mocked<Redis>;

  const mockConfig: RedisPoolConfig = {
    enablePool: true,
    minConnections: 2,
    maxConnections: 5,
    acquireTimeout: 3000,
    idleTimeout: 30000,
    connectionName: 'test-pool',
    enableReadReplicas: false,
  };

  const mockRedisConfig = {
    host: 'localhost',
    port: 6379,
    password: 'testpass',
    db: 0,
  };

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock Redis client
    mockRedisClient = {
      status: 'ready',
      ping: jest.fn().mockResolvedValue('PONG'),
      disconnect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
      on: jest.fn().mockReturnThis(),
      once: jest.fn().mockReturnThis(),
      removeAllListeners: jest.fn().mockReturnThis(),
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
    } as any;

    // Update the mock implementation
    (Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => mockRedisClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisPoolService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              const configMap: any = {
                'redis.pool.enabled': mockConfig.enablePool,
                'redis.pool.min': mockConfig.minConnections,
                'redis.pool.max': mockConfig.maxConnections,
                'redis.pool.acquireTimeout': mockConfig.acquireTimeout,
                'redis.pool.idleTimeout': mockConfig.idleTimeout,
                'redis.pool.connectionName': mockConfig.connectionName,
                'redis.pool.enableReadReplicas': mockConfig.enableReadReplicas,
                'redis': mockRedisConfig,
              };
              return configMap[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RedisPoolService>(RedisPoolService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize pool when enabled', async () => {
      // Arrange
      jest.spyOn(service as any, 'initializePool').mockResolvedValue(undefined);

      // Act
      await service.onModuleInit();

      // Assert
      expect((service as any).initializePool).toHaveBeenCalled();
    });

    it('should skip initialization when pool disabled', async () => {
      // Arrange
      configService.get.mockImplementation((key: string) => {
        if (key === 'redis.pool.enabled') return false;
        return (configService.get as any).mock.calls[0]?.[1];
      });
      
      const newService = new RedisPoolService(configService);
      jest.spyOn(newService as any, 'initializePool');

      // Act
      await newService.onModuleInit();

      // Assert
      expect((newService as any).initializePool).not.toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      // Arrange
      jest.spyOn(service as any, 'initializePool').mockRejectedValue(new Error('Init failed'));

      // Act
      await service.onModuleInit();

      // Assert
      expect((service as any).config.enablePool).toBe(false);
    });
  });

  describe('initializePool', () => {
    it('should create minimum connections', async () => {
      // Arrange
      jest.spyOn(service as any, 'createConnection').mockResolvedValue(mockRedisClient);
      jest.spyOn(service as any, 'startIdleConnectionCleanup').mockImplementation();

      // Act
      await (service as any).initializePool();

      // Assert
      expect((service as any).createConnection).toHaveBeenCalledTimes(mockConfig.minConnections);
      expect((service as any).pool.length).toBe(mockConfig.minConnections);
    });

    it('should start idle connection cleanup', async () => {
      // Arrange
      jest.spyOn(service as any, 'createConnection').mockResolvedValue(mockRedisClient);
      jest.spyOn(service as any, 'startIdleConnectionCleanup').mockImplementation();

      // Act
      await (service as any).initializePool();

      // Assert
      expect((service as any).startIdleConnectionCleanup).toHaveBeenCalled();
    });

    it('should handle connection creation failures', async () => {
      // Arrange
      jest.spyOn(service as any, 'createConnection').mockRejectedValue(new Error('Connection failed'));

      // Act & Assert
      await expect((service as any).initializePool()).rejects.toThrow('Connection failed');
    });
  });

  describe('createConnection', () => {
    it('should create Redis connection with proper config', async () => {
      // Act
      const connection = await (service as any).createConnection(0);

      // Assert
      expect(Redis).toHaveBeenCalledWith(expect.objectContaining({
        host: 'localhost',
        port: 6379,
        password: 'testpass',
        db: 0,
        connectionName: 'test-pool-0',
      }));
      expect(connection).toBe(mockRedisClient);
    });

    it('should set up event handlers', async () => {
      // Act
      await (service as any).createConnection(0);

      // Assert
      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should test connection with ping', async () => {
      // Act
      await (service as any).createConnection(0);

      // Assert
      expect(mockRedisClient.ping).toHaveBeenCalled();
    });

    it('should handle connection timeout', async () => {
      // Arrange
      jest.useFakeTimers();
      
      const slowClient = {
        ...mockRedisClient,
        status: 'connecting',
        once: jest.fn((event, callback) => {
          // Don't call the callback to simulate hanging connection
          if (event === 'ready') {
            // Store callback but don't call it
          } else if (event === 'error') {
            // Store error callback but don't call it
          }
        }),
      };
      (Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => slowClient as any);

      // Act
      const connectionPromise = (service as any).createConnection(0);
      
      // Fast-forward time by 5 seconds to trigger timeout
      jest.advanceTimersByTime(5000);
      
      // Assert
      await expect(connectionPromise).rejects.toThrow('Connection timeout');
      
      jest.useRealTimers();
    });

    it('should add Sentinel configuration when provided', async () => {
      // Arrange
      const sentinels = [{ host: 'sentinel1', port: 26379 }];
      const originalGet = configService.get;
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'redis.pool.sentinels') return sentinels;
        if (key === 'redis') return mockRedisConfig;
        return originalGet(key, defaultValue);
      });

      // Update mock config to include sentinels
      (service as any).config.sentinels = sentinels;

      // Act
      await (service as any).createConnection(0);

      // Assert
      expect(Redis).toHaveBeenCalledWith(expect.objectContaining({
        sentinels,
        name: 'mymaster',
      }));
    });
  });

  describe('acquire', () => {
    beforeEach(async () => {
      // Initialize pool with mock connections
      (service as any).pool = [mockRedisClient, { ...mockRedisClient }];
      (service as any).config = mockConfig;
    });

    it('should return idle connection from pool', async () => {
      // Arrange
      jest.spyOn(service as any, 'getIdleConnection').mockReturnValue(mockRedisClient);

      // Act
      const connection = await service.acquire();

      // Assert
      expect(connection).toBe(mockRedisClient);
      expect((service as any).activeConnections.has(connection)).toBe(true);
    });

    it('should create new connection when pool not full', async () => {
      // Arrange
      jest.spyOn(service as any, 'getIdleConnection').mockReturnValue(null);
      jest.spyOn(service as any, 'createConnection').mockResolvedValue(mockRedisClient);
      (service as any).pool = [];

      // Act
      const connection = await service.acquire();

      // Assert
      expect((service as any).createConnection).toHaveBeenCalled();
      expect(connection).toBe(mockRedisClient);
    });

    it('should wait for available connection when pool full', async () => {
      // Arrange
      let waitResolve: any;
      const waitPromise = new Promise<Redis>((resolve) => {
        waitResolve = resolve;
      });
      
      let callCount = 0;
      jest.spyOn(service as any, 'getIdleConnection').mockImplementation(() => {
        callCount++;
        // Return null first time, then return connection after wait
        return callCount === 1 ? null : mockRedisClient;
      });
      
      jest.spyOn(service as any, 'waitForConnection').mockReturnValue(waitPromise);
      
      (service as any).pool = new Array(mockConfig.maxConnections).fill(mockRedisClient);
      (service as any).activeConnections = new Set(new Array(mockConfig.maxConnections).fill(mockRedisClient));

      // Act
      const connectionPromise = service.acquire();
      
      // Simulate connection becoming available
      setTimeout(() => {
        waitResolve(mockRedisClient);
      }, 10);
      
      const connection = await connectionPromise;

      // Assert
      expect(connection).toBe(mockRedisClient);
      expect((service as any).waitForConnection).toHaveBeenCalled();
    });

    it('should throw error when shutting down', async () => {
      // Arrange
      (service as any).isShuttingDown = true;

      // Act & Assert
      await expect(service.acquire()).rejects.toThrow('Redis pool is shutting down');
    });

    it('should timeout when no connection available', async () => {
      // Arrange
      const startTime = Date.now();
      let currentTime = startTime;
      let callCount = 0;
      
      // Mock Date.now() to control time
      jest.spyOn(Date, 'now').mockImplementation(() => {
        // First call is startTime, subsequent calls simulate time passing
        if (callCount === 0) {
          callCount++;
          return startTime;
        }
        // Second call checks timeout - return time past timeout
        return startTime + 101;
      });
      
      // Mock getIdleConnection to always return null
      jest.spyOn(service as any, 'getIdleConnection').mockReturnValue(null);
      
      // Mock waitForConnection to never resolve but doesn't matter since timeout happens first
      jest.spyOn(service as any, 'waitForConnection').mockImplementation(() => {
        return new Promise(() => {}); // Never resolves
      });
      
      // Set up pool to be full
      const clients = Array(mockConfig.maxConnections).fill(null).map((_, i) => ({ ...mockRedisClient, id: i }));
      (service as any).pool = clients;
      (service as any).activeConnections = new Set(clients);
      (service as any).config.acquireTimeout = 100;

      // Act & Assert
      await expect(service.acquire()).rejects.toThrow('Failed to acquire Redis connection within 100ms');
      
      // Cleanup
      jest.restoreAllMocks();
    });
  });

  describe('release', () => {
    beforeEach(() => {
      (service as any).activeConnections = new Set([mockRedisClient]);
    });

    it('should release connection back to pool', () => {
      // Act
      service.release(mockRedisClient);

      // Assert
      expect((service as any).activeConnections.has(mockRedisClient)).toBe(false);
    });

    it('should notify waiting queue', () => {
      // Arrange
      const callback = jest.fn();
      (service as any).waitingQueue = [callback];

      // Act
      service.release(mockRedisClient);

      // Assert
      expect(callback).toHaveBeenCalledWith(mockRedisClient);
      expect((service as any).waitingQueue.length).toBe(0);
    });

    it('should ignore unknown connections', () => {
      // Arrange
      const unknownClient = {} as Redis;

      // Act & Assert - Should not throw
      expect(() => service.release(unknownClient)).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return pool statistics', () => {
      // Arrange
      const client1 = { ...mockRedisClient, id: 1 };
      const client2 = { ...mockRedisClient, id: 2 };
      const client3 = { ...mockRedisClient, id: 3 };
      const client4 = { ...mockRedisClient, id: 4 };
      const client5 = { ...mockRedisClient, id: 5 };
      
      (service as any).pool = [client1, client2, client3, client4, client5];
      (service as any).activeConnections = new Set([client1, client2]);
      (service as any).waitingQueue = [jest.fn(), jest.fn(), jest.fn()];

      // Act
      const stats = service.getStats();

      // Assert
      expect(stats).toEqual({
        total: 5,
        active: 2,
        idle: 3,
        waiting: 3,
      });
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status', async () => {
      // Arrange
      (service as any).pool = new Array(3).fill(mockRedisClient);
      (service as any).activeConnections = new Set([mockRedisClient]);

      // Act
      const health = await service.healthCheck();

      // Assert
      expect(health.healthy).toBe(true);
      expect(health.stats).toEqual({
        total: 3,
        active: 1,
        idle: 2,
        waiting: 0,
      });
    });

    it('should detect unhealthy conditions', async () => {
      // Arrange
      (service as any).pool = [];
      (service as any).config = mockConfig;

      // Act
      const health = await service.healthCheck();

      // Assert
      expect(health.healthy).toBe(false);
      expect(health.errors[0]).toMatch(/Pool has \d+ connections, minimum is \d+/);
    });
  });

  describe('destroyPool', () => {
    it('should close all connections', async () => {
      // Arrange
      const connections = [
        { ...mockRedisClient, quit: jest.fn().mockResolvedValue(undefined) },
        { ...mockRedisClient, quit: jest.fn().mockResolvedValue(undefined) },
      ];
      (service as any).pool = connections;

      // Act
      await (service as any).destroyPool();

      // Assert
      expect(connections[0].quit).toHaveBeenCalled();
      expect(connections[1].quit).toHaveBeenCalled();
      expect((service as any).pool.length).toBe(0);
    });

    it('should handle connection close errors', async () => {
      // Arrange
      const failingClient = {
        ...mockRedisClient,
        quit: jest.fn().mockRejectedValue(new Error('Close failed')),
      };
      (service as any).pool = [failingClient];

      // Act & Assert - Should not throw
      await expect((service as any).destroyPool()).resolves.toBeUndefined();
    });

    it('should clear waiting queue', async () => {
      // Arrange
      (service as any).waitingQueue = [jest.fn(), jest.fn()];

      // Act
      await (service as any).destroyPool();

      // Assert
      expect((service as any).waitingQueue.length).toBe(0);
    });
  });

  describe('onModuleDestroy', () => {
    it('should set shutting down flag and destroy pool', async () => {
      // Arrange
      jest.spyOn(service as any, 'destroyPool').mockResolvedValue(undefined);

      // Act
      await service.onModuleDestroy();

      // Assert
      expect((service as any).isShuttingDown).toBe(true);
      expect((service as any).destroyPool).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle race condition in acquire', async () => {
      // Arrange
      const promises = [];
      jest.spyOn(service as any, 'getIdleConnection').mockReturnValue(mockRedisClient);

      // Act - Multiple concurrent acquire calls
      for (let i = 0; i < 10; i++) {
        promises.push(service.acquire());
      }

      const connections = await Promise.all(promises);

      // Assert
      expect(connections).toHaveLength(10);
    });

    it('should recover from connection errors', async () => {
      // Arrange
      const errorClient = {
        ...mockRedisClient,
        ping: jest.fn().mockRejectedValue(new Error('Ping failed')),
      };
      (Redis as any).mockImplementation(() => errorClient);

      // Act & Assert
      await expect((service as any).createConnection(0)).rejects.toThrow('Ping failed');
    });

    it('should handle connection event callbacks', async () => {
      // Arrange
      let errorHandler: Function;
      mockRedisClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'error') errorHandler = handler;
        return mockRedisClient;
      });

      // Act
      await (service as any).createConnection(0);
      errorHandler!(new Error('Connection error'));

      // Assert - Should not throw
      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });
});