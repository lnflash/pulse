import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QueueMonitorService, QueueHealth, QueueAlert, QueueThresholds } from './queue-monitor.service';
import { MetricsService } from '../../common/services/metrics.service';
import { Redis } from 'ioredis';
import * as amqp from 'amqplib';

// Mock amqplib
jest.mock('amqplib');

describe('QueueMonitorService', () => {
  let service: QueueMonitorService;
  let configService: jest.Mocked<ConfigService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let redis: jest.Mocked<Redis>;
  let metricsService: jest.Mocked<MetricsService>;
  let mockChannel: any;
  let mockConnection: any;

  beforeEach(async () => {
    // Setup AMQP mocks
    mockChannel = {
      assertExchange: jest.fn(),
      assertQueue: jest.fn(),
    };
    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
    };
    (amqp.connect as jest.Mock).mockResolvedValue(mockConnection);

    // Clear all timers
    jest.clearAllTimers();
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueMonitorService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
              const config: any = {
                'rabbitmq.url': 'amqp://localhost',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: 'default_IORedisModuleConnectionToken',
          useValue: {
            llen: jest.fn().mockResolvedValue(0),
            scard: jest.fn().mockResolvedValue(0),
            zcard: jest.fn().mockResolvedValue(0),
            lindex: jest.fn().mockResolvedValue(null),
            get: jest.fn().mockResolvedValue(null),
            setex: jest.fn().mockResolvedValue('OK'),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            recordMetric: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<QueueMonitorService>(QueueMonitorService);
    configService = module.get(ConfigService);
    eventEmitter = module.get(EventEmitter2);
    redis = module.get('default_IORedisModuleConnectionToken');
    metricsService = module.get(MetricsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize AMQP and monitoring on module init', async () => {
      // Act
      await service.onModuleInit();

      // Assert
      expect(amqp.connect).toHaveBeenCalledWith('amqp://localhost');
      expect(mockConnection.createChannel).toHaveBeenCalled();
    });

    it('should handle missing RabbitMQ configuration', async () => {
      // Arrange
      configService.get.mockReturnValue(undefined);

      // Act
      await service.onModuleInit();

      // Assert - Should not throw
      expect(service).toBeDefined();
    });

    it('should handle AMQP connection failure', async () => {
      // Arrange
      (amqp.connect as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      // Act
      await service.onModuleInit();

      // Assert - Should not throw
      expect(service).toBeDefined();
    });
  });

  describe('monitorQueue', () => {
    it('should start monitoring a queue with default thresholds', async () => {
      // Act
      await service.monitorQueue('test-queue');

      // Assert
      const health = service.getQueueHealthByName('test-queue');
      expect(health).toBeDefined();
      expect(health?.name).toBe('test-queue');
      expect(health?.status).toBe('healthy');
      expect(health?.size).toBe(0);
    });

    it('should start monitoring a queue with custom thresholds', async () => {
      // Arrange
      const thresholds: Partial<QueueThresholds> = {
        maxSize: 500,
        maxAge: 60000,
        minProcessingRate: 1,
      };

      // Act
      await service.monitorQueue('test-queue', thresholds);

      // Assert
      const health = service.getQueueHealthByName('test-queue');
      expect(health).toBeDefined();
    });

    it('should update existing queue monitoring', async () => {
      // Arrange
      await service.monitorQueue('test-queue');
      const initialHealth = service.getQueueHealthByName('test-queue');

      // Act
      await service.monitorQueue('test-queue', { maxSize: 100 });

      // Assert
      const updatedHealth = service.getQueueHealthByName('test-queue');
      expect(updatedHealth?.name).toBe('test-queue');
      expect(updatedHealth?.lastChecked).not.toBe(initialHealth?.lastChecked);
    });
  });

  describe('stopMonitoringQueue', () => {
    it('should stop monitoring a queue', async () => {
      // Arrange
      await service.monitorQueue('test-queue');

      // Act
      service.stopMonitoringQueue('test-queue');

      // Assert
      const health = service.getQueueHealthByName('test-queue');
      expect(health).toBeNull();
    });

    it('should handle stopping non-monitored queue', () => {
      // Act & Assert - Should not throw
      expect(() => service.stopMonitoringQueue('non-existent')).not.toThrow();
    });
  });

  describe('getQueueHealth', () => {
    it('should return health for all monitored queues', async () => {
      // Arrange
      await service.monitorQueue('queue1');
      await service.monitorQueue('queue2');
      await service.monitorQueue('queue3');

      // Act
      const health = service.getQueueHealth();

      // Assert
      expect(Object.keys(health)).toHaveLength(3);
      expect(health['queue1']).toBeDefined();
      expect(health['queue2']).toBeDefined();
      expect(health['queue3']).toBeDefined();
    });

    it('should return empty object when no queues monitored', () => {
      // Act
      const health = service.getQueueHealth();

      // Assert
      expect(health).toEqual({});
    });
  });

  describe('getQueueHealthByName', () => {
    it('should return health for specific queue', async () => {
      // Arrange
      await service.monitorQueue('test-queue');

      // Act
      const health = service.getQueueHealthByName('test-queue');

      // Assert
      expect(health).toBeDefined();
      expect(health?.name).toBe('test-queue');
    });

    it('should return null for non-monitored queue', () => {
      // Act
      const health = service.getQueueHealthByName('non-existent');

      // Assert
      expect(health).toBeNull();
    });
  });

  describe('getAlerts', () => {
    it('should return recent alerts', () => {
      // Arrange
      const mockAlerts: QueueAlert[] = [
        {
          queue: 'queue1',
          level: 'warning',
          message: 'Test alert 1',
          metric: 'size',
          value: 100,
          threshold: 50,
          timestamp: new Date(),
        },
        {
          queue: 'queue2',
          level: 'error',
          message: 'Test alert 2',
          metric: 'errorRate',
          value: 0.1,
          threshold: 0.05,
          timestamp: new Date(),
        },
      ];
      service['alerts'].push(...mockAlerts);

      // Act
      const alerts = service.getAlerts();

      // Assert
      expect(alerts).toHaveLength(2);
      expect(alerts[0].queue).toBe('queue1');
      expect(alerts[1].queue).toBe('queue2');
    });

    it('should limit returned alerts', () => {
      // Arrange
      for (let i = 0; i < 150; i++) {
        service['alerts'].push({
          queue: `queue${i}`,
          level: 'warning',
          message: `Alert ${i}`,
          metric: 'size',
          value: i,
          threshold: 50,
          timestamp: new Date(),
        });
      }

      // Act
      const alerts = service.getAlerts(50);

      // Assert
      expect(alerts).toHaveLength(50);
    });
  });

  describe('clearOldAlerts', () => {
    it('should clear alerts older than specified hours', () => {
      // Arrange
      const now = Date.now();
      const oldAlert: QueueAlert = {
        queue: 'old-queue',
        level: 'warning',
        message: 'Old alert',
        metric: 'size',
        value: 100,
        threshold: 50,
        timestamp: new Date(now - 25 * 60 * 60 * 1000), // 25 hours old
      };
      const recentAlert: QueueAlert = {
        queue: 'recent-queue',
        level: 'error',
        message: 'Recent alert',
        metric: 'size',
        value: 200,
        threshold: 100,
        timestamp: new Date(now - 1 * 60 * 60 * 1000), // 1 hour old
      };
      service['alerts'].push(oldAlert, recentAlert);

      // Act
      const removed = service.clearOldAlerts(24);

      // Assert
      expect(removed).toBe(1);
      expect(service.getAlerts()).toHaveLength(1);
      expect(service.getAlerts()[0].queue).toBe('recent-queue');
    });

    it('should return 0 when no alerts to clear', () => {
      // Act
      const removed = service.clearOldAlerts();

      // Assert
      expect(removed).toBe(0);
    });
  });

  describe('setMonitoringEnabled', () => {
    it('should enable monitoring', () => {
      // Act
      service.setMonitoringEnabled(true);

      // Assert
      expect(service['monitoringEnabled']).toBe(true);
    });

    it('should disable monitoring', () => {
      // Act
      service.setMonitoringEnabled(false);

      // Assert
      expect(service['monitoringEnabled']).toBe(false);
    });
  });

  describe('performHealthChecks', () => {
    it('should check health of all monitored queues', async () => {
      // Arrange
      await service.monitorQueue('queue1');
      await service.monitorQueue('queue2');
      jest.spyOn(service as any, 'checkQueueHealth').mockResolvedValue(undefined);

      // Act
      await service['performHealthChecks']();

      // Assert
      expect(service['checkQueueHealth']).toHaveBeenCalledTimes(2);
      expect(service['checkQueueHealth']).toHaveBeenCalledWith('queue1');
      expect(service['checkQueueHealth']).toHaveBeenCalledWith('queue2');
    });

    it('should skip health checks when monitoring disabled', async () => {
      // Arrange
      service.setMonitoringEnabled(false);
      await service.monitorQueue('queue1');
      jest.spyOn(service as any, 'checkQueueHealth');

      // Act
      await service['performHealthChecks']();

      // Assert
      expect(service['checkQueueHealth']).not.toHaveBeenCalled();
    });

    it('should handle health check failures gracefully', async () => {
      // Arrange
      await service.monitorQueue('queue1');
      jest.spyOn(service as any, 'checkQueueHealth').mockRejectedValue(new Error('Check failed'));

      // Act & Assert - Should not throw
      await expect(service['performHealthChecks']()).resolves.not.toThrow();
    });
  });

  describe('collectMetrics', () => {
    it('should collect and store metrics', async () => {
      // Arrange
      await service.monitorQueue('queue1');
      const health = service.getQueueHealthByName('queue1');
      if (health) {
        health.size = 100;
        health.processingRate = 5;
        health.errorRate = 0.02;
      }

      // Act
      await service['collectMetrics']();

      // Assert
      expect(metricsService.recordMetric).toHaveBeenCalledWith('queue.size', 100, { queue: 'queue1' });
      expect(metricsService.recordMetric).toHaveBeenCalledWith('queue.processing_rate', 5, { queue: 'queue1' });
      expect(metricsService.recordMetric).toHaveBeenCalledWith('queue.error_rate', 0.02, { queue: 'queue1' });
      expect(redis.setex).toHaveBeenCalled();
    });

    it('should skip metrics collection when monitoring disabled', async () => {
      // Arrange
      service.setMonitoringEnabled(false);

      // Act
      await service['collectMetrics']();

      // Assert
      expect(metricsService.recordMetric).not.toHaveBeenCalled();
    });
  });

  describe('generateHealthReport', () => {
    it('should generate health report for all queues', async () => {
      // Arrange
      await service.monitorQueue('healthy-queue');
      await service.monitorQueue('degraded-queue');
      await service.monitorQueue('critical-queue');
      
      const healthyQueue = service['queueStats'].get('healthy-queue');
      const degradedQueue = service['queueStats'].get('degraded-queue');
      const criticalQueue = service['queueStats'].get('critical-queue');
      
      if (healthyQueue) healthyQueue.status = 'healthy';
      if (degradedQueue) degradedQueue.status = 'degraded';
      if (criticalQueue) criticalQueue.status = 'critical';

      // Act
      await service['generateHealthReport']();

      // Assert
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'queue.health.report',
        expect.objectContaining({
          summary: {
            totalQueues: 3,
            healthy: 1,
            degraded: 1,
            critical: 1,
          },
        })
      );
    });

    it('should skip report generation when monitoring disabled', async () => {
      // Arrange
      service.setMonitoringEnabled(false);

      // Act
      await service['generateHealthReport']();

      // Assert
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('checkQueueHealth', () => {
    beforeEach(async () => {
      await service.monitorQueue('test-queue');
    });

    it('should update queue stats based on metrics', async () => {
      // Arrange
      redis.llen.mockResolvedValue(50);
      redis.get.mockResolvedValue(JSON.stringify({
        processed: 100,
        lastProcessed: Date.now() - 10000,
        errors: 2,
        totalProcessingTime: 50000,
      }));

      // Act
      await service['checkQueueHealth']('test-queue');

      // Assert
      const health = service.getQueueHealthByName('test-queue');
      expect(health?.size).toBe(50);
      expect(health?.status).toBe('healthy');
    });

    it('should create alert when queue size exceeds threshold', async () => {
      // Arrange
      redis.llen.mockResolvedValue(2000);
      jest.spyOn(service as any, 'createAlert');

      // Act
      await service['checkQueueHealth']('test-queue');

      // Assert
      expect(service['createAlert']).toHaveBeenCalledWith(
        'test-queue',
        'error',
        'Queue size exceeded',
        'size',
        2000,
        1000
      );
    });

    it('should detect degraded status', async () => {
      // Arrange
      redis.llen.mockResolvedValue(1500);
      redis.get.mockResolvedValue(JSON.stringify({
        processed: 100,
        errors: 3,
        totalProcessingTime: 50000,
      }));

      // Act
      await service['checkQueueHealth']('test-queue');

      // Assert
      const health = service.getQueueHealthByName('test-queue');
      expect(health?.status).toBe('degraded');
    });

    it('should detect critical status', async () => {
      // Arrange
      redis.llen.mockResolvedValue(3000);
      redis.get.mockResolvedValue(JSON.stringify({
        processed: 100,
        errors: 10,
        totalProcessingTime: 600000,
      }));

      // Act
      await service['checkQueueHealth']('test-queue');

      // Assert
      const health = service.getQueueHealthByName('test-queue');
      expect(health?.status).toBe('critical');
    });

    it('should emit status change event', async () => {
      // Arrange
      service['queueMetrics'].set('test-queue', { previousStatus: 'healthy' });
      redis.llen.mockResolvedValue(2000);

      // Act
      await service['checkQueueHealth']('test-queue');

      // Assert
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'queue.status.changed',
        expect.objectContaining({
          queue: 'test-queue',
          previousStatus: 'healthy',
          currentStatus: expect.any(String),
        })
      );
    });

    it('should handle old messages in queue', async () => {
      // Arrange
      const oldTimestamp = Date.now() - 600000; // 10 minutes old
      redis.lindex.mockResolvedValue(JSON.stringify({ timestamp: oldTimestamp }));
      jest.spyOn(service as any, 'createAlert');

      // Act
      await service['checkQueueHealth']('test-queue');

      // Assert
      expect(service['createAlert']).toHaveBeenCalledWith(
        'test-queue',
        'warning',
        'Message age exceeded',
        'age',
        expect.any(Number),
        300000
      );
    });

    it('should handle low processing rate', async () => {
      // Arrange
      redis.llen.mockResolvedValue(100);
      redis.get.mockResolvedValue(JSON.stringify({
        processed: 1,
        lastProcessed: Date.now() - 100000,
      }));
      jest.spyOn(service as any, 'createAlert');

      // Act
      await service['checkQueueHealth']('test-queue');

      // Assert
      expect(service['createAlert']).toHaveBeenCalledWith(
        'test-queue',
        'warning',
        'Low processing rate',
        'processingRate',
        expect.any(Number),
        0.1
      );
    });

    it('should handle high error rate', async () => {
      // Arrange
      redis.get.mockResolvedValue(JSON.stringify({
        processed: 100,
        errors: 10,
      }));
      jest.spyOn(service as any, 'createAlert');

      // Act
      await service['checkQueueHealth']('test-queue');

      // Assert
      expect(service['createAlert']).toHaveBeenCalledWith(
        'test-queue',
        'error',
        'High error rate',
        'errorRate',
        0.1,
        0.05
      );
    });
  });

  describe('getRedisQueueSize', () => {
    it('should get maximum size from different Redis structures', async () => {
      // Arrange
      redis.llen.mockResolvedValue(10);
      redis.scard.mockResolvedValue(20);
      redis.zcard.mockResolvedValue(15);

      // Act
      const size = await service['getRedisQueueSize']('test-queue');

      // Assert
      expect(size).toBe(20);
    });

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      redis.llen.mockRejectedValue(new Error('Redis error'));

      // Act
      const size = await service['getRedisQueueSize']('test-queue');

      // Assert
      expect(size).toBe(0);
    });
  });

  describe('getQueueMetrics', () => {
    it('should calculate metrics from stored data', async () => {
      // Arrange
      const metricsData = {
        processed: 100,
        lastProcessed: Date.now() - 10000,
        errors: 5,
        totalProcessingTime: 50000,
      };
      redis.get.mockResolvedValue(JSON.stringify(metricsData));

      // Act
      const metrics = await service['getQueueMetrics']('test-queue');

      // Assert
      expect(metrics.errorRate).toBeCloseTo(0.05, 2);
      expect(metrics.avgProcessingTime).toBe(500);
      expect(metrics.processingRate).toBeGreaterThan(0);
    });

    it('should handle missing metrics data', async () => {
      // Arrange
      redis.get.mockResolvedValue(null);

      // Act
      const metrics = await service['getQueueMetrics']('test-queue');

      // Assert
      expect(metrics.processingRate).toBe(0);
      expect(metrics.errorRate).toBe(0);
      expect(metrics.avgProcessingTime).toBe(0);
      expect(metrics.oldestMessage).toBeNull();
    });

    it('should parse oldest message timestamp', async () => {
      // Arrange
      const timestamp = Date.now() - 60000;
      redis.lindex.mockResolvedValue(JSON.stringify({ timestamp }));

      // Act
      const metrics = await service['getQueueMetrics']('test-queue');

      // Assert
      expect(metrics.oldestMessage).toBeInstanceOf(Date);
      expect(metrics.oldestMessage?.getTime()).toBe(timestamp);
    });

    it('should handle plain timestamp string', async () => {
      // Arrange
      const timestamp = Date.now() - 60000;
      redis.lindex.mockResolvedValue(timestamp.toString());

      // Act
      const metrics = await service['getQueueMetrics']('test-queue');

      // Assert
      expect(metrics.oldestMessage).toBeInstanceOf(Date);
      expect(metrics.oldestMessage?.getTime()).toBe(timestamp);
    });

    it('should handle Redis errors in metrics retrieval', async () => {
      // Arrange
      redis.get.mockRejectedValue(new Error('Redis error'));

      // Act
      const metrics = await service['getQueueMetrics']('test-queue');

      // Assert
      expect(metrics).toEqual({
        processingRate: 0,
        errorRate: 0,
        avgProcessingTime: 0,
        oldestMessage: null,
      });
    });
  });

  describe('getConsumerCount', () => {
    it('should get consumer count from Redis', async () => {
      // Arrange
      redis.scard.mockResolvedValue(5);

      // Act
      const count = await service['getConsumerCount']('test-queue');

      // Assert
      expect(count).toBe(5);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      redis.scard.mockRejectedValue(new Error('Redis error'));

      // Act
      const count = await service['getConsumerCount']('test-queue');

      // Assert
      expect(count).toBe(0);
    });
  });

  describe('calculateRate', () => {
    it('should calculate rate correctly', () => {
      // Arrange
      const count = 100;
      const lastTime = Date.now() - 10000; // 10 seconds ago
      const currentTime = Date.now();

      // Act
      const rate = service['calculateRate'](count, lastTime, currentTime);

      // Assert
      expect(rate).toBeCloseTo(10, 1); // ~10 per second
    });

    it('should handle zero time difference', () => {
      // Arrange
      const currentTime = Date.now();

      // Act
      const rate = service['calculateRate'](100, currentTime, currentTime);

      // Assert
      expect(rate).toBe(0);
    });
  });

  describe('createAlert', () => {
    it('should create and emit warning alert', () => {
      // Act
      service['createAlert']('test-queue', 'warning', 'Test warning', 'size', 100, 50);

      // Assert
      const alerts = service.getAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].level).toBe('warning');
      expect(eventEmitter.emit).toHaveBeenCalledWith('queue.alert', expect.any(Object));
    });

    it('should create and emit error alert', () => {
      // Act
      service['createAlert']('test-queue', 'error', 'Test error', 'errorRate', 0.1, 0.05);

      // Assert
      const alerts = service.getAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].level).toBe('error');
    });

    it('should create and emit critical alert', () => {
      // Act
      service['createAlert']('test-queue', 'critical', 'Test critical', 'size', 5000, 1000);

      // Assert
      const alerts = service.getAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].level).toBe('critical');
    });

    it('should limit total alerts to 1000', () => {
      // Arrange
      for (let i = 0; i < 1005; i++) {
        service['createAlert']('test-queue', 'warning', `Alert ${i}`, 'size', i, 50);
      }

      // Act & Assert
      expect(service['alerts'].length).toBe(1000);
    });
  });

  describe('Edge cases', () => {
    it('should handle concurrent queue health checks', async () => {
      // Arrange
      await service.monitorQueue('queue1');
      await service.monitorQueue('queue2');
      await service.monitorQueue('queue3');

      // Act
      const promises = ['queue1', 'queue2', 'queue3'].map(q =>
        service['checkQueueHealth'](q)
      );
      await Promise.all(promises);

      // Assert
      expect(service.getQueueHealth()).toHaveProperty('queue1');
      expect(service.getQueueHealth()).toHaveProperty('queue2');
      expect(service.getQueueHealth()).toHaveProperty('queue3');
    });

    it('should handle very large queue sizes', async () => {
      // Arrange
      await service.monitorQueue('large-queue');
      redis.llen.mockResolvedValue(1000000);

      // Act
      await service['checkQueueHealth']('large-queue');

      // Assert
      const health = service.getQueueHealthByName('large-queue');
      expect(health?.size).toBe(1000000);
      expect(health?.status).toBe('critical');
    });

    it('should handle invalid JSON in metrics', async () => {
      // Arrange
      redis.get.mockResolvedValue('invalid json');
      redis.lindex.mockResolvedValue('also invalid');

      // Act
      const metrics = await service['getQueueMetrics']('test-queue');

      // Assert
      expect(metrics.processingRate).toBe(0);
      expect(metrics.oldestMessage).toBeNull();
    });
  });
});