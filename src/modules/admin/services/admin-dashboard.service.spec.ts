import { Test, TestingModule } from '@nestjs/testing';
import { AdminDashboardService } from './admin-dashboard.service';
import { RedisService } from '../../../common/redis/redis.service';
import { MessageTransport } from '../../../core/ports/message-transport.port';
import { MESSAGE_TRANSPORT } from '../../queue/queue.module';
import { Platform } from '../../../core/types';

describe('AdminDashboardService', () => {
  let service: AdminDashboardService;
  let redisService: jest.Mocked<RedisService>;
  let messageTransport: jest.Mocked<MessageTransport>;

  beforeEach(async () => {
    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      scan: jest.fn(),
    };

    const mockMessageTransport = {
      publishOutbound: jest.fn(),
      publishInbound: jest.fn(),
      onOutbound: jest.fn(),
      onInbound: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDashboardService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: MESSAGE_TRANSPORT, useValue: mockMessageTransport },
      ],
    }).compile();

    service = module.get<AdminDashboardService>(AdminDashboardService);
    redisService = module.get(RedisService);
    messageTransport = module.get(MESSAGE_TRANSPORT);
  });

  describe('getSystemStatus', () => {
    it('should return system status', async () => {
      redisService.scan.mockResolvedValue(['0', ['session:1', 'session:2']]);
      redisService.get
        .mockResolvedValueOnce(
          JSON.stringify({ sessionId: '1', isVerified: true, phoneNumber: '123' }),
        )
        .mockResolvedValueOnce(
          JSON.stringify({ sessionId: '2', isVerified: false, phoneNumber: '456' }),
        );

      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await service.getSystemStatus();

      expect(result.connectedUsers).toBe(2);
      expect(result.activeSessions).toBe(1);
      expect(result.redisConnected).toBe(true);
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getUserInfo', () => {
    it('should return user info', async () => {
      const sessionData = {
        sessionId: 'test-session',
        phoneNumber: '1234567890',
        flashUserId: 'user-123',
        isVerified: true,
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };

      redisService.get.mockResolvedValue(JSON.stringify(sessionData));

      const result = await service.getUserInfo('test-session');

      expect(result).toBeDefined();
      expect(result?.sessionId).toBe('test-session');
      expect(result?.phoneNumber).toBe('1234567890');
      expect(result?.isVerified).toBe(true);
    });

    it('should return null for non-existent user', async () => {
      redisService.get.mockResolvedValue(null);

      const result = await service.getUserInfo('invalid-session');

      expect(result).toBeNull();
    });
  });

  describe('getMessageStats', () => {
    it('should return message statistics', async () => {
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      redisService.scan.mockResolvedValue(['0', ['message:1', 'message:2', 'message:3']]);
      redisService.get
        .mockResolvedValueOnce(JSON.stringify({ timestamp: now, intent: 'balance' }))
        .mockResolvedValueOnce(JSON.stringify({ timestamp: oneDayAgo - 1000, intent: 'send' }))
        .mockResolvedValueOnce(JSON.stringify({ timestamp: now, intent: 'balance' }));

      const result = await service.getMessageStats();

      expect(result.totalMessages).toBe(3);
      expect(result.last24Hours).toBe(2);
      expect(result.messagesByIntent.balance).toBe(2);
      expect(result.messagesByIntent.send).toBe(1);
    });

    it('should handle empty message stats', async () => {
      redisService.scan.mockResolvedValue(['0', []]);

      const result = await service.getMessageStats();

      expect(result.totalMessages).toBe(0);
      expect(result.last24Hours).toBe(0);
      expect(Object.keys(result.messagesByIntent)).toHaveLength(0);
    });
  });

  describe('broadcastMessage', () => {
    it('should broadcast to all verified users', async () => {
      redisService.scan.mockResolvedValue(['0', ['session:1', 'session:2']]);
      redisService.get
        .mockResolvedValueOnce(JSON.stringify({ phoneNumber: '1234567890', isVerified: true }))
        .mockResolvedValueOnce(JSON.stringify({ phoneNumber: '9876543210', isVerified: true }));
      messageTransport.publishOutbound.mockResolvedValue(undefined);

      const result = await service.broadcastMessage({
        message: 'Test broadcast',
      });

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
      expect(messageTransport.publishOutbound).toHaveBeenCalledTimes(2);
    });

    it('should broadcast to specific users', async () => {
      redisService.scan.mockResolvedValue(['0', ['session:1', 'session:2']]);
      redisService.get
        .mockResolvedValueOnce(JSON.stringify({ phoneNumber: '1234567890', isVerified: true }))
        .mockResolvedValueOnce(JSON.stringify({ phoneNumber: '9876543210', isVerified: true }));
      messageTransport.publishOutbound.mockResolvedValue(undefined);

      const result = await service.broadcastMessage({
        message: 'Test broadcast',
        targetUsers: ['1234567890'],
      });

      expect(result.sent).toBe(1);
      expect(messageTransport.publishOutbound).toHaveBeenCalledTimes(1);
    });

    it('should handle broadcast failures', async () => {
      redisService.scan.mockResolvedValue(['0', ['session:1']]);
      redisService.get.mockResolvedValue(
        JSON.stringify({ phoneNumber: '1234567890', isVerified: true }),
      );
      messageTransport.publishOutbound.mockRejectedValue(new Error('Send failed'));

      const result = await service.broadcastMessage({
        message: 'Test broadcast',
      });

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('should use specified platform', async () => {
      redisService.scan.mockResolvedValue(['0', ['session:1']]);
      redisService.get.mockResolvedValue(
        JSON.stringify({ phoneNumber: '1234567890', isVerified: true }),
      );
      messageTransport.publishOutbound.mockResolvedValue(undefined);

      await service.broadcastMessage({
        message: 'Test',
        platform: Platform.Telegram,
      });

      const call = messageTransport.publishOutbound.mock.calls[0][0];
      expect(call.to.platform).toBe(Platform.Telegram);
    });
  });
});
