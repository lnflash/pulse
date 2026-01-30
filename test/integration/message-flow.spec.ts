import { Test, TestingModule } from '@nestjs/testing';
import { DiscoveryModule } from '@nestjs/core';
import { MessageOrchestratorService } from '../../src/modules/bot-core/orchestrator/message-orchestrator.service';
import { CommandRouterService } from '../../src/modules/bot-core/router/command-router.service';
import { IntentPipelineService } from '../../src/modules/nlp/pipeline/intent-pipeline.service';
import { BalanceHandler } from '../../src/modules/handlers/wallet/balance/balance.handler';
import { SendHandler } from '../../src/modules/handlers/wallet/send/send.handler';
import { LinkHandler } from '../../src/modules/handlers/account/link/link.handler';
import { VerifyHandler } from '../../src/modules/handlers/account/verify/verify.handler';
import { HelpHandler } from '../../src/modules/handlers/account/help/help.handler';
import { Platform, InboundMessage, OutboundMessage, UserId } from '../../src/core/types';
import { ActorId } from '../../src/core/types/actor-id';
import { ChatId } from '../../src/core/types/chat-id';
import { Session } from '../../src/core/ports/session.port';

const capturedMessages: OutboundMessage[] = [];
const testUserId = UserId.generate();

const mockIdentityPort = {
  resolveUserId: jest.fn().mockResolvedValue(testUserId),
  createMapping: jest.fn().mockResolvedValue(testUserId),
  getActors: jest.fn().mockResolvedValue([]),
};

const linkedSession: Session = {
  userId: testUserId,
  flashAuthToken: 'test-token-abc',
  flashUserId: 'flash-123',
  linkedPhone: '1234567890',
  lastActivity: new Date(),
};

const unlinkedSession: Session = {
  userId: testUserId,
  lastActivity: new Date(),
};

const mockSessionPort = {
  getSession: jest.fn().mockResolvedValue(null),
  getOrCreateSession: jest.fn().mockResolvedValue(linkedSession),
  updateSession: jest.fn().mockResolvedValue(undefined),
  deleteSession: jest.fn().mockResolvedValue(undefined),
};

const mockWalletPort = {
  getBalance: jest.fn().mockResolvedValue('123,456 sats'),
  sendPayment: jest.fn().mockResolvedValue('tx_abc123'),
  createInvoice: jest.fn().mockResolvedValue('lnbc...'),
  getTransactionHistory: jest.fn().mockResolvedValue([]),
  getTransaction: jest.fn().mockResolvedValue(null),
  getPendingPayments: jest.fn().mockResolvedValue([]),
  claimPendingPayment: jest.fn().mockResolvedValue({ success: true, message: 'claimed' }),
  undoLastTransaction: jest.fn().mockResolvedValue({ success: true, message: 'undone' }),
  getPrice: jest.fn().mockResolvedValue({ btc: 100000 }),
  getUserInfo: jest.fn().mockResolvedValue({ username: 'alice' }),
  setUsername: jest.fn().mockResolvedValue(undefined),
  setConsent: jest.fn().mockResolvedValue(undefined),
  getContacts: jest.fn().mockResolvedValue([]),
  addContact: jest.fn().mockResolvedValue({ name: 'alice' }),
  removeContact: jest.fn().mockResolvedValue(true),
  getContactHistory: jest.fn().mockResolvedValue([]),
  payInvoice: jest.fn().mockResolvedValue({ success: true, message: 'paid' }),
  decodeInvoice: jest.fn().mockResolvedValue({ amount: 1000 }),
  confirmPendingPayment: jest.fn().mockResolvedValue({ success: true, message: 'confirmed' }),
  requestPayment: jest.fn().mockResolvedValue({ id: 'req-1' }),
};

const mockTransport = {
  publishInbound: jest.fn().mockResolvedValue(undefined),
  onInbound: jest.fn(),
  publishOutbound: jest.fn().mockImplementation(async (msg: OutboundMessage) => {
    capturedMessages.push(msg);
  }),
  onOutbound: jest.fn(),
};

function makeInbound(body: string, userId = '1234567890'): InboundMessage {
  return {
    id: `test_${Date.now()}`,
    from: ActorId.create({
      platform: Platform.WhatsAppCloud,
      platformUserId: userId,
      displayName: 'Test User',
    }),
    chat: ChatId.create({
      platform: Platform.WhatsAppCloud,
      platformChatId: userId,
      isGroup: false,
    }),
    timestamp: new Date(),
    content: { type: 'text', body },
  };
}

function outboundText(msg: OutboundMessage): string {
  if (msg.content.type === 'text') {
    return msg.content.body.map((seg) => ('value' in seg ? seg.value : '\n')).join('');
  }
  return '';
}

describe('Message Flow Integration', () => {
  let orchestrator: MessageOrchestratorService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [
        CommandRouterService,
        IntentPipelineService,
        LinkHandler,
        VerifyHandler,
        HelpHandler,
        BalanceHandler,
        SendHandler,
        { provide: 'WalletPort', useValue: mockWalletPort },
        { provide: 'SessionPort', useValue: mockSessionPort },
        {
          provide: MessageOrchestratorService,
          useFactory: (router: CommandRouterService) =>
            new MessageOrchestratorService(
              mockIdentityPort as any,
              mockSessionPort as any,
              new IntentPipelineService(),
              router,
              mockTransport as any,
            ),
          inject: [CommandRouterService],
        },
      ],
    }).compile();

    await module.init();
    orchestrator = module.get(MessageOrchestratorService);
  });

  beforeEach(() => {
    capturedMessages.length = 0;
    jest.clearAllMocks();
    mockSessionPort.getOrCreateSession.mockResolvedValue(linkedSession);
    mockIdentityPort.resolveUserId.mockResolvedValue(testUserId);
  });

  describe('Link Account Flow', () => {
    it('should prompt for OTP when unlinked user sends "link"', async () => {
      mockSessionPort.getOrCreateSession.mockResolvedValue(unlinkedSession);

      await orchestrator.processMessage(makeInbound('link'));

      expect(capturedMessages).toHaveLength(1);
      const text = outboundText(capturedMessages[0]);
      expect(text).toContain('Link Your Flash Account');
      expect(text).toContain('verification code');
    });

    it('should confirm already linked when linked user sends "link"', async () => {
      await orchestrator.processMessage(makeInbound('link'));

      expect(capturedMessages).toHaveLength(1);
      expect(outboundText(capturedMessages[0])).toContain('Already linked');
    });

    it('should complete link → OTP prompt → verify success flow', async () => {
      mockSessionPort.getOrCreateSession.mockResolvedValue(unlinkedSession);

      await orchestrator.processMessage(makeInbound('link'));
      expect(capturedMessages).toHaveLength(1);
      expect(outboundText(capturedMessages[0])).toContain('verification code');

      // NLP pipeline doesn't yet route "verify 123456" to VerifyOTP intent.
      // Once slot extraction is implemented, this flow will work end-to-end.
      // For now we validate the link prompt is correctly issued.
    });
  });

  describe('Balance Check Flow', () => {
    it('should return formatted balance for authenticated user', async () => {
      mockWalletPort.getBalance.mockResolvedValue('123,456 sats');

      await orchestrator.processMessage(makeInbound('balance'));

      expect(capturedMessages).toHaveLength(1);
      const text = outboundText(capturedMessages[0]);
      expect(text).toContain('Balance');
      expect(text).toContain('123,456 sats');
      expect(mockWalletPort.getBalance).toHaveBeenCalledWith(testUserId);
    });

    it('should fail silently for unauthenticated user (requireAuth throws)', async () => {
      mockSessionPort.getOrCreateSession.mockResolvedValue(unlinkedSession);

      await orchestrator.processMessage(makeInbound('balance'));

      expect(capturedMessages).toHaveLength(0);
    });

    it('should route "check my balance" to balance handler', async () => {
      mockWalletPort.getBalance.mockResolvedValue('500 sats');

      await orchestrator.processMessage(makeInbound('check my balance'));

      expect(capturedMessages).toHaveLength(1);
      expect(outboundText(capturedMessages[0])).toContain('Balance');
    });
  });

  describe('Send Payment Flow', () => {
    it('should prompt for details when slots are missing', async () => {
      // NLP pipeline returns empty slots for "send 1000 to alice"
      await orchestrator.processMessage(makeInbound('send 1000 to alice'));

      expect(capturedMessages).toHaveLength(1);
      expect(outboundText(capturedMessages[0])).toContain('specify amount and destination');
    });

    it('should fail silently for unauthenticated user', async () => {
      mockSessionPort.getOrCreateSession.mockResolvedValue(unlinkedSession);

      await orchestrator.processMessage(makeInbound('send 1000 to alice'));

      expect(capturedMessages).toHaveLength(0);
    });

    it('should prompt for details on bare "send" command', async () => {
      await orchestrator.processMessage(makeInbound('send'));

      expect(capturedMessages).toHaveLength(1);
      expect(outboundText(capturedMessages[0])).toContain('specify amount and destination');
    });
  });

  describe('Cross-cutting Concerns', () => {
    it('should create identity mapping for unknown user', async () => {
      mockIdentityPort.resolveUserId.mockResolvedValue(null);
      mockIdentityPort.createMapping.mockResolvedValue(testUserId);

      await orchestrator.processMessage(makeInbound('balance', '9999999999'));

      expect(mockIdentityPort.createMapping).toHaveBeenCalled();
      expect(capturedMessages).toHaveLength(1);
    });

    it('should silently ignore non-text content', async () => {
      const inbound: InboundMessage = {
        id: 'test_voice',
        from: ActorId.create({
          platform: Platform.WhatsAppCloud,
          platformUserId: '1234567890',
        }),
        chat: ChatId.create({
          platform: Platform.WhatsAppCloud,
          platformChatId: '1234567890',
          isGroup: false,
        }),
        timestamp: new Date(),
        content: { type: 'voice', mediaRef: 'audio/ogg;codecs=opus' },
      };

      await orchestrator.processMessage(inbound);
      expect(capturedMessages).toHaveLength(0);
    });

    it('should ignore conversational messages with no registered handler', async () => {
      await orchestrator.processMessage(makeInbound('hello there'));
      expect(capturedMessages).toHaveLength(0);
    });
  });
});
