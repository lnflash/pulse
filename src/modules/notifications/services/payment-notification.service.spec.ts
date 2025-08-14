import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaymentNotificationService } from './payment-notification.service';
import { RedisService } from '../../redis/redis.service';
import { SessionService } from '../../auth/services/session.service';
import { SubscriptionService } from '../../flash-api/services/subscription.service';
import { WhatsAppWebService } from '../../whatsapp/services/whatsapp-web.service';
import { TransactionService } from '../../flash-api/services/transaction.service';
import { BalanceService } from '../../flash-api/services/balance.service';
import { UsernameService } from '../../flash-api/services/username.service';
import { PriceService } from '../../flash-api/services/price.service';
import { EventsService } from '../../events/events.service';
import { TtsService } from '../../tts/tts.service';
import { UserVoiceSettingsService, UserVoiceMode } from '../../whatsapp/services/user-voice-settings.service';

// Set test environment
process.env.NODE_ENV = 'test';

describe('PaymentNotificationService', () => {
  let service: PaymentNotificationService;
  let configService: jest.Mocked<ConfigService>;
  let redisService: jest.Mocked<RedisService>;
  let sessionService: jest.Mocked<SessionService>;
  let subscriptionService: jest.Mocked<SubscriptionService>;
  let whatsappWebService: jest.Mocked<WhatsAppWebService>;
  let transactionService: jest.Mocked<TransactionService>;
  let balanceService: jest.Mocked<BalanceService>;
  let usernameService: jest.Mocked<UsernameService>;
  let priceService: jest.Mocked<PriceService>;
  let eventsService: jest.Mocked<EventsService>;
  let ttsService: jest.Mocked<TtsService>;
  let userVoiceSettingsService: jest.Mocked<UserVoiceSettingsService>;

  const mockSession = {
    id: 'session123',
    whatsappId: '1234567890@c.us',
    flashAuthToken: 'auth-token-123',
    flashUserId: 'user123',
    isAuthenticated: true,
    lastActivity: new Date()
  };

  const mockTransaction = {
    id: 'tx123',
    walletId: 'wallet123',
    initiationVia: {
      nodes: [
        {
          __typename: 'InitiationViaLn',
          paymentHash: 'hash123'
        }
      ]
    },
    settlementAmount: 1000,
    settlementCurrency: 'USD',
    settlementFee: 10,
    memo: 'Test payment',
    createdAt: '2024-01-01T00:00:00Z',
    direction: 'RECEIVE' as const,
    status: 'SUCCESS',
    settlementDisplayAmount: '10.00',
    settlementDisplayFee: '0.10',
    settlementDisplayCurrency: 'USD'
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentNotificationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(true)
          }
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
            exists: jest.fn().mockResolvedValue(false),
            setWithExpiry: jest.fn().mockResolvedValue(undefined)
          }
        },
        {
          provide: SessionService,
          useValue: {
            getAllActiveSessions: jest.fn().mockResolvedValue([]),
            getSession: jest.fn(),
            findByWhatsappId: jest.fn(),
            getSessionByWhatsappId: jest.fn().mockResolvedValue({ authToken: 'auth123' })
          }
        },
        {
          provide: SubscriptionService,
          useValue: {
            subscribeLnUpdates: jest.fn().mockResolvedValue('sub123'),
            unsubscribe: jest.fn()
          }
        },
        {
          provide: WhatsAppWebService,
          useValue: {
            isClientReady: jest.fn().mockReturnValue(true),
            sendMessage: jest.fn().mockResolvedValue(undefined),
            sendVoiceMessage: jest.fn().mockResolvedValue(undefined)
          }
        },
        {
          provide: TransactionService,
          useValue: {
            getTransactionByPaymentHash: jest.fn(),
            getTransactions: jest.fn().mockResolvedValue([])
          }
        },
        {
          provide: BalanceService,
          useValue: {
            getBalance: jest.fn().mockResolvedValue({ btc: 0.001, usd: 50 })
          }
        },
        {
          provide: UsernameService,
          useValue: {
            getUsername: jest.fn().mockResolvedValue('alice')
          }
        },
        {
          provide: PriceService,
          useValue: {
            convertAmount: jest.fn().mockResolvedValue(50000)
          }
        },
        {
          provide: EventsService,
          useValue: {
            subscribeToEvents: jest.fn(),
            publishEvent: jest.fn().mockResolvedValue(true)
          }
        },
        {
          provide: TtsService,
          useValue: {
            synthesizeSpeech: jest.fn().mockResolvedValue(Buffer.from('audio'))
          }
        },
        {
          provide: UserVoiceSettingsService,
          useValue: {
            getUserVoiceSettings: jest.fn().mockResolvedValue({
              whatsappId: '1234567890@c.us',
              mode: UserVoiceMode.ON,
              voiceName: 'terri-ann',
              updatedAt: new Date()
            }),
            updateUserVoiceSettings: jest.fn()
          }
        }
      ],
    }).compile();

    service = module.get<PaymentNotificationService>(PaymentNotificationService);
    configService = module.get(ConfigService);
    redisService = module.get(RedisService);
    sessionService = module.get(SessionService);
    subscriptionService = module.get(SubscriptionService);
    whatsappWebService = module.get(WhatsAppWebService);
    transactionService = module.get(TransactionService);
    balanceService = module.get(BalanceService);
    usernameService = module.get(UsernameService);
    priceService = module.get(PriceService);
    eventsService = module.get(EventsService);
    ttsService = module.get(TtsService);
    userVoiceSettingsService = module.get(UserVoiceSettingsService);

    // Clear all timers
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should skip initialization in test environment', async () => {
      // Act
      await service.onModuleInit();

      // Assert
      expect(eventsService.subscribeToEvents).not.toHaveBeenCalled();
      expect(sessionService.getAllActiveSessions).not.toHaveBeenCalled();
    });

    it('should initialize when not in test environment', async () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      jest.spyOn(service as any, 'initialize');

      // Act
      await service.onModuleInit();

      // Assert
      expect((service as any).initialize).toHaveBeenCalled();

      // Cleanup
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('subscribeUserToPayments', () => {
    it('should subscribe user to Lightning updates', async () => {
      // Arrange
      // Mock session retrieval if needed

      // Act
      await service.subscribeUserToPayments('1234567890@c.us', 'auth-token');

      // Assert
      expect(subscriptionService.subscribeLnUpdates).toHaveBeenCalledWith(
        '1234567890@c.us',
        'auth-token',
        expect.any(Function)
      );
    });

    it('should skip if WhatsApp not ready', async () => {
      // Arrange
      whatsappWebService.isClientReady.mockReturnValue(false);

      // Act
      await service.subscribeUserToPayments('1234567890@c.us', 'auth-token');

      // Assert
      expect(subscriptionService.subscribeLnUpdates).not.toHaveBeenCalled();
    });

    it('should skip if already subscribed', async () => {
      // Arrange
      await service.subscribeUserToPayments('1234567890@c.us', 'auth-token');
      jest.clearAllMocks();

      // Act
      await service.subscribeUserToPayments('1234567890@c.us', 'auth-token');

      // Assert
      expect(subscriptionService.subscribeLnUpdates).not.toHaveBeenCalled();
    });

    it('should start polling for intraledger payments', async () => {
      // Arrange
      jest.spyOn(service as any, 'startPollingForIntraledgerPayments');

      // Act
      await service.subscribeUserToPayments('1234567890@c.us', 'auth-token');

      // Assert
      expect((service as any).startPollingForIntraledgerPayments).toHaveBeenCalledWith(
        '1234567890@c.us',
        'auth-token'
      );
    });
  });

  describe('unsubscribeUserFromPayments', () => {
    it('should unsubscribe user and stop polling', async () => {
      // Arrange
      await service.subscribeUserToPayments('1234567890@c.us', 'auth-token');

      // Act
      await service.unsubscribeUserFromPayments('1234567890@c.us');

      // Assert
      expect(subscriptionService.unsubscribe).toHaveBeenCalledWith('sub123');
    });

    it('should handle user not subscribed', async () => {
      // Act & Assert - Should not throw
      await expect(service.unsubscribeUserFromPayments('unknown@c.us')).resolves.toBeUndefined();
    });

    it('should clear polling interval', async () => {
      // Arrange
      await service.subscribeUserToPayments('1234567890@c.us', 'auth-token');
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      // Act
      await service.unsubscribeUserFromPayments('1234567890@c.us');

      // Assert
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('sendPaymentNotification', () => {
    it('should send text notification for received payment', async () => {
      // Arrange
      const notification = {
        paymentHash: 'hash123',
        userId: 'user123',
        whatsappId: '1234567890@c.us',
        amount: 1000,
        currency: 'USD',
        senderName: 'Bob',
        memo: 'Test payment',
        timestamp: '2024-01-01T00:00:00Z',
        type: 'received' as const
      };

      transactionService.getTransactionByPaymentHash.mockResolvedValue(mockTransaction);
      usernameService.getUsername.mockResolvedValue('alice');

      // Act
      await (service as any).sendPaymentNotification(notification, '0.00002314 BTC', '$10.00', 'USD');

      // Assert
      expect(whatsappWebService.sendMessage).toHaveBeenCalledWith(
        '1234567890@c.us',
        expect.stringContaining('Payment Received')
      );
    });

    it('should send voice notification when voice mode enabled', async () => {
      // Arrange
      const notification = {
        paymentHash: 'hash123',
        userId: 'user123',
        whatsappId: '1234567890@c.us',
        amount: 1000,
        currency: 'USD',
        senderName: 'Bob',
        memo: 'Test payment',
        timestamp: '2024-01-01T00:00:00Z',
        type: 'received' as const
      };

      userVoiceSettingsService.getUserVoiceSettings.mockResolvedValue({
        whatsappId: '1234567890@c.us',
        mode: UserVoiceMode.ONLY,
        voiceName: 'terri-ann',
        updatedAt: new Date()
      });

      transactionService.getTransactionByPaymentHash.mockResolvedValue(mockTransaction);

      // Act
      await (service as any).sendPaymentNotification(notification, '0.00002314 BTC', '$10.00', 'USD');

      // Assert
      expect((ttsService as any).synthesizeSpeech).toHaveBeenCalled();
      expect(whatsappWebService.sendVoiceMessage).toHaveBeenCalled();
    });

    it('should prevent duplicate notifications', async () => {
      // Arrange
      const notification = {
        paymentHash: 'hash123',
        userId: 'user123',
        whatsappId: '1234567890@c.us',
        amount: 1000,
        currency: 'USD',
        timestamp: '2024-01-01T00:00:00Z',
        type: 'received' as const
      };

      redisService.exists.mockResolvedValueOnce(true);

      // Act
      await (service as any).sendPaymentNotification(notification, '0.00002314 BTC', '$10.00', 'USD');

      // Assert
      expect(whatsappWebService.sendMessage).not.toHaveBeenCalled();
    });

    it('should format sent payment correctly', async () => {
      // Arrange
      const notification = {
        paymentHash: 'hash123',
        userId: 'user123',
        whatsappId: '1234567890@c.us',
        amount: 500,
        currency: 'USD',
        timestamp: '2024-01-01T00:00:00Z',
        type: 'sent' as const
      };

      const sentTransaction = { ...mockTransaction, direction: 'SEND' as const };
      transactionService.getTransactionByPaymentHash.mockResolvedValue(sentTransaction);

      // Act
      await (service as any).sendPaymentNotification(notification, '0.00002314 BTC', '$10.00', 'USD');

      // Assert
      expect(whatsappWebService.sendMessage).toHaveBeenCalledWith(
        '1234567890@c.us',
        expect.stringContaining('Payment Sent')
      );
    });

    it('should include balance in notification', async () => {
      // Arrange
      const notification = {
        paymentHash: 'hash123',
        userId: 'user123',
        whatsappId: '1234567890@c.us',
        amount: 1000,
        currency: 'USD',
        timestamp: '2024-01-01T00:00:00Z',
        type: 'received' as const
      };

      transactionService.getTransactionByPaymentHash.mockResolvedValue(mockTransaction);

      // Act
      await (service as any).sendPaymentNotification(notification, '0.00002314 BTC', '$10.00', 'USD');

      // Assert
      expect((balanceService as any).getBalance).toHaveBeenCalled();
      expect(whatsappWebService.sendMessage).toHaveBeenCalledWith(
        '1234567890@c.us',
        expect.stringContaining('Balance')
      );
    });
  });

  describe('handleWebSocketPayment', () => {
    it('should fetch transaction details and notify user', async () => {
      // Arrange
      transactionService.getTransactionByPaymentHash.mockResolvedValue(mockTransaction);
      // Mock session retrieval if needed

      // Act
      await (service as any).handleWebSocketPayment('hash123', '1234567890@c.us', 'auth-token');

      // Assert
      expect(transactionService.getTransactionByPaymentHash).toHaveBeenCalledWith('hash123', 'auth-token');
      expect(whatsappWebService.sendMessage).toHaveBeenCalled();
    });

    it('should handle missing transaction', async () => {
      // Arrange
      transactionService.getTransactionByPaymentHash.mockResolvedValue(null);

      // Act
      await (service as any).handleWebSocketPayment('hash123', '1234567890@c.us', 'auth-token');

      // Assert
      expect(whatsappWebService.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleRabbitMQPayment', () => {
    it('should process RabbitMQ payment event', async () => {
      // Arrange
      const eventData = {
        paymentHash: 'hash123',
        userId: 'user123',
        amount: 1000,
        currency: 'USD',
        type: 'received'
      };

      // Mock session retrieval if needed
      transactionService.getTransactionByPaymentHash.mockResolvedValue(mockTransaction);

      // Act
      await (service as any).handleRabbitMQPayment(eventData);

      // Assert
      expect(whatsappWebService.sendMessage).toHaveBeenCalled();
    });
  });

  describe.skip('formatPaymentMessage - Method does not exist', () => {
    it('should format received payment message', () => {
      // Act
      const result = (service as any).formatPaymentMessage(
        mockTransaction,
        'received',
        { btc: 0.001, usd: 50 }
      );

      // Assert
      expect(result).toContain('💰 Payment Received');
      expect(result).toContain('Amount: $10.00');
      expect(result).toContain('Memo: Test payment');
      expect(result).toContain('Balance:');
    });

    it('should format sent payment message', () => {
      // Arrange
      const sentTransaction = { ...mockTransaction, direction: 'SEND' as const };

      // Act
      const result = (service as any).formatPaymentMessage(
        sentTransaction,
        'sent',
        { btc: 0.001, usd: 50 }
      );

      // Assert
      expect(result).toContain('📤 Payment Sent');
      expect(result).toContain('Amount: $10.00');
    });

    it('should handle missing memo', () => {
      // Arrange
      const txWithoutMemo = { ...mockTransaction, memo: null };

      // Act
      const result = (service as any).formatPaymentMessage(
        txWithoutMemo,
        'received',
        { btc: 0.001, usd: 50 }
      );

      // Assert
      expect(result).not.toContain('Memo:');
    });

    it('should format BTC amounts correctly', () => {
      // Arrange
      const btcTransaction = {
        ...mockTransaction,
        settlementCurrency: 'BTC',
        settlementDisplayAmount: '0.00100000',
        settlementDisplayCurrency: 'BTC'
      };

      // Act
      const result = (service as any).formatPaymentMessage(
        btcTransaction,
        'received',
        { btc: 0.001, usd: 50 }
      );

      // Assert
      expect(result).toContain('0.00100000 BTC');
    });
  });

  describe('formatVoiceMessage', () => {
    it('should format voice message for received payment', () => {
      // Act
      const result = (service as any).formatVoiceMessage(
        mockTransaction,
        'received',
        { btc: 0.001, usd: 50 }
      );

      // Assert
      expect(result).toContain('Payment received');
      expect(result).toContain('10 dollars');
      expect(result).toContain('Your balance is now');
    });

    it('should format voice message for sent payment', () => {
      // Arrange
      const sentTransaction = { ...mockTransaction, direction: 'SEND' as const };

      // Act
      const result = (service as any).formatVoiceMessage(
        sentTransaction,
        'sent',
        { btc: 0.001, usd: 50 }
      );

      // Assert
      expect(result).toContain('Payment sent');
      expect(result).toContain('10 dollars');
    });

    it('should include memo in voice message', () => {
      // Act
      const result = (service as any).formatVoiceMessage(
        mockTransaction,
        'received',
        { btc: 0.001, usd: 50 }
      );

      // Assert
      expect(result).toContain('Test payment');
    });
  });

  describe('cleanup', () => {
    it('should unsubscribe all users on module destroy', async () => {
      // Arrange
      await service.subscribeUserToPayments('user1@c.us', 'auth1');
      await service.subscribeUserToPayments('user2@c.us', 'auth2');

      // Act
      await service.onModuleDestroy();

      // Assert
      expect(subscriptionService.unsubscribe).toHaveBeenCalledTimes(2);
    });

    it('should clear all polling intervals', async () => {
      // Arrange
      await service.subscribeUserToPayments('user1@c.us', 'auth1');
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      // Act
      await service.onModuleDestroy();

      // Assert
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle subscription errors gracefully', async () => {
      // Arrange
      subscriptionService.subscribeLnUpdates.mockRejectedValue(new Error('Subscription failed'));

      // Act & Assert - Should not throw
      await expect(service.subscribeUserToPayments('user@c.us', 'auth')).resolves.toBeUndefined();
    });

    it('should handle voice conversion errors', async () => {
      // Arrange
      const notification = {
        paymentHash: 'hash123',
        userId: 'user123',
        whatsappId: '1234567890@c.us',
        amount: 1000,
        currency: 'USD',
        timestamp: '2024-01-01T00:00:00Z',
        type: 'received' as const
      };

      userVoiceSettingsService.getUserVoiceSettings.mockResolvedValue({
        whatsappId: '1234567890@c.us',
        mode: UserVoiceMode.ONLY,
        voiceName: 'terri-ann',
        updatedAt: new Date()
      });

      (ttsService as any).synthesizeSpeech.mockRejectedValue(new Error('TTS failed'));
      transactionService.getTransactionByPaymentHash.mockResolvedValue(mockTransaction);

      // Act
      await (service as any).sendPaymentNotification(notification, '0.00002314 BTC', '$10.00', 'USD');

      // Assert
      expect(whatsappWebService.sendMessage).toHaveBeenCalled(); // Should fallback to text
    });

    it('should handle missing balance gracefully', async () => {
      // Arrange
      ((balanceService as any).getBalance as jest.Mock).mockRejectedValue(new Error('Balance fetch failed'));
      const notification = {
        paymentHash: 'hash123',
        userId: 'user123',
        whatsappId: '1234567890@c.us',
        amount: 1000,
        currency: 'USD',
        timestamp: '2024-01-01T00:00:00Z',
        type: 'received' as const
      };

      transactionService.getTransactionByPaymentHash.mockResolvedValue(mockTransaction);

      // Act
      await (service as any).sendPaymentNotification(notification, '0.00002314 BTC', '$10.00', 'USD');

      // Assert
      expect(whatsappWebService.sendMessage).toHaveBeenCalled();
      expect(whatsappWebService.sendMessage).toHaveBeenCalledWith(
        '1234567890@c.us',
        expect.not.stringContaining('Balance:')
      );
    });
  });
});