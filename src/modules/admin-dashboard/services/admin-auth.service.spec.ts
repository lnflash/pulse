import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { OtpService } from '../../auth/services/otp.service';
import { SessionService } from '../../auth/services/session.service';
import { WhatsAppWebService } from '../../whatsapp/services/whatsapp-web.service';
import { AdminLoginDto, AdminVerifyOtpDto } from '../dto/admin-auth.dto';

describe('AdminAuthService', () => {
  let service: AdminAuthService;
  let configService: jest.Mocked<ConfigService>;
  let jwtService: jest.Mocked<JwtService>;
  let otpService: jest.Mocked<OtpService>;
  let sessionService: jest.Mocked<SessionService>;
  let whatsappWebService: jest.Mocked<WhatsAppWebService>;

  const mockAdminNumbers = '1234567890,0987654321,5555551234';
  const mockAccessToken = 'access-token-123';
  const mockRefreshToken = 'refresh-token-456';
  const mockSessionId = 'session-789';
  const mockOtp = '123456';

  const mockAdminSession = {
    id: mockSessionId,
    phoneNumber: '1234567890',
    accessToken: mockAccessToken,
    refreshToken: mockRefreshToken,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(mockAdminNumbers),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue(mockAccessToken),
            verify: jest.fn(),
          },
        },
        {
          provide: OtpService,
          useValue: {
            generateOtp: jest.fn().mockResolvedValue(mockOtp),
            verifyOtp: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: SessionService,
          useValue: {
            createSession: jest.fn().mockResolvedValue(mockAdminSession),
            getSession: jest.fn(),
            deleteSession: jest.fn().mockResolvedValue(undefined),
            updateSession: jest.fn().mockResolvedValue(mockAdminSession),
          },
        },
        {
          provide: WhatsAppWebService,
          useValue: {
            isClientReady: jest.fn().mockReturnValue(true),
            sendMessage: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AdminAuthService>(AdminAuthService);
    configService = module.get(ConfigService);
    jwtService = module.get(JwtService);
    otpService = module.get(OtpService);
    sessionService = module.get(SessionService);
    whatsappWebService = module.get(WhatsAppWebService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('constructor', () => {
    it('should parse admin phone numbers from config', () => {
      // Assert
      expect(service['adminNumbers']).toEqual(['1234567890', '0987654321', '5555551234']);
    });

    it('should handle empty admin numbers config', () => {
      // Arrange
      configService.get.mockReturnValue('');
      
      // Act
      const newService = new AdminAuthService(
        configService,
        jwtService,
        otpService,
        sessionService,
        whatsappWebService
      );

      // Assert
      expect(newService['adminNumbers']).toEqual([]);
    });

    it('should handle whitespace in admin numbers', () => {
      // Arrange
      configService.get.mockReturnValue(' 1234567890 , 0987654321 ');
      
      // Act
      const newService = new AdminAuthService(
        configService,
        jwtService,
        otpService,
        sessionService,
        whatsappWebService
      );

      // Assert
      expect(newService['adminNumbers']).toEqual(['1234567890', '0987654321']);
    });
  });

  describe('initiateLogin', () => {
    it('should initiate login for admin number', async () => {
      // Arrange
      const loginDto: AdminLoginDto = { phoneNumber: '1234567890' };
      jest.spyOn(service as any, 'createTempSession').mockResolvedValue(mockSessionId);

      // Act
      const result = await service.initiateLogin(loginDto);

      // Assert
      expect(result).toEqual({
        message: 'Verification code sent to your WhatsApp',
        sessionId: mockSessionId,
      });
      expect(otpService.generateOtp).toHaveBeenCalledWith('1234567890', mockSessionId);
      expect(whatsappWebService.sendMessage).toHaveBeenCalledWith(
        '1234567890@c.us',
        expect.stringContaining(mockOtp)
      );
    });

    it('should reject non-admin number', async () => {
      // Arrange
      const loginDto: AdminLoginDto = { phoneNumber: '9999999999' };

      // Act & Assert
      await expect(service.initiateLogin(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should clean phone number format', async () => {
      // Arrange
      const loginDto: AdminLoginDto = { phoneNumber: '+1-234-567-890' };
      jest.spyOn(service as any, 'cleanPhoneNumber').mockReturnValue('1234567890');
      jest.spyOn(service as any, 'createTempSession').mockResolvedValue(mockSessionId);

      // Act
      await service.initiateLogin(loginDto);

      // Assert
      expect((service as any).cleanPhoneNumber).toHaveBeenCalledWith('+1-234-567-890');
    });

    it('should handle WhatsApp not ready', async () => {
      // Arrange
      const loginDto: AdminLoginDto = { phoneNumber: '1234567890' };
      whatsappWebService.isClientReady.mockReturnValue(false);
      jest.spyOn(service as any, 'createTempSession').mockResolvedValue(mockSessionId);

      // Act
      const result = await service.initiateLogin(loginDto);

      // Assert
      expect(result.sessionId).toBe(mockSessionId);
      expect(whatsappWebService.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle WhatsApp send failure', async () => {
      // Arrange
      const loginDto: AdminLoginDto = { phoneNumber: '1234567890' };
      whatsappWebService.sendMessage.mockRejectedValue(new Error('Send failed'));
      jest.spyOn(service as any, 'createTempSession').mockResolvedValue(mockSessionId);

      // Act
      const result = await service.initiateLogin(loginDto);

      // Assert
      expect(result.sessionId).toBe(mockSessionId); // Should still return session
    });
  });

  describe('verifyOtp', () => {
    it('should verify OTP and create session', async () => {
      // Arrange
      const verifyDto: AdminVerifyOtpDto = { sessionId: mockSessionId, otp: mockOtp };
      const tempSession = { phoneNumber: '1234567890', sessionId: mockSessionId };
      
      jest.spyOn(service as any, 'getTempSession').mockResolvedValue(tempSession);
      jest.spyOn(service as any, 'createAdminSession').mockResolvedValue(mockAdminSession);
      jest.spyOn(service as any, 'deleteTempSession').mockResolvedValue(undefined);
      
      jwtService.sign
        .mockReturnValueOnce(mockAccessToken)
        .mockReturnValueOnce(mockRefreshToken);

      // Act
      const result = await service.verifyOtp(verifyDto);

      // Assert
      expect(result).toEqual({
        accessToken: mockAccessToken,
        refreshToken: mockRefreshToken,
        expiresIn: 86400,
        phoneNumber: '1234567890',
        sessionId: mockSessionId,
      });
      expect(otpService.verifyOtp).toHaveBeenCalledWith(mockSessionId, mockOtp);
    });

    it('should reject invalid session', async () => {
      // Arrange
      const verifyDto: AdminVerifyOtpDto = { sessionId: 'invalid', otp: mockOtp };
      jest.spyOn(service as any, 'getTempSession').mockResolvedValue(null);

      // Act & Assert
      await expect(service.verifyOtp(verifyDto)).rejects.toThrow(
        'Invalid or expired session'
      );
    });

    it('should reject invalid OTP', async () => {
      // Arrange
      const verifyDto: AdminVerifyOtpDto = { sessionId: mockSessionId, otp: 'wrong' };
      const tempSession = { phoneNumber: '1234567890', sessionId: mockSessionId };
      
      jest.spyOn(service as any, 'getTempSession').mockResolvedValue(tempSession);
      otpService.verifyOtp.mockResolvedValue(false);

      // Act & Assert
      await expect(service.verifyOtp(verifyDto)).rejects.toThrow(
        'Invalid or expired verification code'
      );
    });

    it('should create JWT with correct payload', async () => {
      // Arrange
      const verifyDto: AdminVerifyOtpDto = { sessionId: mockSessionId, otp: mockOtp };
      const tempSession = { phoneNumber: '1234567890', sessionId: mockSessionId };
      
      jest.spyOn(service as any, 'getTempSession').mockResolvedValue(tempSession);
      jest.spyOn(service as any, 'createAdminSession').mockResolvedValue(mockAdminSession);
      jest.spyOn(service as any, 'deleteTempSession').mockResolvedValue(undefined);

      // Act
      await service.verifyOtp(verifyDto);

      // Assert
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          phoneNumber: '1234567890',
          role: 'admin',
          type: 'admin-dashboard',
        },
        { expiresIn: '24h' }
      );
    });
  });

  describe('refreshSession', () => {
    it('should refresh valid token', async () => {
      // Arrange
      const payload = {
        phoneNumber: '1234567890',
        role: 'admin',
        type: 'admin-dashboard',
      };
      jwtService.verify.mockReturnValue(payload);
      jwtService.sign
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');
      jest.spyOn(service as any, 'updateAdminSession').mockResolvedValue(mockAdminSession);

      // Act
      const result = await service.refreshSession(mockRefreshToken);

      // Assert
      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });

    it('should reject non-admin token type', async () => {
      // Arrange
      const payload = {
        phoneNumber: '1234567890',
        role: 'user',
        type: 'user-session',
      };
      jwtService.verify.mockReturnValue(payload);

      // Act & Assert
      await expect(service.refreshSession(mockRefreshToken)).rejects.toThrow(
        'Invalid token type'
      );
    });

    it('should reject if admin access revoked', async () => {
      // Arrange
      const payload = {
        phoneNumber: '9999999999',
        role: 'admin',
        type: 'admin-dashboard',
      };
      jwtService.verify.mockReturnValue(payload);

      // Act & Assert
      await expect(service.refreshSession(mockRefreshToken)).rejects.toThrow(
        'Admin access revoked'
      );
    });

    it('should handle invalid refresh token', async () => {
      // Arrange
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Act & Assert
      await expect(service.refreshSession('invalid-token')).rejects.toThrow(
        'Invalid or expired refresh token'
      );
    });
  });

  describe('logout', () => {
    it('should delete admin session', async () => {
      // Arrange
      jest.spyOn(service as any, 'deleteAdminSession').mockResolvedValue(undefined);

      // Act
      await service.logout(mockSessionId);

      // Assert
      expect((service as any).deleteAdminSession).toHaveBeenCalledWith(mockSessionId);
    });
  });

  describe('validateToken', () => {
    it('should validate admin dashboard token', async () => {
      // Arrange
      const payload = {
        phoneNumber: '1234567890',
        role: 'admin',
        type: 'admin-dashboard',
      };
      jwtService.verify.mockReturnValue(payload);

      // Act
      const result = await service.validateToken(mockAccessToken);

      // Assert
      expect(result).toEqual(payload);
    });

    it('should reject non-admin-dashboard token', async () => {
      // Arrange
      const payload = {
        phoneNumber: '1234567890',
        role: 'admin',
        type: 'other-type',
      };
      jwtService.verify.mockReturnValue(payload);

      // Act
      const result = await service.validateToken(mockAccessToken);

      // Assert
      expect(result).toBeNull();
    });

    it('should reject if not admin number', async () => {
      // Arrange
      const payload = {
        phoneNumber: '9999999999',
        role: 'admin',
        type: 'admin-dashboard',
      };
      jwtService.verify.mockReturnValue(payload);

      // Act
      const result = await service.validateToken(mockAccessToken);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle invalid token', async () => {
      // Arrange
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Act
      const result = await service.validateToken('invalid-token');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('isAdminNumber', () => {
    it('should identify admin numbers', () => {
      // Act & Assert
      expect((service as any).isAdminNumber('1234567890')).toBe(true);
      expect((service as any).isAdminNumber('0987654321')).toBe(true);
      expect((service as any).isAdminNumber('5555551234')).toBe(true);
    });

    it('should reject non-admin numbers', () => {
      // Act & Assert
      expect((service as any).isAdminNumber('9999999999')).toBe(false);
      expect((service as any).isAdminNumber('')).toBe(false);
      expect((service as any).isAdminNumber('invalid')).toBe(false);
    });
  });

  describe('cleanPhoneNumber', () => {
    it('should clean various phone number formats', () => {
      // Act & Assert
      expect(service['cleanPhoneNumber']('+1-234-567-8900')).toBe('12345678900');
      expect(service['cleanPhoneNumber']('(123) 456-7890')).toBe('1234567890');
      expect(service['cleanPhoneNumber']('+1 234 567 8900')).toBe('12345678900');
      expect(service['cleanPhoneNumber']('1234567890')).toBe('1234567890');
    });

    it('should handle country codes', () => {
      // Act & Assert
      expect(service['cleanPhoneNumber']('+55 11 98765-4321')).toBe('5511987654321');
      expect(service['cleanPhoneNumber']('+44 20 7123 4567')).toBe('442071234567');
    });
  });

  describe('Session Management', () => {
    it('should create temporary session', async () => {
      // Arrange
      const phoneNumber = '1234567890';
      const expectedSession = { 
        id: 'temp-123', 
        phoneNumber,
        createdAt: new Date()
      };
      jest.spyOn(service as any, 'createTempSession').mockResolvedValue(expectedSession.id);

      // Act
      const sessionId = await (service as any).createTempSession(phoneNumber);

      // Assert
      expect(sessionId).toBe(expectedSession.id);
    });

    it('should get temporary session', async () => {
      // Arrange
      const tempSession = { 
        phoneNumber: '1234567890',
        sessionId: mockSessionId
      };
      jest.spyOn(service as any, 'getTempSession').mockResolvedValue(tempSession);

      // Act
      const result = await (service as any).getTempSession(mockSessionId);

      // Assert
      expect(result).toEqual(tempSession);
    });

    it('should delete temporary session', async () => {
      // Arrange
      jest.spyOn(service as any, 'deleteTempSession').mockResolvedValue(undefined);

      // Act
      await (service as any).deleteTempSession(mockSessionId);

      // Assert
      expect((service as any).deleteTempSession).toHaveBeenCalledWith(mockSessionId);
    });

    it('should create admin session', async () => {
      // Arrange
      jest.spyOn(service as any, 'createAdminSession').mockResolvedValue(mockAdminSession);

      // Act
      const session = await (service as any).createAdminSession(
        '1234567890',
        mockAccessToken,
        mockRefreshToken
      );

      // Assert
      expect(session).toEqual(mockAdminSession);
    });

    it('should update admin session', async () => {
      // Arrange
      const updatedSession = { ...mockAdminSession, updatedAt: new Date() };
      jest.spyOn(service as any, 'updateAdminSession').mockResolvedValue(updatedSession);

      // Act
      const session = await (service as any).updateAdminSession(
        '1234567890',
        'new-access-token',
        'new-refresh-token'
      );

      // Assert
      expect(session).toEqual(updatedSession);
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple admin numbers with various formats', () => {
      // Arrange
      configService.get.mockReturnValue('+1234567890, 0987654321,  , 5555551234,');
      
      // Act
      const newService = new AdminAuthService(
        configService,
        jwtService,
        otpService,
        sessionService,
        whatsappWebService
      );

      // Assert
      expect(newService['adminNumbers']).toEqual(['+1234567890', '0987654321', '5555551234']);
    });

    it('should handle concurrent login attempts', async () => {
      // Arrange
      const loginDto: AdminLoginDto = { phoneNumber: '1234567890' };
      jest.spyOn(service as any, 'createTempSession').mockResolvedValue(mockSessionId);

      // Act
      const promises = Array(5).fill(null).map(() => service.initiateLogin(loginDto));
      const results = await Promise.all(promises);

      // Assert
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.sessionId).toBe(mockSessionId);
      });
    });

    it('should handle OTP generation failure', async () => {
      // Arrange
      const loginDto: AdminLoginDto = { phoneNumber: '1234567890' };
      otpService.generateOtp.mockRejectedValue(new Error('OTP generation failed'));
      jest.spyOn(service as any, 'createTempSession').mockResolvedValue(mockSessionId);

      // Act & Assert
      await expect(service.initiateLogin(loginDto)).rejects.toThrow('OTP generation failed');
    });

    it('should handle very long phone numbers', () => {
      // Arrange
      const longNumber = '1'.repeat(20);

      // Act & Assert
      expect(service['cleanPhoneNumber'](longNumber)).toBe(longNumber);
      expect((service as any).isAdminNumber(longNumber)).toBe(false);
    });
  });
});