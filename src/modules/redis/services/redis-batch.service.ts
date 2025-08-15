import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis.service';

export interface BatchOperation {
  type: 'get' | 'set' | 'del' | 'hget' | 'hset' | 'sadd' | 'srem';
  key: string;
  value?: any;
  field?: string;
  ttl?: number;
}

export interface BatchResult<T = any> {
  success: boolean;
  value?: T;
  error?: Error;
  operation: BatchOperation;
}

export interface PipelineOptions {
  atomic?: boolean; // Use MULTI/EXEC for atomicity
  throwOnError?: boolean; // Throw if any operation fails
  timeout?: number; // Operation timeout in ms
}

@Injectable()
export class RedisBatchService {
  private readonly logger = new Logger(RedisBatchService.name);
  private readonly defaultBatchSize = 100;
  private readonly maxBatchSize = 1000;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Execute multiple operations in a single pipeline
   */
  async executeBatch(
    operations: BatchOperation[],
    options: PipelineOptions = {},
  ): Promise<BatchResult[]> {
    if (operations.length === 0) {
      return [];
    }

    if (operations.length > this.maxBatchSize) {
      this.logger.warn(
        `Batch size ${operations.length} exceeds maximum ${this.maxBatchSize}. Consider splitting into smaller batches.`,
      );
    }

    const startTime = Date.now();
    const pipeline = this.redisService.pipeline();

    if (options.atomic) {
      pipeline.multi();
    }

    try {
      // Build pipeline
      for (const op of operations) {
        this.addOperationToPipeline(pipeline, op);
      }

      // Execute pipeline (exec() is already called on multi transactions)
      const results = await pipeline.exec();
      const duration = Date.now() - startTime;

      this.logger.debug(`Executed ${operations.length} operations in ${duration}ms`);

      // Process results
      return this.processResults(operations, results, options);
    } catch (error) {
      this.logger.error('Batch execution failed:', error);

      if (options.throwOnError) {
        throw error;
      }

      // Return error results for all operations
      return operations.map((op) => ({
        success: false,
        error: error as Error,
        operation: op,
      }));
    }
  }

  /**
   * Execute operations in chunks to avoid overwhelming Redis
   */
  async executeBatchChunked(
    operations: BatchOperation[],
    chunkSize: number = this.defaultBatchSize,
    options: PipelineOptions = {},
  ): Promise<BatchResult[]> {
    const results: BatchResult[] = [];
    const chunks = this.chunkArray(operations, chunkSize);

    this.logger.debug(
      `Executing ${operations.length} operations in ${chunks.length} chunks of size ${chunkSize}`,
    );

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkResults = await this.executeBatch(chunk, options);
      results.push(...chunkResults);

      // Add small delay between chunks to avoid overwhelming Redis
      if (i < chunks.length - 1) {
        await this.delay(10);
      }
    }

    return results;
  }

  /**
   * Batch get operation with automatic chunking
   */
  async batchGet(keys: string[]): Promise<Map<string, any>> {
    const operations: BatchOperation[] = keys.map((key) => ({
      type: 'get',
      key,
    }));

    const results = await this.executeBatchChunked(operations);
    const resultMap = new Map<string, any>();

    results.forEach((result, index) => {
      if (result.success && result.value !== null) {
        resultMap.set(keys[index], result.value);
      }
    });

    return resultMap;
  }

  /**
   * Batch set operation with automatic chunking
   */
  async batchSet(
    entries: Array<{ key: string; value: any; ttl?: number }>,
  ): Promise<Map<string, boolean>> {
    const operations: BatchOperation[] = entries.map((entry) => ({
      type: 'set',
      key: entry.key,
      value: entry.value,
      ttl: entry.ttl,
    }));

    const results = await this.executeBatchChunked(operations);
    const resultMap = new Map<string, boolean>();

    results.forEach((result, index) => {
      resultMap.set(entries[index].key, result.success);
    });

    return resultMap;
  }

  /**
   * Batch delete operation
   */
  async batchDelete(keys: string[]): Promise<number> {
    const operations: BatchOperation[] = keys.map((key) => ({
      type: 'del',
      key,
    }));

    const results = await this.executeBatchChunked(operations);
    return results.filter((r) => r.success).length;
  }

  /**
   * Batch hash operations
   */
  async batchHashGet(hashOps: Array<{ key: string; field: string }>): Promise<Map<string, any>> {
    const operations: BatchOperation[] = hashOps.map((op) => ({
      type: 'hget',
      key: op.key,
      field: op.field,
    }));

    const results = await this.executeBatchChunked(operations);
    const resultMap = new Map<string, any>();

    results.forEach((result, index) => {
      if (result.success && result.value !== null) {
        const key = `${hashOps[index].key}:${hashOps[index].field}`;
        resultMap.set(key, result.value);
      }
    });

    return resultMap;
  }

  /**
   * Optimize multiple related operations
   */
  async executeTransaction(operations: BatchOperation[]): Promise<BatchResult[]> {
    return this.executeBatch(operations, { atomic: true, throwOnError: true });
  }

  /**
   * Get pipeline statistics
   */
  async getPipelineStats(): Promise<{
    connected: boolean;
    pendingCommands: number;
  }> {
    try {
      const info = await this.redisService.info('clients');
      const connected = this.redisService.status === 'ready';

      // Parse pending commands from info
      const pendingMatch = info.match(/blocked_clients:(\d+)/);
      const pendingCommands = pendingMatch ? parseInt(pendingMatch[1], 10) : 0;

      return {
        connected,
        pendingCommands,
      };
    } catch (error) {
      this.logger.error('Failed to get pipeline stats:', error);
      return {
        connected: false,
        pendingCommands: 0,
      };
    }
  }

  /**
   * Add operation to pipeline based on type
   */
  private addOperationToPipeline(pipeline: any, op: BatchOperation): void {
    switch (op.type) {
      case 'get':
        pipeline.get(op.key);
        break;
      case 'set':
        if (op.ttl) {
          pipeline.set(op.key, JSON.stringify(op.value), 'EX', op.ttl);
        } else {
          pipeline.set(op.key, JSON.stringify(op.value));
        }
        break;
      case 'del':
        pipeline.del(op.key);
        break;
      case 'hget':
        pipeline.hget(op.key, op.field!);
        break;
      case 'hset':
        pipeline.hset(op.key, op.field!, JSON.stringify(op.value));
        break;
      case 'sadd':
        pipeline.sadd(op.key, op.value);
        break;
      case 'srem':
        pipeline.srem(op.key, op.value);
        break;
      default:
        throw new Error(`Unsupported operation type: ${op.type}`);
    }
  }

  /**
   * Process pipeline results
   */
  private processResults(
    operations: BatchOperation[],
    results: any[],
    options: PipelineOptions,
  ): BatchResult[] {
    // Ensure we have the same number of results as operations
    // If not, pad with null results
    const normalizedResults = results || [];
    
    return operations.map((operation, index) => {
      // Get the result for this operation, or null if missing
      const result = normalizedResults[index];
      const [error, value] = result || [null, null];

      if (!operation) {
        // This shouldn't happen but let's be defensive
        return {
          success: false,
          error: new Error('Missing operation'),
          operation: { type: 'get', key: 'unknown' } as BatchOperation,
        };
      }

      if (error) {
        this.logger.error(`Operation ${operation.type} on key ${operation.key} failed:`, error);

        if (options.throwOnError) {
          throw error;
        }

        return {
          success: false,
          error,
          operation,
        };
      }

      // Parse JSON values for get and hget operations
      let parsedValue = value;
      if ((operation.type === 'get' || operation.type === 'hget') && value !== null) {
        try {
          parsedValue = JSON.parse(value);
        } catch {
          // Keep original value if not JSON
          parsedValue = value;
        }
      }

      return {
        success: true,
        value: parsedValue,
        operation,
      };
    });
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
