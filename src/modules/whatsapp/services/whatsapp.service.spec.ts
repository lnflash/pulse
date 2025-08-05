import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappService } from './whatsapp.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { AuthService } from '../../auth/services/auth.service';
import { SessionService } from '../../auth/services/session.service';
import { GroupAuthService } from '../../auth/services/group-auth.service';
import { FlashApiService } from '../../flash-api/flash-api.service';
import { BalanceService } from '../../flash-api/services/balance.service';
import { UsernameService } from '../../flash-api/services/username.service';
import { PriceService } from '../../flash-api/services/price.service';
import { InvoiceService } from '../../flash-api/services/invoice.service';
import { TransactionService } from '../../flash-api/services/transaction.service';
import { PaymentService } from '../../flash-api/services/payment.service';
import { PendingPaymentService } from '../../flash-api/services/pending-payment.service';
import { GeminiAiService } from '../../gemini-ai/gemini-ai.service';
import { QrCodeService } from './qr-code.service';
import { CommandParserService, CommandType } from './command-parser.service';
import { BalanceTemplate } from '../templates/balance-template';
import { WhatsAppWebService } from './whatsapp-web.service';
import { InvoiceTrackerService } from './invoice-tracker.service';
import { EventsService } from '../../events/events.service';
import { AdminSettingsService } from './admin-settings.service';
import { SupportModeService } from './support-mode.service';
import { TtsService } from '../../tts/tts.service';
import { PaymentConfirmationService } from './payment-confirmation.service';
import { UserVoiceSettingsService } from './user-voice-settings.service';
import { VoiceResponseService } from './voice-response.service';
import { VoiceManagementService } from './voice-management.service';
import { OnboardingService } from './onboarding.service';
import { ContextualHelpService } from './contextual-help.service';
import { UndoTransactionService } from './undo-transaction.service';
import { PaymentTemplatesService } from './payment-templates.service';
import { AdminAnalyticsService } from './admin-analytics.service';
import { UserKnowledgeBaseService } from './user-knowledge-base.service';
import { RandomQuestionService } from './random-question.service';
import { PluginLoaderService } from '../../plugins/services/plugin-loader.service';
import { PaymentSendResult, WalletCurrency } from '../../flash-api/services/payment.service';
import { RequestDeduplicator } from '../../common/services/request-deduplicator.service';

describe('WhatsappService', () => {
  let service: WhatsappService;
  let _configService: ConfigService;
  let _redisService: RedisService;
  let commandParserService: CommandParserService;
  let sessionService: SessionService;
  let _geminiAiService: GeminiAiService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        WhatsappService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string) => {
              // Return mock values for configuration
              return undefined; // This prevents Twilio client initialization
            }),
          },
        },
        {
          provide: RedisService,
          useValue: {
            set: jest.fn(),
            get: jest.fn(),
            del: jest.fn(),
            setNX: jest.fn(),
            exists: jest.fn(),
            setEncrypted: jest.fn(),
            getEncrypted: jest.fn(),
            hashKey: jest.fn((prefix, id) => `${prefix}:hashed_${id}`),
          },
        },
        {
          provide: AuthService,
          useValue: {
            initiateAccountLinking: jest.fn(),
            verifyAccountLinking: jest.fn(),
            unlinkAccount: jest.fn(),
          },
        },
        {
          provide: SessionService,
          useValue: {
            getSessionByWhatsappId: jest.fn(),
            createSession: jest.fn(),
            getSession: jest.fn(),
            updateSession: jest.fn(),
          },
        },
        {
          provide: GroupAuthService,
          useValue: {
            generateGroupLinkCode: jest.fn(),
            verifyGroupLinkCode: jest.fn(),
            getRealIdForLid: jest.fn(),
            isLidLinked: jest.fn(),
          },
        },
        {
          provide: FlashApiService,
          useValue: {
            executeQuery: jest.fn(),
          },
        },
        {
          provide: BalanceService,
          useValue: {
            getBalance: jest.fn().mockResolvedValue({
              btcBalance: 0,
              usdBalance: 0,
              formattedBtcBalance: '0 sats',
              formattedUsdBalance: '$0.00',
            }),
          },
        },
        {
          provide: UsernameService,
          useValue: {
            getUsername: jest.fn(),
            setUsername: jest.fn(),
          },
        },
        {
          provide: PriceService,
          useValue: {
            getBtcPrice: jest.fn().mockResolvedValue({
              price: 50000,
              formattedPrice: '$50,000.00',
            }),
          },
        },
        {
          provide: InvoiceService,
          useValue: {
            createInvoice: jest.fn(),
            decodeInvoice: jest.fn(),
          },
        },
        {
          provide: TransactionService,
          useValue: {
            getTransactionHistory: jest.fn(),
          },
        },
        {
          provide: PaymentService,
          useValue: {
            sendPayment: jest.fn(),
            sendPaymentToUsername: jest.fn(),
            sendPaymentToPhone: jest.fn(),
            getUserWallets: jest.fn(),
            sendLightningPayment: jest.fn(),
            sendIntraLedgerUsdPayment: jest.fn(),
          },
        },
        {
          provide: PendingPaymentService,
          useValue: {
            createPendingPayment: jest.fn(),
            getPendingPayment: jest.fn(),
            confirmPayment: jest.fn(),
            cancelPayment: jest.fn(),
            cleanupExpiredPayments: jest.fn(),
          },
        },
        {
          provide: GeminiAiService,
          useValue: {
            processQuery: jest.fn().mockResolvedValue('This is a test AI response'),
          },
        },
        {
          provide: QrCodeService,
          useValue: {
            generateQrCode: jest.fn(),
          },
        },
        {
          provide: CommandParserService,
          useValue: {
            parseCommand: jest.fn(),
          },
        },
        {
          provide: BalanceTemplate,
          useValue: {
            formatBalanceMessage: jest.fn().mockReturnValue('Balance: $0.00 (0 sats)'),
          },
        },
        {
          provide: WhatsAppWebService,
          useValue: {
            sendMessage: jest.fn(),
            isClientReady: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: InvoiceTrackerService,
          useValue: {
            trackInvoice: jest.fn(),
            untrackInvoice: jest.fn(),
          },
        },
        {
          provide: EventsService,
          useValue: {
            publishEvent: jest.fn(),
          },
        },
        {
          provide: AdminSettingsService,
          useValue: {
            getSettings: jest.fn().mockResolvedValue({
              lockdown: false,
              groupsEnabled: false,
              paymentsEnabled: true,
              requestsEnabled: true,
              supportNumbers: ['18762909250'],
              adminNumbers: ['13059244435'],
              voiceMode: 'on',
              lastUpdated: new Date(),
              updatedBy: 'system',
            }),
            isLockdown: jest.fn().mockResolvedValue(false),
            isAdmin: jest.fn().mockResolvedValue(false),
            getVoiceMode: jest.fn().mockResolvedValue('on'),
            setVoiceMode: jest.fn(),
          },
        },
        {
          provide: SupportModeService,
          useValue: {
            isInSupportMode: jest.fn().mockResolvedValue(false),
            isRequestingSupport: jest.fn().mockReturnValue(false),
            initiateSupportMode: jest.fn(),
            routeMessage: jest.fn(),
          },
        },
        {
          provide: TtsService,
          useValue: {
            shouldUseVoice: jest.fn().mockResolvedValue(false),
            shouldSendVoiceOnly: jest.fn().mockResolvedValue(false),
            textToSpeech: jest.fn(),
            cleanTextForTTS: jest.fn(),
          },
        },
        {
          provide: PaymentConfirmationService,
          useValue: {
            hasPendingPayment: jest.fn().mockResolvedValue(false),
            getPendingPayment: jest.fn().mockResolvedValue(null),
            storePendingPayment: jest.fn(),
            confirmPayment: jest.fn(),
            cancelPayment: jest.fn(),
          },
        },
        {
          provide: UserVoiceSettingsService,
          useValue: {
            getUserVoiceMode: jest.fn().mockResolvedValue('on'),
            setUserVoiceMode: jest.fn(),
            getUserVoice: jest.fn(),
            setUserVoice: jest.fn(),
            formatVoiceMode: jest.fn(),
          },
        },
        {
          provide: VoiceResponseService,
          useValue: {
            generateNaturalVoiceResponse: jest
              .fn()
              .mockResolvedValue('This is a natural voice response'),
          },
        },
        {
          provide: VoiceManagementService,
          useValue: {
            addVoice: jest.fn(),
            removeVoice: jest.fn(),
            getVoiceList: jest.fn(),
            getVoiceId: jest.fn(),
            voiceExists: jest.fn(),
            formatVoiceList: jest.fn(),
          },
        },
        {
          provide: OnboardingService,
          useValue: {
            getUserProgress: jest.fn().mockResolvedValue({
              currentStep: 'welcome',
              completedSteps: [],
              isComplete: false,
            }),
            completeStep: jest.fn(),
            getNextStep: jest.fn(),
            skipOnboarding: jest.fn(),
            getProgressMessage: jest.fn(),
            isNewUser: jest.fn().mockResolvedValue(false),
            getWelcomeMessage: jest.fn().mockResolvedValue('Welcome!'),
            detectAndUpdateProgress: jest.fn().mockResolvedValue(undefined),
            getCompletionMessage: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: ContextualHelpService,
          useValue: {
            checkForConfusion: jest.fn().mockResolvedValue(null),
            logActivity: jest.fn(),
            clearUserActivity: jest.fn(),
            trackActivity: jest.fn().mockResolvedValue(undefined),
            analyzeForConfusion: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: UndoTransactionService,
          useValue: {
            storeUndoableTransaction: jest.fn(),
            undoTransaction: jest.fn().mockResolvedValue({
              success: false,
              message: 'No recent transactions to undo.',
            }),
            getUndoableTransaction: jest.fn(),
            getUndoHint: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: PaymentTemplatesService,
          useValue: {
            createTemplate: jest.fn(),
            removeTemplate: jest.fn(),
            listTemplates: jest.fn().mockResolvedValue([]),
            getTemplateByName: jest.fn(),
            formatTemplatesList: jest.fn(),
          },
        },
        {
          provide: AdminAnalyticsService,
          useValue: {
            logTransaction: jest.fn(),
            logUserActivity: jest.fn(),
            getDailyTransactionSummary: jest.fn(),
            getWeeklyTransactionSummary: jest.fn(),
            getUserActivityInsights: jest.fn(),
            getSystemHealthMetrics: jest.fn(),
            formatAnalyticsReport: jest.fn(),
          },
        },
        {
          provide: UserKnowledgeBaseService,
          useValue: {
            addUserKnowledge: jest.fn(),
            getUserKnowledge: jest.fn().mockResolvedValue([]),
            searchUserKnowledge: jest.fn().mockResolvedValue([]),
            deleteUserKnowledge: jest.fn(),
            formatKnowledgeEntry: jest.fn(),
            formatKnowledgeList: jest.fn(),
          },
        },
        {
          provide: RandomQuestionService,
          useValue: {
            getRandomQuestion: jest.fn(),
            markQuestionAsAsked: jest.fn(),
            resetAskedQuestions: jest.fn(),
            getAskedQuestionsCount: jest.fn().mockResolvedValue(0),
            getPendingQuestion: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: PluginLoaderService,
          useValue: {
            loadPlugin: jest.fn(),
            unloadPlugin: jest.fn(),
            executeCommand: jest.fn().mockResolvedValue(null),
            getLoadedPlugins: jest.fn().mockReturnValue([]),
            getAllCommands: jest.fn().mockReturnValue([]),
          },
        },
        {
          provide: RequestDeduplicator,
          useValue: {
            deduplicate: jest.fn().mockImplementation((_key, factory) => factory()),
            clear: jest.fn(),
            clearAll: jest.fn(),
            getInFlightCount: jest.fn().mockReturnValue(0),
            getCacheSize: jest.fn().mockReturnValue(0),
          },
        },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
    _configService = module.get<ConfigService>(ConfigService);
    _redisService = module.get<RedisService>(RedisService);
    commandParserService = module.get<CommandParserService>(CommandParserService);
    sessionService = module.get<SessionService>(SessionService);
    _geminiAiService = module.get<GeminiAiService>(GeminiAiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processCloudMessage', () => {
    it('should process a cloud message and return a response', async () => {
      // Mock command parser
      const mockCommand = {
        type: CommandType.HELP,
        args: {},
        rawText: 'help',
      };
      jest.spyOn(commandParserService, 'parseCommand').mockReturnValue(mockCommand);

      // Mock session
      jest.spyOn(sessionService, 'getSessionByWhatsappId').mockResolvedValue(null);

      // Process a test message
      const messageData = {
        from: '+18765551234',
        text: 'help',
        messageId: 'test_msg_123',
        timestamp: new Date().toISOString(),
        name: 'Test User',
      };

      const response = await service.processCloudMessage(messageData);

      // Verify response is a string (help message)
      expect(response).toBeDefined();
      expect(typeof response).toBe('string');
      expect(response).toContain('Welcome');

      // Verify command parser was called with text and isVoiceCommand flag
      expect(commandParserService.parseCommand).toHaveBeenCalledWith('help', undefined);
    });

    it('should handle unknown commands', async () => {
      // Mock command for unknown/AI query
      const mockCommand = {
        type: CommandType.UNKNOWN,
        args: {},
        rawText: 'What is Bitcoin?',
      };
      jest.spyOn(commandParserService, 'parseCommand').mockReturnValue(mockCommand);

      // Mock no session
      jest.spyOn(sessionService, 'getSessionByWhatsappId').mockResolvedValue(null);

      // Process message
      const messageData = {
        from: '+18765551234',
        text: 'What is Bitcoin?',
        messageId: 'test_msg_124',
        timestamp: new Date().toISOString(),
      };

      const response = await service.processCloudMessage(messageData);

      // Verify response contains the unknown command message (may include hints)
      expect(response).toContain('help');
    });

    it('should require link for payment commands', async () => {
      // Mock command
      const mockCommand = {
        type: CommandType.PAY,
        args: { action: 'check' },
        rawText: 'pay check',
      };
      jest.spyOn(commandParserService, 'parseCommand').mockReturnValue(mockCommand);

      // Mock no session (user not linked)
      jest.spyOn(sessionService, 'getSessionByWhatsappId').mockResolvedValue(null);

      // Process message
      const messageData = {
        from: '+18765551234',
        text: 'pay check',
        messageId: 'test_msg_125',
        timestamp: new Date().toISOString(),
      };

      const response = await service.processCloudMessage(messageData);

      // Verify response prompts user to link their account
      expect(response).toContain('link');
    });
  });

  describe('Payment Request Flow', () => {
    let redisService: RedisService;
    let invoiceService: InvoiceService;
    let whatsappWebService: WhatsAppWebService;
    let paymentService: PaymentService;
    let usernameService: UsernameService;
    let flashApiService: FlashApiService;

    beforeEach(() => {
      redisService = module.get<RedisService>(RedisService);
      invoiceService = module.get<InvoiceService>(InvoiceService);
      whatsappWebService = module.get<WhatsAppWebService>(WhatsAppWebService);
      paymentService = module.get<PaymentService>(PaymentService);
      usernameService = module.get<UsernameService>(UsernameService);
      flashApiService = module.get<FlashApiService>(FlashApiService);
    });

    describe('handleRequestCommand', () => {
      it('should create a payment request and store it for the recipient', async () => {
        // Mock session for requester
        const mockSession = {
          sessionId: 'test-session',
          whatsappId: '18765551234',
          phoneNumber: '+18765551234',
          flashUserId: 'user123',
          flashAuthToken: 'test-token',
          isVerified: true,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          lastActivity: new Date(),
          mfaVerified: true,
          consentGiven: true,
        };
        jest.spyOn(sessionService, 'getSessionByWhatsappId').mockResolvedValue(mockSession);

        // Mock username service
        jest.spyOn(usernameService, 'getUsername').mockResolvedValue('alice');

        // Mock Flash API query for recipient username check
        jest.spyOn(flashApiService, 'executeQuery').mockResolvedValue({
          accountDefaultWallet: { id: 'wallet123' },
        });

        // Mock invoice creation
        const mockInvoice = {
          paymentRequest: 'lnbc1000n1234567890',
          paymentHash: 'hash1234567890',
          amount: 1,
          memo: 'Payment request from @alice',
          expiresAt: new Date(Date.now() + 3600000),
          walletCurrency: 'USD' as const,
        };
        jest.spyOn(invoiceService, 'createInvoice').mockResolvedValue(mockInvoice);

        // Mock WhatsApp web service
        jest.spyOn(whatsappWebService, 'sendMessage').mockResolvedValue(undefined);

        // Mock request command
        const mockCommand = {
          type: CommandType.REQUEST,
          args: {
            amount: '1',
            username: 'bob',
            phoneNumber: '+18765559999',
          },
          rawText: 'request 1 from bob',
        };
        jest.spyOn(commandParserService, 'parseCommand').mockReturnValue(mockCommand);

        // Process the request command
        const response = await service.processCloudMessage({
          from: '+18765551234',
          text: 'request 1 from bob',
          messageId: 'test_msg_request',
          timestamp: new Date().toISOString(),
        });

        // Verify invoice was created
        expect(invoiceService.createInvoice).toHaveBeenCalledWith(
          'test-token',
          1,
          'Payment request from @alice',
          'USD',
        );

        // Verify payment request was stored for recipient
        // Note: WhatsApp IDs in the actual code are normalized without + sign
        const recipientWhatsappId = '18765559999@c.us';
        expect(redisService.setEncrypted).toHaveBeenCalledWith(
          `pending_request:${recipientWhatsappId}`,
          expect.objectContaining({
            type: 'payment_request',
            invoice: 'lnbc1000n1234567890',
            amount: 1,
            requesterUsername: 'alice',
            requesterWhatsappId: '18765551234',
          }),
          3600,
        );

        // Verify message sent to recipient (only one message now)
        expect(whatsappWebService.sendMessage).toHaveBeenCalledTimes(1);
        expect(whatsappWebService.sendMessage).toHaveBeenCalledWith(
          recipientWhatsappId,
          expect.stringContaining('Payment Request'),
        );
        // Verify the message contains the pay instruction
        const sentMessage = (whatsappWebService.sendMessage as jest.Mock).mock.calls[0][1];
        expect(sentMessage).toContain('Simply type `pay` to send the payment');

        // Verify response to requester
        expect(typeof response).toBe('object');
        expect(response).toHaveProperty('text');
        expect((response as any).text).toContain('Payment request sent to @bob via WhatsApp');
      });
    });

    describe('handlePayCommand', () => {
      it('should pay a pending payment request when user types "pay"', async () => {
        // Mock session for payer
        const mockSession = {
          sessionId: 'test-session-2',
          whatsappId: '18765559999',
          phoneNumber: '+18765559999',
          flashUserId: 'user456',
          flashAuthToken: 'test-token-2',
          isVerified: true,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          lastActivity: new Date(),
          mfaVerified: true,
          consentGiven: true,
        };
        jest.spyOn(sessionService, 'getSessionByWhatsappId').mockResolvedValue(mockSession);

        // Mock pending payment request
        const mockPendingRequest = {
          type: 'payment_request',
          invoice: 'lnbc1000n1234567890',
          amount: 1,
          requesterUsername: 'alice',
          requesterWhatsappId: '18765551234',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        };
        // Mock that first call returns null (without @c.us), second call returns the request
        jest
          .spyOn(redisService, 'getEncrypted')
          .mockResolvedValueOnce(null) // First call with whatsappId
          .mockResolvedValueOnce(mockPendingRequest); // Second call with @c.us suffix

        // Mock wallet info
        jest.spyOn(paymentService, 'getUserWallets').mockResolvedValue({
          defaultWalletId: 'wallet456',
          usdWallet: { id: 'usd-wallet456', balance: 100, walletCurrency: WalletCurrency.Usd },
          btcWallet: undefined,
        });

        // Mock successful payment
        jest.spyOn(paymentService, 'sendLightningPayment').mockResolvedValue({
          status: PaymentSendResult.Success,
          errors: [],
        });

        // Mock payer username
        jest.spyOn(usernameService, 'getUsername').mockResolvedValue('bob');

        // Mock WhatsApp ready
        jest.spyOn(whatsappWebService, 'isClientReady').mockReturnValue(true);
        jest.spyOn(whatsappWebService, 'sendMessage').mockResolvedValue(undefined);

        // Mock pay command (no arguments = pay pending request)
        const mockCommand = {
          type: CommandType.PAY,
          args: {},
          rawText: 'pay',
        };
        jest.spyOn(commandParserService, 'parseCommand').mockReturnValue(mockCommand);

        // Process the pay command
        const response = await service.processCloudMessage({
          from: '+18765559999',
          text: 'pay',
          messageId: 'test_msg_pay',
          timestamp: new Date().toISOString(),
        });

        // Verify payment was sent
        expect(paymentService.sendLightningPayment).toHaveBeenCalledWith(
          {
            walletId: 'usd-wallet456',
            paymentRequest: 'lnbc1000n1234567890',
          },
          'test-token-2',
        );

        // Verify pending request was cleared (with @c.us suffix since that's where it was found)
        expect(redisService.del).toHaveBeenCalledWith('pending_request:18765559999@c.us');

        // Verify notification sent to requester
        expect(whatsappWebService.sendMessage).toHaveBeenCalledWith(
          '18765551234',
          expect.stringContaining('Payment Received!'),
        );
        expect(whatsappWebService.sendMessage).toHaveBeenCalledWith(
          '18765551234',
          expect.stringContaining('@bob has paid your request'),
        );

        // Verify response to payer
        expect(response).toContain('Sent $1.00 to @alice');
      });

      it('should handle expired payment requests', async () => {
        // Mock session
        const mockSession = {
          sessionId: 'test-session-3',
          whatsappId: '18765559999',
          phoneNumber: '+18765559999',
          flashUserId: 'user789',
          flashAuthToken: 'test-token-3',
          isVerified: true,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          lastActivity: new Date(),
          mfaVerified: true,
          consentGiven: true,
        };
        jest.spyOn(sessionService, 'getSessionByWhatsappId').mockResolvedValue(mockSession);

        // Mock expired payment request
        const mockExpiredRequest = {
          type: 'payment_request',
          invoice: 'lnbc1000n1234567890',
          amount: 1,
          requesterUsername: 'alice',
          requesterWhatsappId: '18765551234',
          createdAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
          expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago (expired)
        };
        // Mock that first call returns null (without @c.us), second call returns the expired request
        jest
          .spyOn(redisService, 'getEncrypted')
          .mockResolvedValueOnce(null) // First call with whatsappId
          .mockResolvedValueOnce(mockExpiredRequest); // Second call with @c.us suffix

        // Mock pay command
        const mockCommand = {
          type: CommandType.PAY,
          args: {},
          rawText: 'pay',
        };
        jest.spyOn(commandParserService, 'parseCommand').mockReturnValue(mockCommand);

        // Process the pay command
        const response = await service.processCloudMessage({
          from: '+18765559999',
          text: 'pay',
          messageId: 'test_msg_pay_expired',
          timestamp: new Date().toISOString(),
        });

        // Verify expired request was deleted (with @c.us suffix since that's where it was found)
        expect(redisService.del).toHaveBeenCalledWith('pending_request:18765559999@c.us');

        // Verify no payment was attempted
        expect(paymentService.sendLightningPayment).not.toHaveBeenCalled();

        // Verify appropriate error message
        expect(response).toContain('expired');
      });

      it('should handle already paid requests', async () => {
        // Mock session
        const mockSession = {
          sessionId: 'test-session-4',
          whatsappId: '18765559999',
          phoneNumber: '+18765559999',
          flashUserId: 'user101',
          flashAuthToken: 'test-token-4',
          isVerified: true,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          lastActivity: new Date(),
          mfaVerified: true,
          consentGiven: true,
        };
        jest.spyOn(sessionService, 'getSessionByWhatsappId').mockResolvedValue(mockSession);

        // Mock pending payment request
        const mockPendingRequest = {
          type: 'payment_request',
          invoice: 'lnbc1000n1234567890',
          amount: 1,
          requesterUsername: 'alice',
          requesterWhatsappId: '18765551234',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        };
        // Mock that first call returns null (without @c.us), second call returns the request
        jest
          .spyOn(redisService, 'getEncrypted')
          .mockResolvedValueOnce(null) // First call with whatsappId
          .mockResolvedValueOnce(mockPendingRequest); // Second call with @c.us suffix

        // Mock wallet info
        jest.spyOn(paymentService, 'getUserWallets').mockResolvedValue({
          defaultWalletId: 'wallet101',
          usdWallet: { id: 'usd-wallet101', balance: 100, walletCurrency: WalletCurrency.Usd },
          btcWallet: undefined,
        });

        // Mock already paid error
        jest.spyOn(paymentService, 'sendLightningPayment').mockResolvedValue({
          status: PaymentSendResult.AlreadyPaid,
          errors: [],
        });

        // Mock pay command
        const mockCommand = {
          type: CommandType.PAY,
          args: {},
          rawText: 'pay',
        };
        jest.spyOn(commandParserService, 'parseCommand').mockReturnValue(mockCommand);

        // Process the pay command
        const response = await service.processCloudMessage({
          from: '+18765559999',
          text: 'pay',
          messageId: 'test_msg_pay_already_paid',
          timestamp: new Date().toISOString(),
        });

        // Verify pending request was cleared (with @c.us suffix since that's where it was found)
        expect(redisService.del).toHaveBeenCalledWith('pending_request:18765559999@c.us');

        // Verify appropriate message
        expect(response).toContain('already been paid');
      });
    });
  });

  describe('Greeting and Casual Message Detection', () => {
    beforeEach(() => {
      // Mock all dependencies to return expected values
      jest.spyOn(sessionService, 'getSessionByWhatsappId').mockResolvedValue(null);
      jest.spyOn(_redisService, 'get').mockResolvedValue(null);
    });

    it('should detect and respond to "ello" greeting for logged out user', async () => {
      const mockCommand = {
        type: CommandType.UNKNOWN,
        args: {},
        rawText: 'ello',
      };
      jest.spyOn(commandParserService, 'parseCommand').mockReturnValue(mockCommand);

      const response = await service.processCloudMessage({
        from: '+18765551234',
        text: 'ello',
        messageId: 'test_msg_greeting',
        timestamp: new Date().toISOString(),
      });

      expect(response).toContain('👋 Hello! Welcome to Flash!');
      expect(response).toContain('Type `link` to connect your Flash account');
    });

    it('should detect and respond to "hi" greeting for logged out user', async () => {
      const mockCommand = {
        type: CommandType.UNKNOWN,
        args: {},
        rawText: 'hi',
      };
      jest.spyOn(commandParserService, 'parseCommand').mockReturnValue(mockCommand);

      const response = await service.processCloudMessage({
        from: '+18765551234',
        text: 'hi',
        messageId: 'test_msg_hi',
        timestamp: new Date().toISOString(),
      });

      expect(response).toContain('👋 Hello! Welcome to Flash!');
      expect(response).toContain('⚡ I\'m your Lightning payment assistant');
    });

    it('should detect and respond to "hey" greeting for logged in user', async () => {
      const mockSession = {
        sessionId: 'session123',
        whatsappId: '+18765551234',
        phoneNumber: '18765551234',
        flashUserId: 'user123',
        flashAuthToken: 'auth-token',
        isVerified: true,
        createdAt: new Date(),
        expiresAt: new Date(),
        lastActivity: new Date(),
        mfaVerified: false,
        consentGiven: true,
      };
      jest.spyOn(sessionService, 'getSessionByWhatsappId').mockResolvedValue(mockSession);

      const mockCommand = {
        type: CommandType.UNKNOWN,
        args: {},
        rawText: 'hey',
      };
      jest.spyOn(commandParserService, 'parseCommand').mockReturnValue(mockCommand);

      const response = await service.processCloudMessage({
        from: '+18765551234',
        text: 'hey',
        messageId: 'test_msg_hey_logged_in',
        timestamp: new Date().toISOString(),
      });

      expect(response).toContain('👋 Hey there! How can I help you today?');
      expect(response).toContain('Type `help` to see what I can do');
    });

    it('should detect emoji greetings', async () => {
      const mockCommand = {
        type: CommandType.UNKNOWN,
        args: {},
        rawText: '👋',
      };
      jest.spyOn(commandParserService, 'parseCommand').mockReturnValue(mockCommand);

      const response = await service.processCloudMessage({
        from: '+18765551234',
        text: '👋',
        messageId: 'test_msg_wave_emoji',
        timestamp: new Date().toISOString(),
      });

      expect(response).toContain('👋 Hello! Welcome to Flash!');
    });

    it('should handle non-greeting unknown commands differently', async () => {
      const mockCommand = {
        type: CommandType.UNKNOWN,
        args: {},
        rawText: 'random gibberish',
      };
      jest.spyOn(commandParserService, 'parseCommand').mockReturnValue(mockCommand);

      const response = await service.processCloudMessage({
        from: '+18765551234',
        text: 'random gibberish',
        messageId: 'test_msg_unknown',
        timestamp: new Date().toISOString(),
      });

      expect(response).toContain('I don\'t recognize that command');
      expect(response).toContain('Type `help` to see available commands');
    });
  });
});
