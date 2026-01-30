import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { RedisService } from '../../../common/redis/redis.service';
import { MessageTransport } from '../../../core/ports/message-transport.port';
import { MESSAGE_TRANSPORT } from '../../queue/queue.module';

describe('AdminAuthService', () => {
  let service: AdminAuthService;
  let redisService: jest.Mocked<RedisService>;
  let jwtService: jest.Mocked<JwtService>;
  let messageTransport: jest.Mocked<MessageTransport>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      scan: jest.fn(),
    };

    const mockJwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
    };

    const mockMessageTransport = {
      publishOutbound: jest.fn(),
      publishInbound: jest.fn(),
      onOutbound: jest.fn(),
      onInbound: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'ADMIN_PHONE_NUMBERS') return '1234567890,9876543210';
        if (key === 'security.jwtSecret') return 'test-secret';
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: MESSAGE_TRANSPORT, useValue: mockMessageTransport },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AdminAuthService>(AdminAuthService);
    redisService = module.get(RedisService);
    jwtService = module.get(JwtService);
    messageTransport = module.get(MESSAGE_TRANSPORT);
    configService = module.get(ConfigService);
  });

  describe('initiateLogin', () => {
    it('should send OTP to authorized admin number', async () => {
      redisService.set.mockResolvedValue(undefined);
      messageTransport.publishOutbound.mockResolvedValue(undefined);

      const result = await service.initiateLogin({ phoneNumber: '+1234567890' });

      expect(result.message).toBe('Verification code sent to your WhatsApp');
      expect(result.sessionId).toBeDefined();
      expect(redisService.set).toHaveBeenCalledTimes(2);
      expect(messageTransport.publishOutbound).toHaveBeenCalledTimes(1);
    });

    it('should reject unauthorized phone number', async () => {
      await expect(service.initiateLogin({ phoneNumber: '+9999999999' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should clean phone number format', async () => {
      redisService.set.mockResolvedValue(undefined);
      messageTransport.publishOutbound.mockResolvedValue(undefined);

      await service.initiateLogin({ phoneNumber: '(123) 456-7890' });

      expect(messageTransport.publishOutbound).toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    it('should create admin session with valid OTP', async () => {
      const sessionId = 'test-session';
      const tempSession = JSON.stringify({ phoneNumber: '1234567890', createdAt: Date.now() });
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256');
      hash.update('123456' + 'test-secret');
      const expectedHash = hash.digest('hex');

      redisService.get.mockResolvedValueOnce(tempSession);
      redisService.get.mockResolvedValueOnce(expectedHash);
      redisService.del.mockResolvedValue(undefined);
      redisService.set.mockResolvedValue(undefined);
      jwtService.sign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');

      const result = await service.verifyOtp({ sessionId, otp: '123456' });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.phoneNumber).toBe('1234567890');
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
    });

    it('should reject invalid session', async () => {
      redisService.get.mockResolvedValue(null);

      await expect(service.verifyOtp({ sessionId: 'invalid', otp: '123456' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject invalid OTP', async () => {
      const sessionId = 'test-session';
      const tempSession = JSON.stringify({ phoneNumber: '1234567890', createdAt: Date.now() });

      redisService.get.mockResolvedValueOnce(tempSession);
      redisService.get.mockResolvedValueOnce(null);

      await expect(service.verifyOtp({ sessionId, otp: '999999' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refreshSession', () => {
    it('should refresh valid admin session', async () => {
      const payload = { phoneNumber: '1234567890', role: 'admin', type: 'admin-dashboard' };

      jwtService.verify.mockReturnValue(payload);
      jwtService.sign
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');
      redisService.scan.mockResolvedValue(['0', []]);
      redisService.set.mockResolvedValue(undefined);

      const result = await service.refreshSession('old-refresh-token');

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });

    it('should reject invalid token type', async () => {
      jwtService.verify.mockReturnValue({ type: 'user', phoneNumber: '1234567890' });

      await expect(service.refreshSession('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should reject revoked admin access', async () => {
      jwtService.verify.mockReturnValue({
        phoneNumber: '9999999999',
        role: 'admin',
        type: 'admin-dashboard',
      });

      await expect(service.refreshSession('token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateToken', () => {
    it('should validate admin token', async () => {
      const payload = { phoneNumber: '1234567890', role: 'admin', type: 'admin-dashboard' };
      jwtService.verify.mockReturnValue(payload);

      const result = await service.validateToken('valid-token');

      expect(result).toEqual(payload);
    });

    it('should reject non-admin token', async () => {
      jwtService.verify.mockReturnValue({ type: 'user' });

      const result = await service.validateToken('user-token');

      expect(result).toBeNull();
    });

    it('should reject expired token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('Token expired');
      });

      const result = await service.validateToken('expired-token');

      expect(result).toBeNull();
    });
  });

  describe('logout', () => {
    it('should delete admin session', async () => {
      redisService.del.mockResolvedValue(undefined);

      await service.logout('session-id');

      expect(redisService.del).toHaveBeenCalledWith('admin:session:session-id');
    });
  });
});
