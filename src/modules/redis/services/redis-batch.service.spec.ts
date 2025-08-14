import { Test, TestingModule } from '@nestjs/testing';
import { RedisBatchService, BatchOperation, PipelineOptions } from './redis-batch.service';
import { RedisService } from '../redis.service';

describe('RedisBatchService', () => {
  let service: RedisBatchService;
  let redisService: jest.Mocked<RedisService>;
  let mockPipeline: any;

  beforeEach(async () => {
    // Setup pipeline mock
    mockPipeline = {
      get: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      hget: jest.fn().mockReturnThis(),
      hset: jest.fn().mockReturnThis(),
      sadd: jest.fn().mockReturnThis(),
      srem: jest.fn().mockReturnThis(),
      multi: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        [null, 'OK'],
        [null, 'value1'],
        [null, 1],
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisBatchService,
        {
          provide: RedisService,
          useValue: {
            pipeline: jest.fn().mockReturnValue(mockPipeline),
            info: jest.fn().mockResolvedValue('blocked_clients:0'),
            status: 'ready',
          },
        },
      ],
    }).compile();

    service = module.get<RedisBatchService>(RedisBatchService);
    redisService = module.get(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeBatch', () => {
    it('should execute batch operations', async () => {
      // Arrange
      const operations: BatchOperation[] = [
        { type: 'get', key: 'key1' },
        { type: 'set', key: 'key2', value: 'value2' },
        { type: 'del', key: 'key3' },
      ];

      // Act
      const results = await service.executeBatch(operations);

      // Assert
      expect(results).toHaveLength(3);
      expect(mockPipeline.get).toHaveBeenCalledWith('key1');
      expect(mockPipeline.set).toHaveBeenCalledWith('key2', '"value2"');
      expect(mockPipeline.del).toHaveBeenCalledWith('key3');
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should handle empty operations array', async () => {
      // Act
      const results = await service.executeBatch([]);

      // Assert
      expect(results).toEqual([]);
      expect(redisService.pipeline).not.toHaveBeenCalled();
    });

    it('should execute atomic transaction when atomic option is true', async () => {
      // Arrange
      const operations: BatchOperation[] = [
        { type: 'set', key: 'key1', value: 'value1' },
        { type: 'set', key: 'key2', value: 'value2' },
      ];
      const options: PipelineOptions = { atomic: true };

      // Act
      await service.executeBatch(operations, options);

      // Assert
      expect(mockPipeline.multi).toHaveBeenCalled();
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should throw error when throwOnError is true', async () => {
      // Arrange
      const operations: BatchOperation[] = [{ type: 'get', key: 'key1' }];
      const options: PipelineOptions = { throwOnError: true };
      const error = new Error('Redis error');
      mockPipeline.exec.mockRejectedValue(error);

      // Act & Assert
      await expect(service.executeBatch(operations, options)).rejects.toThrow('Redis error');
    });

    it('should return error results when pipeline fails', async () => {
      // Arrange
      const operations: BatchOperation[] = [
        { type: 'get', key: 'key1' },
        { type: 'set', key: 'key2', value: 'value2' },
      ];
      const error = new Error('Pipeline failed');
      mockPipeline.exec.mockRejectedValue(error);

      // Act
      const results = await service.executeBatch(operations);

      // Assert
      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result.success).toBe(false);
        expect(result.error).toEqual(error);
      });
    });

    it('should warn when batch size exceeds maximum', async () => {
      // Arrange
      const operations = Array(1001).fill(null).map((_, i) => ({
        type: 'get' as const,
        key: `key${i}`,
      }));
      jest.spyOn(service['logger'], 'warn');

      // Act
      await service.executeBatch(operations);

      // Assert
      expect(service['logger'].warn).toHaveBeenCalledWith(
        expect.stringContaining('Batch size 1001 exceeds maximum')
      );
    });

    it('should handle set operations with TTL', async () => {
      // Arrange
      const operations: BatchOperation[] = [
        { type: 'set', key: 'key1', value: 'value1', ttl: 3600 },
      ];

      // Act
      await service.executeBatch(operations);

      // Assert
      expect(mockPipeline.set).toHaveBeenCalledWith('key1', '"value1"', 'EX', 3600);
    });

    it('should handle hash operations', async () => {
      // Arrange
      const operations: BatchOperation[] = [
        { type: 'hget', key: 'hash1', field: 'field1' },
        { type: 'hset', key: 'hash2', field: 'field2', value: 'value2' },
      ];

      // Act
      await service.executeBatch(operations);

      // Assert
      expect(mockPipeline.hget).toHaveBeenCalledWith('hash1', 'field1');
      expect(mockPipeline.hset).toHaveBeenCalledWith('hash2', 'field2', '"value2"');
    });

    it('should handle set operations', async () => {
      // Arrange
      const operations: BatchOperation[] = [
        { type: 'sadd', key: 'set1', value: 'member1' },
        { type: 'srem', key: 'set2', value: 'member2' },
      ];

      // Act
      await service.executeBatch(operations);

      // Assert
      expect(mockPipeline.sadd).toHaveBeenCalledWith('set1', 'member1');
      expect(mockPipeline.srem).toHaveBeenCalledWith('set2', 'member2');
    });

    it('should parse JSON values for get operations', async () => {
      // Arrange
      const operations: BatchOperation[] = [{ type: 'get', key: 'key1' }];
      mockPipeline.exec.mockResolvedValue([[null, '{"nested":"value"}']]);

      // Act
      const results = await service.executeBatch(operations);

      // Assert
      expect(results[0].value).toEqual({ nested: 'value' });
    });

    it('should keep non-JSON values as-is', async () => {
      // Arrange
      const operations: BatchOperation[] = [{ type: 'get', key: 'key1' }];
      mockPipeline.exec.mockResolvedValue([[null, 'plain text']]);

      // Act
      const results = await service.executeBatch(operations);

      // Assert
      expect(results[0].value).toBe('plain text');
    });
  });

  describe('executeBatchChunked', () => {
    it('should execute operations in chunks', async () => {
      // Arrange
      const operations = Array(250).fill(null).map((_, i) => ({
        type: 'get' as const,
        key: `key${i}`,
      }));

      // Act
      const results = await service.executeBatchChunked(operations, 100);

      // Assert
      expect(results).toHaveLength(250);
      expect(mockPipeline.exec).toHaveBeenCalledTimes(3); // 3 chunks
    });

    it('should use default chunk size', async () => {
      // Arrange
      const operations = Array(150).fill(null).map((_, i) => ({
        type: 'get' as const,
        key: `key${i}`,
      }));

      // Act
      await service.executeBatchChunked(operations);

      // Assert
      expect(mockPipeline.exec).toHaveBeenCalledTimes(2); // 2 chunks with default size 100
    });

    it('should handle single chunk', async () => {
      // Arrange
      const operations = Array(50).fill(null).map((_, i) => ({
        type: 'get' as const,
        key: `key${i}`,
      }));

      // Act
      const results = await service.executeBatchChunked(operations, 100);

      // Assert
      expect(results).toHaveLength(50);
      expect(mockPipeline.exec).toHaveBeenCalledTimes(1);
    });

    it('should add delay between chunks', async () => {
      // Arrange
      const operations = Array(200).fill(null).map((_, i) => ({
        type: 'get' as const,
        key: `key${i}`,
      }));
      jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);

      // Act
      await service.executeBatchChunked(operations, 100);

      // Assert
      expect((service as any).delay).toHaveBeenCalledWith(10);
      expect((service as any).delay).toHaveBeenCalledTimes(1); // Only between chunks
    });
  });

  describe('batchGet', () => {
    it('should batch get multiple keys', async () => {
      // Arrange
      const keys = ['key1', 'key2', 'key3'];
      mockPipeline.exec.mockResolvedValue([
        [null, '"value1"'],
        [null, null],
        [null, '"value3"'],
      ]);

      // Act
      const result = await service.batchGet(keys);

      // Assert
      expect(result.size).toBe(2);
      expect(result.get('key1')).toBe('value1');
      expect(result.has('key2')).toBe(false);
      expect(result.get('key3')).toBe('value3');
    });

    it('should handle empty keys array', async () => {
      // Act
      const result = await service.batchGet([]);

      // Assert
      expect(result.size).toBe(0);
    });

    it('should handle failed operations', async () => {
      // Arrange
      const keys = ['key1', 'key2'];
      mockPipeline.exec.mockResolvedValue([
        [new Error('Get failed'), null],
        [null, '"value2"'],
      ]);

      // Act
      const result = await service.batchGet(keys);

      // Assert
      expect(result.size).toBe(1);
      expect(result.get('key2')).toBe('value2');
    });
  });

  describe('batchSet', () => {
    it('should batch set multiple entries', async () => {
      // Arrange
      const entries = [
        { key: 'key1', value: 'value1', ttl: 3600 },
        { key: 'key2', value: 'value2' },
        { key: 'key3', value: { nested: 'object' } },
      ];

      // Act
      const result = await service.batchSet(entries);

      // Assert
      expect(result.size).toBe(3);
      expect(result.get('key1')).toBe(true);
      expect(result.get('key2')).toBe(true);
      expect(result.get('key3')).toBe(true);
    });

    it('should handle empty entries array', async () => {
      // Act
      const result = await service.batchSet([]);

      // Assert
      expect(result.size).toBe(0);
    });

    it('should track failed operations', async () => {
      // Arrange
      const entries = [
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' },
      ];
      mockPipeline.exec.mockResolvedValue([
        [null, 'OK'],
        [new Error('Set failed'), null],
      ]);

      // Act
      const result = await service.batchSet(entries);

      // Assert
      expect(result.get('key1')).toBe(true);
      expect(result.get('key2')).toBe(false);
    });
  });

  describe('batchDelete', () => {
    it('should batch delete multiple keys', async () => {
      // Arrange
      const keys = ['key1', 'key2', 'key3'];
      mockPipeline.exec.mockResolvedValue([
        [null, 1],
        [null, 1],
        [null, 0],
      ]);

      // Act
      const result = await service.batchDelete(keys);

      // Assert
      expect(result).toBe(3); // All operations succeeded
    });

    it('should count only successful deletions', async () => {
      // Arrange
      const keys = ['key1', 'key2', 'key3'];
      mockPipeline.exec.mockResolvedValue([
        [null, 1],
        [new Error('Delete failed'), null],
        [null, 1],
      ]);

      // Act
      const result = await service.batchDelete(keys);

      // Assert
      expect(result).toBe(2);
    });

    it('should handle empty keys array', async () => {
      // Act
      const result = await service.batchDelete([]);

      // Assert
      expect(result).toBe(0);
    });
  });

  describe('batchHashGet', () => {
    it('should batch get hash fields', async () => {
      // Arrange
      const hashOps = [
        { key: 'hash1', field: 'field1' },
        { key: 'hash2', field: 'field2' },
        { key: 'hash3', field: 'field3' },
      ];
      mockPipeline.exec.mockResolvedValue([
        [null, '"value1"'],
        [null, null],
        [null, '"value3"'],
      ]);

      // Act
      const result = await service.batchHashGet(hashOps);

      // Assert
      expect(result.size).toBe(2);
      expect(result.get('hash1:field1')).toBe('value1');
      expect(result.has('hash2:field2')).toBe(false);
      expect(result.get('hash3:field3')).toBe('value3');
    });

    it('should handle empty operations array', async () => {
      // Act
      const result = await service.batchHashGet([]);

      // Assert
      expect(result.size).toBe(0);
    });
  });

  describe('executeTransaction', () => {
    it('should execute operations as atomic transaction', async () => {
      // Arrange
      const operations: BatchOperation[] = [
        { type: 'set', key: 'key1', value: 'value1' },
        { type: 'set', key: 'key2', value: 'value2' },
        { type: 'del', key: 'key3' },
      ];

      // Act
      const results = await service.executeTransaction(operations);

      // Assert
      expect(results).toHaveLength(3);
      expect(mockPipeline.multi).toHaveBeenCalled();
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should throw on transaction failure', async () => {
      // Arrange
      const operations: BatchOperation[] = [{ type: 'get', key: 'key1' }];
      mockPipeline.exec.mockRejectedValue(new Error('Transaction failed'));

      // Act & Assert
      await expect(service.executeTransaction(operations)).rejects.toThrow('Transaction failed');
    });
  });

  describe('getPipelineStats', () => {
    it('should return pipeline statistics', async () => {
      // Arrange
      redisService.info.mockResolvedValue('blocked_clients:5\nconnected_clients:10');

      // Act
      const stats = await service.getPipelineStats();

      // Assert
      expect(stats).toEqual({
        connected: true,
        pendingCommands: 5,
      });
    });

    it('should handle missing blocked_clients info', async () => {
      // Arrange
      redisService.info.mockResolvedValue('connected_clients:10');

      // Act
      const stats = await service.getPipelineStats();

      // Assert
      expect(stats.pendingCommands).toBe(0);
    });

    it('should handle info retrieval failure', async () => {
      // Arrange
      redisService.info.mockRejectedValue(new Error('Info failed'));

      // Act
      const stats = await service.getPipelineStats();

      // Assert
      expect(stats).toEqual({
        connected: false,
        pendingCommands: 0,
      });
    });

    it('should detect disconnected status', async () => {
      // Arrange
      (redisService as any).status = 'disconnected';

      // Act
      const stats = await service.getPipelineStats();

      // Assert
      expect(stats.connected).toBe(false);
    });
  });

  describe('processResults', () => {
    it('should handle operation errors with throwOnError option', async () => {
      // Arrange
      const operations: BatchOperation[] = [
        { type: 'get', key: 'key1' },
        { type: 'get', key: 'key2' },
      ];
      const options: PipelineOptions = { throwOnError: true };
      mockPipeline.exec.mockResolvedValue([
        [null, 'value1'],
        [new Error('Operation failed'), null],
      ]);

      // Act & Assert
      await expect(service.executeBatch(operations, options)).rejects.toThrow('Operation failed');
    });

    it('should handle null results', async () => {
      // Arrange
      const operations: BatchOperation[] = [{ type: 'get', key: 'key1' }];
      mockPipeline.exec.mockResolvedValue([null]);

      // Act
      const results = await service.executeBatch(operations);

      // Assert
      expect(results[0].success).toBe(true);
      expect(results[0].value).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should handle unsupported operation type', async () => {
      // Arrange
      const operations: any[] = [{ type: 'unsupported', key: 'key1' }];

      // Act & Assert
      await expect(service.executeBatch(operations)).rejects.toThrow(
        'Unsupported operation type: unsupported'
      );
    });

    it('should handle concurrent batch executions', async () => {
      // Arrange
      const operations: BatchOperation[] = [
        { type: 'get', key: 'key1' },
        { type: 'set', key: 'key2', value: 'value2' },
      ];

      // Act
      const promises = Array(5).fill(null).map(() => service.executeBatch(operations));
      const results = await Promise.all(promises);

      // Assert
      expect(results).toHaveLength(5);
      results.forEach(result => expect(result).toHaveLength(2));
      expect(mockPipeline.exec).toHaveBeenCalledTimes(5);
    });

    it('should handle very large values', async () => {
      // Arrange
      const largeValue = 'x'.repeat(100000);
      const operations: BatchOperation[] = [
        { type: 'set', key: 'key1', value: largeValue },
      ];

      // Act
      const results = await service.executeBatch(operations);

      // Assert
      expect(results[0].success).toBe(true);
      expect(mockPipeline.set).toHaveBeenCalledWith('key1', expect.stringContaining(largeValue));
    });

    it('should chunk array correctly', () => {
      // Arrange
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      // Act
      const chunks = service['chunkArray'](array, 3);

      // Assert
      expect(chunks).toEqual([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
        [10],
      ]);
    });

    it('should handle delay correctly', async () => {
      // Arrange
      jest.useFakeTimers();
      const delayPromise = service['delay'](100);
      
      // Act
      jest.advanceTimersByTime(100);
      await delayPromise;

      // Assert
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 100);
      
      jest.useRealTimers();
    });
  });
});