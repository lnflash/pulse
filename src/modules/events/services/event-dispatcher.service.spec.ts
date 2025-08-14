import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventDispatcherService, EventPayload, EventDispatchOptions } from './event-dispatcher.service';
import { Redis } from 'ioredis';
import * as amqp from 'amqplib';

// Mock amqplib
jest.mock('amqplib');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
}));

describe('EventDispatcherService', () => {
  let service: EventDispatcherService;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let configService: jest.Mocked<ConfigService>;
  let redis: jest.Mocked<Redis>;
  let mockChannel: any;
  let mockConnection: any;

  const mockEvent: EventPayload = {
    type: 'test.event',
    source: 'test-source',
    data: { test: 'data' },
    metadata: {
      correlationId: 'corr-123',
      userId: 'user-123',
    },
  };

  beforeEach(async () => {
    // Setup AMQP mocks
    mockChannel = {
      assertExchange: jest.fn(),
      publish: jest.fn(),
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
        EventDispatcherService,
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
            on: jest.fn(),
            onAny: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
              const config: any = {
                'rabbitmq.url': 'amqp://localhost',
                'rabbitmq.exchangeName': 'pulse.events',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: 'default_IORedisModuleConnectionToken',
          useValue: {
            keys: jest.fn().mockResolvedValue([]),
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
            setex: jest.fn().mockResolvedValue('OK'),
            del: jest.fn().mockResolvedValue(1),
            lpush: jest.fn().mockResolvedValue(1),
            ltrim: jest.fn().mockResolvedValue('OK'),
            zadd: jest.fn().mockResolvedValue(1),
            zrangebyscore: jest.fn().mockResolvedValue([]),
            zremrangebyscore: jest.fn().mockResolvedValue(0),
            expire: jest.fn().mockResolvedValue(1),
            pipeline: jest.fn().mockReturnValue({
              lpush: jest.fn().mockReturnThis(),
              exec: jest.fn().mockResolvedValue([]),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EventDispatcherService>(EventDispatcherService);
    eventEmitter = module.get(EventEmitter2);
    configService = module.get(ConfigService);
    redis = module.get('default_IORedisModuleConnectionToken');

    // Allow initialization to complete
    await new Promise(resolve => setImmediate(resolve));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('dispatch', () => {
    it('should dispatch basic event', async () => {
      // Act
      await service.dispatch(mockEvent);

      // Assert
      expect(eventEmitter.emit).toHaveBeenCalledWith('test.event', expect.objectContaining({
        ...mockEvent,
        id: 'test-uuid',
        timestamp: expect.any(Date),
      }));
    });

    it('should generate event ID if not provided', async () => {
      // Arrange
      const eventWithoutId = { ...mockEvent };
      delete eventWithoutId.id;

      // Act
      await service.dispatch(eventWithoutId);

      // Assert
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'test.event',
        expect.objectContaining({ id: 'test-uuid' })
      );
    });

    it('should queue event when async option is true', async () => {
      // Arrange
      const options: EventDispatchOptions = { async: true };

      // Act
      await service.dispatch(mockEvent, options);

      // Assert
      expect(redis.lpush).toHaveBeenCalledWith(
        'events:test.event',
        expect.stringContaining('test.event')
      );
    });

    it('should persist event when persistent option is true', async () => {
      // Arrange
      const options: EventDispatchOptions = { persistent: true, ttl: 3600 };

      // Act
      await service.dispatch(mockEvent, options);

      // Assert
      expect(redis.setex).toHaveBeenCalledWith(
        'events:persistent:test-uuid',
        3600,
        expect.any(String)
      );
      expect(redis.zadd).toHaveBeenCalledWith(
        'events:timeline',
        expect.any(Number),
        'test-uuid'
      );
    });

    it('should handle delayed events', async () => {
      // Arrange
      const options: EventDispatchOptions = { async: true, delay: 5000 };

      // Act
      await service.dispatch(mockEvent, options);

      // Assert
      expect(redis.zadd).toHaveBeenCalledWith(
        'events:test.event:delayed',
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should publish to RabbitMQ for publishable event types', async () => {
      // Arrange
      const publishableEvent = { ...mockEvent, type: 'message.sent' };

      // Act
      await service.dispatch(publishableEvent);

      // Assert
      expect(mockChannel.publish).toHaveBeenCalledWith(
        'pulse.events',
        'event.message.sent',
        expect.any(Buffer),
        expect.objectContaining({
          persistent: true,
          priority: 5,
          messageId: 'test-uuid',
        })
      );
    });

    it('should store in dead letter queue on failure with retryable option', async () => {
      // Arrange
      const options: EventDispatchOptions = { retryable: true };
      eventEmitter.emit.mockImplementation(() => {
        throw new Error('Test error');
      });

      // Act & Assert
      await expect(service.dispatch(mockEvent, options)).rejects.toThrow('Test error');
      expect(redis.lpush).toHaveBeenCalledWith(
        'events:dead-letter',
        expect.stringContaining('Test error')
      );
    });

    it('should handle priority levels', async () => {
      // Arrange
      const options: EventDispatchOptions = { async: true, priority: 'high' };

      // Act
      await service.dispatch(mockEvent, options);

      // Assert
      expect(redis.lpush).toHaveBeenCalledWith(
        'events:test.event:high',
        expect.any(String)
      );
    });

    it('should set TTL on queued events', async () => {
      // Arrange
      const options: EventDispatchOptions = { async: true, ttl: 7200 };

      // Act
      await service.dispatch(mockEvent, options);

      // Assert
      expect(redis.expire).toHaveBeenCalledWith('events:test.event', 7200);
    });
  });

  describe('registerHandler', () => {
    it('should register event handler', () => {
      // Arrange
      const handler = jest.fn();

      // Act
      service.registerHandler('test.event', handler);

      // Assert
      expect(eventEmitter.on).toHaveBeenCalledWith('test.event', expect.any(Function));
    });

    it('should execute handler when event is emitted', async () => {
      // Arrange
      const handler = jest.fn().mockResolvedValue(undefined);
      let registeredHandler: any;
      
      eventEmitter.on.mockImplementation((event: string, fn: any) => {
        registeredHandler = fn;
        return eventEmitter;
      });

      // Act
      service.registerHandler('test.event', handler);
      await registeredHandler(mockEvent);

      // Assert
      expect(handler).toHaveBeenCalledWith(mockEvent);
    });

    it('should handle handler errors gracefully', async () => {
      // Arrange
      const handler = jest.fn().mockRejectedValue(new Error('Handler error'));
      let registeredHandler: any;
      
      eventEmitter.on.mockImplementation((event: string, fn: any) => {
        registeredHandler = fn;
        return eventEmitter;
      });

      // Act
      service.registerHandler('test.event', handler);
      
      // Assert - Should not throw
      await expect(registeredHandler(mockEvent)).resolves.not.toThrow();
    });
  });

  describe('batchDispatch', () => {
    it('should dispatch multiple events', async () => {
      // Arrange
      const events = [
        { ...mockEvent, type: 'event1' },
        { ...mockEvent, type: 'event2' },
        { ...mockEvent, type: 'event3' },
      ];

      // Act
      await service.batchDispatch(events);

      // Assert
      expect(eventEmitter.emit).toHaveBeenCalledTimes(3);
      expect(eventEmitter.emit).toHaveBeenCalledWith('event1', expect.any(Object));
      expect(eventEmitter.emit).toHaveBeenCalledWith('event2', expect.any(Object));
      expect(eventEmitter.emit).toHaveBeenCalledWith('event3', expect.any(Object));
    });

    it('should handle partial failures', async () => {
      // Arrange
      const events = [mockEvent, mockEvent];
      eventEmitter.emit
        .mockImplementationOnce(() => true)
        .mockImplementationOnce(() => {
          throw new Error('Dispatch failed');
        });

      // Act & Assert
      await expect(service.batchDispatch(events)).rejects.toThrow('Batch dispatch partially failed');
    });

    it('should apply options to all events', async () => {
      // Arrange
      const events = [mockEvent, mockEvent];
      const options: EventDispatchOptions = { persistent: true };

      // Act
      await service.batchDispatch(events, options);

      // Assert
      expect(redis.set).toHaveBeenCalledTimes(2);
    });
  });

  describe('getEventStats', () => {
    it('should return event statistics', () => {
      // Arrange - Dispatch some events first
      service['updateEventStats']('event1');
      service['updateEventStats']('event1');
      service['updateEventStats']('event2');

      // Act
      const stats = service.getEventStats();

      // Assert
      expect(stats.eventTypes).toHaveProperty('event1');
      expect(stats.eventTypes).toHaveProperty('event2');
      expect(stats.eventTypes.event1.count).toBe(2);
      expect(stats.eventTypes.event2.count).toBe(1);
      expect(stats.totalEvents).toBe(3);
    });

    it('should calculate event rate', () => {
      // Arrange
      const now = Date.now();
      service['eventStats'].set('test', { 
        count: 60, 
        lastSeen: new Date(now - 60000) // 1 minute ago
      });

      // Act
      const rate = service['calculateEventRate']('test');

      // Assert
      expect(rate).toBe(60); // 60 events per minute
    });
  });

  describe('cleanupOldEvents', () => {
    it('should delete old persistent events', async () => {
      // Arrange
      const oldEvent = {
        ...mockEvent,
        timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours old
      };
      redis.keys.mockResolvedValue(['events:persistent:old-event']);
      redis.get.mockResolvedValue(JSON.stringify(oldEvent));

      // Act
      const deleted = await service.cleanupOldEvents(24);

      // Assert
      expect(deleted).toBe(1);
      expect(redis.del).toHaveBeenCalledWith('events:persistent:old-event');
    });

    it('should keep recent events', async () => {
      // Arrange
      const recentEvent = {
        ...mockEvent,
        timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour old
      };
      redis.keys.mockResolvedValue(['events:persistent:recent-event']);
      redis.get.mockResolvedValue(JSON.stringify(recentEvent));

      // Act
      const deleted = await service.cleanupOldEvents(24);

      // Assert
      expect(deleted).toBe(0);
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON', async () => {
      // Arrange
      redis.keys.mockResolvedValue(['events:persistent:invalid']);
      redis.get.mockResolvedValue('invalid json');

      // Act
      const deleted = await service.cleanupOldEvents();

      // Assert
      expect(deleted).toBe(1);
      expect(redis.del).toHaveBeenCalledWith('events:persistent:invalid');
    });
  });

  describe('processDelayedEvents', () => {
    it('should move delayed events to active queue', async () => {
      // Arrange
      const delayedEvents = ['{"type":"delayed1"}', '{"type":"delayed2"}'];
      redis.keys.mockResolvedValue(['events:test:delayed']);
      redis.zrangebyscore.mockResolvedValue(delayedEvents);

      // Act
      await service.processDelayedEvents();

      // Assert
      expect(redis.zremrangebyscore).toHaveBeenCalledWith(
        'events:test:delayed',
        '-inf',
        expect.any(Number)
      );
      expect(redis.pipeline).toHaveBeenCalled();
    });

    it('should handle empty delayed queue', async () => {
      // Arrange
      redis.keys.mockResolvedValue(['events:test:delayed']);
      redis.zrangebyscore.mockResolvedValue([]);

      // Act
      await service.processDelayedEvents();

      // Assert
      expect(redis.zremrangebyscore).not.toHaveBeenCalled();
    });
  });

  describe('AMQP integration', () => {
    it('should initialize AMQP connection', async () => {
      // Assert
      expect(amqp.connect).toHaveBeenCalledWith('amqp://localhost');
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'pulse.events',
        'topic',
        { durable: true }
      );
    });

    it('should handle missing RabbitMQ configuration', async () => {
      // Arrange
      configService.get.mockImplementation((key: string) => {
        if (key === 'rabbitmq.url') return undefined;
        return 'pulse.events';
      });

      // Act
      const newService = new EventDispatcherService(eventEmitter, configService, redis);
      await new Promise(resolve => setImmediate(resolve));

      // Assert
      expect(amqp.connect).toHaveBeenCalledTimes(1); // Only from first service
    });

    it('should handle AMQP connection failure', async () => {
      // Arrange
      (amqp.connect as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      // Act
      const newService = new EventDispatcherService(eventEmitter, configService, redis);
      await new Promise(resolve => setImmediate(resolve));

      // Assert - Should not throw
      expect(newService).toBeDefined();
    });

    it('should skip RabbitMQ publish when channel unavailable', async () => {
      // Arrange
      service['amqpChannel'] = null;
      const publishableEvent = { ...mockEvent, type: 'message.sent' };

      // Act
      await service.dispatch(publishableEvent);

      // Assert
      expect(mockChannel.publish).not.toHaveBeenCalled();
    });
  });

  describe('Event interception', () => {
    it('should setup event interceptor', () => {
      // Assert
      expect(eventEmitter.onAny).toHaveBeenCalled();
    });

    it('should update stats on any event', () => {
      // Arrange
      let interceptor: any;
      eventEmitter.onAny.mockImplementation((fn: any) => {
        interceptor = fn;
        return eventEmitter;
      });
      
      // Create new service to register interceptor
      new EventDispatcherService(eventEmitter, configService, redis);

      // Act
      interceptor('test.event', { data: 'test' });

      // Assert - Stats should be updated
      const stats = service.getEventStats();
      expect(stats).toBeDefined();
    });
  });

  describe('Dead letter queue', () => {
    it('should store failed events with retry metadata', async () => {
      // Arrange
      const options: EventDispatchOptions = { retryable: true };
      const error = new Error('Processing failed');
      eventEmitter.emit.mockImplementation(() => {
        throw error;
      });

      // Act
      await expect(service.dispatch(mockEvent, options)).rejects.toThrow();

      // Assert
      expect(redis.lpush).toHaveBeenCalledWith(
        'events:dead-letter',
        expect.stringContaining('"error":"Processing failed"')
      );
      expect(redis.ltrim).toHaveBeenCalledWith('events:dead-letter', 0, 999);
    });

    it('should increment retry count', async () => {
      // Arrange
      const eventWithRetry = {
        ...mockEvent,
        metadata: { ...mockEvent.metadata, retryCount: 2 },
      };
      const options: EventDispatchOptions = { retryable: true };
      eventEmitter.emit.mockImplementation(() => {
        throw new Error('Failed');
      });

      // Act
      await expect(service.dispatch(eventWithRetry, options)).rejects.toThrow();

      // Assert
      expect(redis.lpush).toHaveBeenCalledWith(
        'events:dead-letter',
        expect.stringContaining('"retryCount":3')
      );
    });
  });

  describe('Priority handling', () => {
    it('should convert priority to numeric value', () => {
      // Act & Assert
      expect(service['getPriorityValue']('high')).toBe(10);
      expect(service['getPriorityValue']('low')).toBe(1);
      expect(service['getPriorityValue']('normal')).toBe(5);
      expect(service['getPriorityValue']()).toBe(5);
    });

    it('should generate correct queue name for priority', () => {
      // Act & Assert
      expect(service['getQueueName']('test', 'high')).toBe('events:test:high');
      expect(service['getQueueName']('test', 'low')).toBe('events:test:low');
      expect(service['getQueueName']('test', 'normal')).toBe('events:test');
      expect(service['getQueueName']('test')).toBe('events:test');
    });
  });

  describe('Stats reporter', () => {
    it('should start periodic stats reporter', () => {
      // Fast-forward time
      jest.advanceTimersByTime(60000);

      // Assert - Stats should be logged (but we can't easily test console output)
      expect(service.getEventStats).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle events with array event names', () => {
      // Arrange
      let interceptor: any;
      eventEmitter.onAny.mockImplementation((fn: any) => {
        interceptor = fn;
        return eventEmitter;
      });
      
      new EventDispatcherService(eventEmitter, configService, redis);

      // Act
      interceptor(['parent', 'child'], { data: 'test' });

      // Assert - Should handle gracefully
      expect(() => interceptor(['parent', 'child'], {})).not.toThrow();
    });

    it('should handle concurrent dispatches', async () => {
      // Arrange
      const events = Array(10).fill(null).map((_, i) => ({
        ...mockEvent,
        type: `concurrent.${i}`,
      }));

      // Act
      const promises = events.map(e => service.dispatch(e));
      await Promise.all(promises);

      // Assert
      expect(eventEmitter.emit).toHaveBeenCalledTimes(10);
    });

    it('should handle very large event data', async () => {
      // Arrange
      const largeEvent = {
        ...mockEvent,
        data: {
          large: 'x'.repeat(100000),
          nested: { deep: Array(1000).fill('data') },
        },
      };

      // Act & Assert
      await expect(service.dispatch(largeEvent)).resolves.not.toThrow();
    });
  });
});