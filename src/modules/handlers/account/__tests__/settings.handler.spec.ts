import { SettingsHandler } from '../settings.handler';
import { WalletPort } from '../../../../core/ports/wallet.port';
import { CommandContext } from '../../../bot-core/types/command-context';
import { ChatId } from '../../../../core/types/chat-id';
import { UserId } from '../../../../core/types/user-id';
import { Platform } from '../../../../core/types/platform';

function createMockWallet(): jest.Mocked<WalletPort> {
  return {
    getBalance: jest.fn(),
    sendPayment: jest.fn(),
    createInvoice: jest.fn(),
    getTransactionHistory: jest.fn(),
    getTransaction: jest.fn(),
    getPendingPayments: jest.fn(),
    claimPendingPayment: jest.fn(),
    undoLastTransaction: jest.fn(),
    getPrice: jest.fn(),
    getUserInfo: jest.fn(),
    setUsername: jest.fn(),
    setConsent: jest.fn(),
    getContacts: jest.fn(),
    addContact: jest.fn(),
    removeContact: jest.fn(),
    getContactHistory: jest.fn(),
    clearBalanceCache: jest.fn(),
    payInvoice: jest.fn(),
    decodeInvoice: jest.fn(),
    confirmPendingPayment: jest.fn(),
    requestPayment: jest.fn(),
  };
}

function createCtx(): CommandContext {
  const userId = UserId.generate();
  const chat = ChatId.create({
    platform: Platform.WhatsAppCloud,
    platformChatId: 'chat-1',
    isGroup: false,
  });
  return {
    intent: {
      kind: 'core' as const,
      intent: 'VIEW_SETTINGS' as any,
      slots: {},
      confidence: 1,
      rawText: 'settings',
    },
    slots: {},
    userId,
    session: { userId, flashAuthToken: 'token-abc', lastActivity: new Date() },
    chat,
    inboundMessage: {
      id: 'msg-1',
      from: { platform: Platform.WhatsAppCloud, platformId: '123' } as any,
      chat,
      timestamp: new Date(),
      content: { type: 'text' as const, body: 'settings' },
    },
    platform: Platform.WhatsAppCloud,
  };
}

describe('SettingsHandler', () => {
  let handler: SettingsHandler;
  let mockWallet: jest.Mocked<WalletPort>;

  beforeEach(() => {
    mockWallet = createMockWallet();
    handler = new SettingsHandler(mockWallet);
  });

  it('should display user settings with username', async () => {
    const ctx = createCtx();
    mockWallet.getUserInfo.mockResolvedValue({
      username: 'johndoe',
      language: 'English',
      displayCurrency: 'USD',
      consentGiven: true,
    });

    const result = await handler.execute(ctx);

    expect(result.messages).toHaveLength(1);
    const body = (result.messages[0].content as any).body;
    const textValues = body.map((s: any) => s.value ?? '').join('');
    expect(textValues).toContain('@johndoe');
    expect(textValues).toContain('English');
    expect(textValues).toContain('USD');
    expect(textValues).toContain('enabled');
  });

  it('should show defaults when no settings are set', async () => {
    const ctx = createCtx();
    mockWallet.getUserInfo.mockResolvedValue({});

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    const textValues = body.map((s: any) => s.value ?? '').join('');
    expect(textValues).toContain('Not set');
    expect(textValues).toContain('English');
    expect(textValues).toContain('USD');
    expect(textValues).toContain('disabled');
  });

  it('should throw when not authenticated', async () => {
    const ctx = createCtx();
    ctx.session.flashAuthToken = undefined;

    await expect(handler.execute(ctx)).rejects.toThrow('Authentication required');
  });
});
