import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SubscriptionService } from './subscription.service';
import * as graphqlWs from 'graphql-ws';

// Mock graphql-ws
jest.mock('graphql-ws', () => ({
  createClient: jest.fn()
}));

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let configService: jest.Mocked<ConfigService>;
  let mockClient: any;
  let mockUnsubscribe: jest.Mock;

  const authToken = 'auth-token-123';

  beforeEach(async () => {
    // Reset mocks
    mockUnsubscribe = jest.fn();
    mockClient = {
      subscribe: jest.fn().mockReturnValue(mockUnsubscribe),
      dispose: jest.fn().mockResolvedValue(undefined),
      on: {}
    };

    (graphqlWs.createClient as jest.Mock).mockReturnValue(mockClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn()
          }
        }
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Constructor', () => {
    it('should set production WebSocket URL', () => {
      // Arrange
      configService.get.mockReturnValue('https://api.flashapp.me/graphql');

      // Act
      const newService = new SubscriptionService(configService);

      // Assert
      expect((newService as any).wsUrl).toBe('wss://ws.flashapp.me/graphql');
    });

    it('should set staging WebSocket URL', () => {
      // Arrange
      configService.get.mockReturnValue('https://api.staging.flashapp.me/graphql');

      // Act
      const newService = new SubscriptionService(configService);

      // Assert
      expect((newService as any).wsUrl).toBe('wss://ws.staging.flashapp.me/graphql');
    });

    it('should set local development WebSocket URL', () => {
      // Arrange
      configService.get.mockReturnValue('http://localhost:4000/graphql');

      // Act
      const newService = new SubscriptionService(configService);

      // Assert
      expect((newService as any).wsUrl).toBe('ws://localhost:4002/graphqlws');
    });

    it('should fallback to URL conversion', () => {
      // Arrange
      configService.get.mockReturnValue('https://api.custom.com/graphql');

      // Act
      const newService = new SubscriptionService(configService);

      // Assert
      expect((newService as any).wsUrl).toBe('wss://ws.custom.com/graphql');
    });
  });

  describe('connect', () => {
    it('should create WebSocket client with auth token', async () => {
      // Act
      await service.connect(authToken);

      // Assert
      expect(graphqlWs.createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.any(String),
          connectionParams: expect.any(Function),
          retryAttempts: 3
        })
      );
    });

    it('should handle connection errors', async () => {
      // Arrange
      (graphqlWs.createClient as jest.Mock).mockImplementation(() => {
        throw new Error('Connection failed');
      });

      // Act & Assert
      await expect(service.connect(authToken)).rejects.toThrow('Connection failed');
    });

    it('should configure retry logic', async () => {
      // Act
      await service.connect(authToken);

      // Assert
      const createClientCall = (graphqlWs.createClient as jest.Mock).mock.calls[0][0];
      expect(createClientCall.retryAttempts).toBe(3);
      expect(createClientCall.shouldRetry).toBeDefined();
    });

    it('should not retry for auth errors', async () => {
      // Arrange
      await service.connect(authToken);
      const createClientCall = (graphqlWs.createClient as jest.Mock).mock.calls[0][0];

      // Act & Assert
      expect(createClientCall.shouldRetry({ code: 4401 })).toBe(false);
      expect(createClientCall.shouldRetry({ code: 4403 })).toBe(false);
      expect(createClientCall.shouldRetry({ code: 5000 })).toBe(true);
    });
  });

  describe('subscribeLnUpdates', () => {
    it('should create subscription for Lightning updates', async () => {
      // Arrange
      const userId = 'user123';
      const callback = jest.fn();

      // Act
      const subscriptionId = await service.subscribeLnUpdates(userId, authToken, callback);

      // Assert
      expect(subscriptionId).toBe(`ln-updates-${userId}`);
      expect(mockClient.subscribe).toHaveBeenCalled();
    });

    it('should handle payment updates', async () => {
      // Arrange
      const callback = jest.fn();
      let capturedHandlers: any = {};
      
      mockClient.subscribe.mockImplementation((query: any, handlers: any) => {
        capturedHandlers = handlers;
        return mockUnsubscribe;
      });

      // Act
      await service.subscribeLnUpdates('user123', authToken, callback);

      // Simulate receiving an update
      capturedHandlers.next({
        data: {
          myUpdates: {
            update: {
              __typename: 'LnPayment',
              paymentHash: 'hash123',
              status: 'SUCCESS'
            }
          }
        }
      });

      // Assert
      expect(callback).toHaveBeenCalledWith('hash123', 'SUCCESS');
    });

    it('should ignore heartbeat updates', async () => {
      // Arrange
      const callback = jest.fn();
      let capturedHandlers: any = {};
      
      mockClient.subscribe.mockImplementation((query: any, handlers: any) => {
        capturedHandlers = handlers;
        return mockUnsubscribe;
      });

      // Act
      await service.subscribeLnUpdates('user123', authToken, callback);

      // Simulate heartbeat (empty update)
      capturedHandlers.next({
        data: {
          myUpdates: {
            update: {}
          }
        }
      });

      // Assert
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle subscription errors', async () => {
      // Arrange
      const callback = jest.fn();
      let capturedHandlers: any = {};
      
      mockClient.subscribe.mockImplementation((query: any, handlers: any) => {
        capturedHandlers = handlers;
        return mockUnsubscribe;
      });

      // Act
      await service.subscribeLnUpdates('user123', authToken, callback);

      // Simulate error
      capturedHandlers.error(new Error('Subscription error'));

      // Assert - Should log error but not throw
      expect(callback).not.toHaveBeenCalled();
    });

    it('should clean up on completion', async () => {
      // Arrange
      const callback = jest.fn();
      let capturedHandlers: any = {};
      
      mockClient.subscribe.mockImplementation((query: any, handlers: any) => {
        capturedHandlers = handlers;
        return mockUnsubscribe;
      });

      // Act
      const subscriptionId = await service.subscribeLnUpdates('user123', authToken, callback);

      // Simulate completion
      capturedHandlers.complete();

      // Assert
      expect((service as any).subscriptions.has(subscriptionId)).toBe(false);
    });

    it('should connect if not already connected', async () => {
      // Arrange
      const callback = jest.fn();
      jest.spyOn(service, 'connect');

      // Act
      await service.subscribeLnUpdates('user123', authToken, callback);

      // Assert
      expect(service.connect).toHaveBeenCalledWith(authToken);
    });

    it('should reuse existing connection', async () => {
      // Arrange
      const callback = jest.fn();
      await service.connect(authToken);
      jest.spyOn(service, 'connect');

      // Act
      await service.subscribeLnUpdates('user123', authToken, callback);

      // Assert
      expect(service.connect).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe from active subscription', async () => {
      // Arrange
      const callback = jest.fn();
      const subscriptionId = await service.subscribeLnUpdates('user123', authToken, callback);

      // Act
      service.unsubscribe(subscriptionId);

      // Assert
      expect(mockUnsubscribe).toHaveBeenCalled();
      expect((service as any).subscriptions.has(subscriptionId)).toBe(false);
    });

    it('should handle unsubscribe for non-existent subscription', () => {
      // Act & Assert - Should not throw
      expect(() => service.unsubscribe('non-existent')).not.toThrow();
    });

    it('should handle multiple unsubscribe calls', async () => {
      // Arrange
      const callback = jest.fn();
      const subscriptionId = await service.subscribeLnUpdates('user123', authToken, callback);

      // Act
      service.unsubscribe(subscriptionId);
      service.unsubscribe(subscriptionId);

      // Assert
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect', () => {
    it('should unsubscribe all active subscriptions', async () => {
      // Arrange
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const mockUnsubscribe1 = jest.fn();
      const mockUnsubscribe2 = jest.fn();
      
      mockClient.subscribe
        .mockReturnValueOnce(mockUnsubscribe1)
        .mockReturnValueOnce(mockUnsubscribe2);

      await service.subscribeLnUpdates('user1', authToken, callback1);
      await service.subscribeLnUpdates('user2', authToken, callback2);

      // Act
      await service.disconnect();

      // Assert
      expect(mockUnsubscribe1).toHaveBeenCalled();
      expect(mockUnsubscribe2).toHaveBeenCalled();
      expect((service as any).subscriptions.size).toBe(0);
    });

    it('should dispose WebSocket client', async () => {
      // Arrange
      await service.connect(authToken);

      // Act
      await service.disconnect();

      // Assert
      expect(mockClient.dispose).toHaveBeenCalled();
      expect((service as any).client).toBeNull();
    });

    it('should handle disconnect when not connected', async () => {
      // Act & Assert - Should not throw
      await expect(service.disconnect()).resolves.toBeUndefined();
    });

    it('should handle multiple disconnect calls', async () => {
      // Arrange
      await service.connect(authToken);

      // Act
      await service.disconnect();
      await service.disconnect();

      // Assert
      expect(mockClient.dispose).toHaveBeenCalledTimes(1);
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect on module destroy', async () => {
      // Arrange
      jest.spyOn(service, 'disconnect');

      // Act
      await service.onModuleDestroy();

      // Assert
      expect(service.disconnect).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed update data', async () => {
      // Arrange
      const callback = jest.fn();
      let capturedHandlers: any = {};
      
      mockClient.subscribe.mockImplementation((query: any, handlers: any) => {
        capturedHandlers = handlers;
        return mockUnsubscribe;
      });

      // Act
      await service.subscribeLnUpdates('user123', authToken, callback);

      // Simulate malformed data
      capturedHandlers.next({ data: null });
      capturedHandlers.next({ data: { myUpdates: null } });
      capturedHandlers.next({ data: { myUpdates: { update: null } } });

      // Assert
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle partial update data', async () => {
      // Arrange
      const callback = jest.fn();
      let capturedHandlers: any = {};
      
      mockClient.subscribe.mockImplementation((query: any, handlers: any) => {
        capturedHandlers = handlers;
        return mockUnsubscribe;
      });

      // Act
      await service.subscribeLnUpdates('user123', authToken, callback);

      // Simulate partial data
      capturedHandlers.next({
        data: {
          myUpdates: {
            update: {
              paymentHash: 'hash123'
              // Missing status
            }
          }
        }
      });

      // Assert
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle concurrent subscriptions', async () => {
      // Arrange
      const callbacks = [jest.fn(), jest.fn(), jest.fn()];

      // Act
      const subscriptionIds = await Promise.all([
        service.subscribeLnUpdates('user1', authToken, callbacks[0]),
        service.subscribeLnUpdates('user2', authToken, callbacks[1]),
        service.subscribeLnUpdates('user3', authToken, callbacks[2])
      ]);

      // Assert
      expect(subscriptionIds).toHaveLength(3);
      expect(new Set(subscriptionIds).size).toBe(3); // All unique
      expect(mockClient.subscribe).toHaveBeenCalledTimes(3);
    });

    it('should handle WebSocket close events', async () => {
      // Arrange
      await service.connect(authToken);
      const createClientCall = (graphqlWs.createClient as jest.Mock).mock.calls[0][0];

      // Act - Simulate close event
      createClientCall.on.closed({ code: 4401, reason: 'Unauthorized' });

      // Assert - Should log but not throw
      expect(() => createClientCall.on.closed({ code: 1000, reason: 'Normal' })).not.toThrow();
    });
  });
});