import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { RedisService } from '../../redis/redis.service';
import { WhatsappService } from '../../whatsapp/services/whatsapp.service';
import { EventsService } from '../../events/events.service';
import { SessionService } from '../../auth/services/session.service';
import {
  NotificationDto,
  NotificationType,
  NotificationChannel,
  NotificationPreferencesDto,
  SendNotificationDto,
} from '../dto/notification.dto';

describe('NotificationService', () => {
  let service: NotificationService;
  let configService: jest.Mocked<ConfigService>;
  let redisService: jest.Mocked<RedisService>;
  let whatsappService: jest.Mocked<WhatsappService>;
  let eventsService: jest.Mocked<EventsService>;
  let sessionService: jest.Mocked<SessionService>;

  const mockNotification: NotificationDto = {
    userId: 'user123',
    type: NotificationType.PAYMENT_RECEIVED,
    title: 'Payment Received',
    message: 'You received a payment',
    channels: [NotificationChannel.WHATSAPP],
    paymentData: {
      transactionId: 'tx123',
      amount: 0.001,
      currency: 'BTC',
      timestamp: '2024-01-01T00:00:00Z',
      memo: 'Test payment',
      senderName: 'Alice',
      receiverName: 'Bob'
    }
  };

  const mockSession = {
    id: 'session123',
    userId: 'user123',
    whatsappId: '1234567890@c.us',
    authToken: 'token123',
    isAuthenticated: true,
    lastActivity: new Date()
  };

  const mockPreferences: NotificationPreferencesDto = {
    userId: 'user123',
    paymentReceived: true,
    paymentSent: true,
    accountActivity: true,
    securityAlert: true,
    systemAnnouncement: true,
    preferredChannels: [NotificationChannel.WHATSAPP]
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn()
          }
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn()
          }
        },
        {
          provide: WhatsappService,
          useValue: {
            sendMessage: jest.fn()
          }
        },
        {
          provide: EventsService,
          useValue: {
            emit: jest.fn(),
            sendMessage: jest.fn()
          }
        },
        {
          provide: SessionService,
          useValue: {
            getSession: jest.fn(),
            findByUserId: jest.fn()
          }
        }
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    configService = module.get(ConfigService);
    redisService = module.get(RedisService);
    whatsappService = module.get(WhatsappService);
    eventsService = module.get(EventsService);
    sessionService = module.get(SessionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendNotification', () => {
    it('should send notification successfully', async () => {
      // Arrange
      jest.spyOn(service as any, 'getUserPreferences').mockResolvedValue(mockPreferences);
      jest.spyOn(service as any, 'findSessionByUserId').mockResolvedValue(mockSession);
      jest.spyOn(service as any, 'sendWhatsAppNotification').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'recordNotificationEvent').mockResolvedValue(undefined);

      const sendDto: SendNotificationDto = {
        notification: mockNotification,
        skipPreferences: false
      };

      // Act
      const result = await service.sendNotification(sendDto);

      // Assert
      expect(result).toBe(true);
      expect((service as any).sendWhatsAppNotification).toHaveBeenCalledWith(
        mockSession.whatsappId,
        mockNotification
      );
    });

    it('should skip preferences check when specified', async () => {
      // Arrange
      jest.spyOn(service as any, 'getUserPreferences');
      jest.spyOn(service as any, 'findSessionByUserId').mockResolvedValue(mockSession);
      jest.spyOn(service as any, 'sendWhatsAppNotification').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'recordNotificationEvent').mockResolvedValue(undefined);

      const sendDto: SendNotificationDto = {
        notification: mockNotification,
        skipPreferences: true
      };

      // Act
      const result = await service.sendNotification(sendDto);

      // Assert
      expect(result).toBe(true);
      expect((service as any).getUserPreferences).not.toHaveBeenCalled();
    });

    it('should not send notification when disabled in preferences', async () => {
      // Arrange
      const disabledPreferences = {
        ...mockPreferences,
        paymentReceived: false
      };
      jest.spyOn(service as any, 'getUserPreferences').mockResolvedValue(disabledPreferences);
      jest.spyOn(service as any, 'isNotificationEnabled').mockReturnValue(false);
      jest.spyOn(service as any, 'sendWhatsAppNotification').mockResolvedValue(undefined);

      const sendDto: SendNotificationDto = {
        notification: mockNotification,
        skipPreferences: false
      };

      // Act
      const result = await service.sendNotification(sendDto);

      // Assert
      expect(result).toBe(false);
      expect((service as any).sendWhatsAppNotification).not.toHaveBeenCalled();
    });

    it('should handle missing session', async () => {
      // Arrange
      jest.spyOn(service as any, 'getUserPreferences').mockResolvedValue(mockPreferences);
      jest.spyOn(service as any, 'findSessionByUserId').mockResolvedValue(null);
      jest.spyOn(service as any, 'recordNotificationEvent').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'sendWhatsAppNotification').mockResolvedValue(undefined);

      const sendDto: SendNotificationDto = {
        notification: mockNotification,
        skipPreferences: false
      };

      // Act
      const result = await service.sendNotification(sendDto);

      // Assert
      expect(result).toBe(false);
      expect((service as any).sendWhatsAppNotification).not.toHaveBeenCalled();
    });

    it('should handle WhatsApp sending error', async () => {
      // Arrange
      jest.spyOn(service as any, 'getUserPreferences').mockResolvedValue(mockPreferences);
      jest.spyOn(service as any, 'findSessionByUserId').mockResolvedValue(mockSession);
      jest.spyOn(service as any, 'sendWhatsAppNotification').mockRejectedValue(new Error('Send failed'));
      jest.spyOn(service as any, 'recordNotificationEvent').mockResolvedValue(undefined);

      const sendDto: SendNotificationDto = {
        notification: mockNotification,
        skipPreferences: false
      };

      // Act
      const result = await service.sendNotification(sendDto);

      // Assert
      expect(result).toBe(false);
    });

    it('should use default channel when not specified', async () => {
      // Arrange
      const notificationWithoutChannel = {
        ...mockNotification,
        channels: undefined
      };
      jest.spyOn(service as any, 'getUserPreferences').mockResolvedValue(mockPreferences);
      jest.spyOn(service as any, 'findSessionByUserId').mockResolvedValue(mockSession);
      jest.spyOn(service as any, 'sendWhatsAppNotification').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'recordNotificationEvent').mockResolvedValue(undefined);

      const sendDto: SendNotificationDto = {
        notification: notificationWithoutChannel,
        skipPreferences: false
      };

      // Act
      const result = await service.sendNotification(sendDto);

      // Assert
      expect(result).toBe(true);
      expect((service as any).sendWhatsAppNotification).toHaveBeenCalled();
    });
  });

  describe('formatNotificationMessage', () => {
    it('should format payment received notification', () => {
      // Act
      const result = (service as any).formatNotificationMessage(mockNotification);

      // Assert
      expect(result).toContain('Payment Received');
      expect(result).toContain('0.00100000 BTC');
      expect(result).toContain('Alice');
      expect(result).toContain('Test payment');
    });

    it('should format payment sent notification', () => {
      // Arrange
      const sentNotification = {
        ...mockNotification,
        type: NotificationType.PAYMENT_SENT,
        title: 'Payment Sent'
      };

      // Act
      const result = (service as any).formatNotificationMessage(sentNotification);

      // Assert
      expect(result).toContain('Payment Sent');
      expect(result).toContain('Bob');
    });

    it('should format generic notification', () => {
      // Arrange
      const genericNotification = {
        userId: 'user123',
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        title: 'System Update',
        message: 'The system has been updated'
      };

      // Act
      const result = (service as any).formatNotificationMessage(genericNotification);

      // Assert
      expect(result).toBe('*System Update*\n\nThe system has been updated');
    });

    it('should handle notification without title', () => {
      // Arrange
      const notificationWithoutTitle = {
        userId: 'user123',
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        message: 'Simple message'
      };

      // Act
      const result = (service as any).formatNotificationMessage(notificationWithoutTitle);

      // Assert
      expect(result).toBe('Simple message');
    });
  });

  describe('formatPaymentNotification', () => {
    it('should format payment with all data', () => {
      // Act
      const result = (service as any).formatPaymentNotification(mockNotification, 'received');

      // Assert
      expect(result).toContain('🔵');
      expect(result).toContain('Payment Received');
      expect(result).toContain('Amount: 0.00100000 BTC');
      expect(result).toContain('From: Alice');
      expect(result).toContain('Memo: Test payment');
    });

    it('should handle missing payment data', () => {
      // Arrange
      const notificationWithoutData = {
        ...mockNotification,
        paymentData: undefined
      };

      // Act
      const result = (service as any).formatPaymentNotification(notificationWithoutData, 'received');

      // Assert
      expect(result).toBe('*Payment Received*\n\nYou received a payment');
    });

    it('should format sent payment correctly', () => {
      // Act
      const result = (service as any).formatPaymentNotification(mockNotification, 'sent');

      // Assert
      expect(result).toContain('🟠');
      expect(result).toContain('To: Bob');
    });

    it('should handle payment without memo', () => {
      // Arrange
      const paymentWithoutMemo = {
        ...mockNotification,
        paymentData: {
          ...mockNotification.paymentData,
          memo: undefined
        }
      };

      // Act
      const result = (service as any).formatPaymentNotification(paymentWithoutMemo, 'received');

      // Assert
      expect(result).not.toContain('Memo:');
    });

    it('should handle payment without sender/receiver names', () => {
      // Arrange
      const paymentWithoutNames = {
        ...mockNotification,
        paymentData: {
          ...mockNotification.paymentData,
          senderName: undefined,
          receiverName: undefined
        }
      };

      // Act
      const result = (service as any).formatPaymentNotification(paymentWithoutNames, 'received');

      // Assert
      expect(result).not.toContain('From:');
      expect(result).not.toContain('To:');
    });
  });

  describe('formatAmount', () => {
    it('should format BTC amount', () => {
      // Act
      const result = (service as any).formatAmount(0.12345678, 'BTC');

      // Assert
      expect(result).toBe('0.12345678 BTC');
    });

    it('should format USD amount', () => {
      // Act
      const result = (service as any).formatAmount(1234.56, 'USD');

      // Assert
      expect(result).toBe('USD 1,234.56');
    });

    it('should format EUR amount', () => {
      // Act
      const result = (service as any).formatAmount(999.99, 'EUR');

      // Assert
      expect(result).toBe('EUR 999.99');
    });

    it('should use BTC as default currency', () => {
      // Act
      const result = (service as any).formatAmount(1.5);

      // Assert
      expect(result).toBe('1.50000000 BTC');
    });

    it('should handle zero amounts', () => {
      // Act
      const btcResult = (service as any).formatAmount(0, 'BTC');
      const usdResult = (service as any).formatAmount(0, 'USD');

      // Assert
      expect(btcResult).toBe('0.00000000 BTC');
      expect(usdResult).toBe('USD 0.00');
    });

    it('should handle very large amounts', () => {
      // Act
      const result = (service as any).formatAmount(1000000000, 'USD');

      // Assert
      expect(result).toContain('1,000,000,000');
    });

    it('should handle very small BTC amounts', () => {
      // Act
      const result = (service as any).formatAmount(0.00000001, 'BTC');

      // Assert
      expect(result).toBe('0.00000001 BTC');
    });
  });

  describe('sendWhatsAppNotification', () => {
    it('should send WhatsApp message successfully', async () => {
      // Arrange
      whatsappService.sendMessage.mockResolvedValue(undefined);
      jest.spyOn(service as any, 'formatNotificationMessage').mockReturnValue('Formatted message');

      // Act
      await (service as any).sendWhatsAppNotification('1234567890@c.us', mockNotification);

      // Assert
      expect(whatsappService.sendMessage).toHaveBeenCalledWith('1234567890@c.us', 'Formatted message');
    });

    it('should throw error when WhatsApp send fails', async () => {
      // Arrange
      whatsappService.sendMessage.mockRejectedValue(new Error('WhatsApp error'));

      // Act & Assert
      await expect(
        (service as any).sendWhatsAppNotification('1234567890@c.us', mockNotification)
      ).rejects.toThrow('WhatsApp error');
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed notification data', async () => {
      // Arrange
      const malformedNotification = {
        userId: 'user123',
        type: 'INVALID_TYPE' as any,
        message: 'Test'
      };

      const sendDto: SendNotificationDto = {
        notification: malformedNotification,
        skipPreferences: true
      };

      jest.spyOn(service as any, 'findSessionByUserId').mockResolvedValue(mockSession);
      jest.spyOn(service as any, 'sendWhatsAppNotification').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'recordNotificationEvent').mockResolvedValue(undefined);

      // Act
      const result = await service.sendNotification(sendDto);

      // Assert
      expect(result).toBe(true);
    });

    it('should handle multiple channels', async () => {
      // Arrange
      const multiChannelNotification = {
        ...mockNotification,
        channels: [NotificationChannel.WHATSAPP, NotificationChannel.EMAIL, NotificationChannel.SMS]
      };

      const sendDto: SendNotificationDto = {
        notification: multiChannelNotification,
        skipPreferences: true
      };

      jest.spyOn(service as any, 'findSessionByUserId').mockResolvedValue(mockSession);
      jest.spyOn(service as any, 'sendWhatsAppNotification').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'recordNotificationEvent').mockResolvedValue(undefined);

      // Act
      const result = await service.sendNotification(sendDto);

      // Assert
      expect(result).toBe(true);
      expect((service as any).sendWhatsAppNotification).toHaveBeenCalledTimes(1);
    });

    it('should handle empty channels array', async () => {
      // Arrange
      const emptyChannelsNotification = {
        ...mockNotification,
        channels: []
      };

      const sendDto: SendNotificationDto = {
        notification: emptyChannelsNotification,
        skipPreferences: true
      };

      jest.spyOn(service as any, 'findSessionByUserId').mockResolvedValue(mockSession);
      jest.spyOn(service as any, 'recordNotificationEvent').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'sendWhatsAppNotification').mockResolvedValue(undefined);

      // Act
      const result = await service.sendNotification(sendDto);

      // Assert
      expect(result).toBe(false);
      expect((service as any).sendWhatsAppNotification).not.toHaveBeenCalled();
    });

    it('should handle notification with future timestamp', () => {
      // Arrange
      const futureNotification = {
        ...mockNotification,
        paymentData: {
          ...mockNotification.paymentData!,
          timestamp: '2025-01-01T00:00:00Z'
        }
      };
      jest.spyOn(service as any, 'formatPaymentNotification').mockReturnValue('Payment on 2025-01-01');

      // Act
      const result = (service as any).formatNotificationMessage(futureNotification);

      // Assert
      expect((service as any).formatPaymentNotification).toHaveBeenCalled();
      expect(result).toContain('2025');
    });

    it('should handle negative amounts gracefully', () => {
      // Act
      const result = (service as any).formatAmount(-100, 'USD');

      // Assert
      expect(result).toBe('USD -100.00');
    });
  });
});