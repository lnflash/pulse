import { PriceHandler } from '../price.handler';
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
    requestPayment: jest.fn(),
    clearBalanceCache: jest.fn(),
    payInvoice: jest.fn(),
    decodeInvoice: jest.fn(),
    confirmPendingPayment: jest.fn(),
  };
}

function createCtx(overrides: Partial<CommandContext> = {}): CommandContext {
  const userId = UserId.generate();
  const chat = ChatId.create({
    platform: Platform.WhatsAppCloud,
    platformChatId: 'chat-1',
    isGroup: false,
  });
  return {
    intent: {
      kind: 'core' as const,
      intent: 'CHECK_PRICE' as any,
      slots: {},
      confidence: 1,
      rawText: 'price',
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
      content: { type: 'text' as const, body: 'price' },
    },
    platform: Platform.WhatsAppCloud,
    ...overrides,
  };
}

describe('PriceHandler', () => {
  let handler: PriceHandler;
  let mockWallet: jest.Mocked<WalletPort>;

  beforeEach(() => {
    mockWallet = createMockWallet();
    handler = new PriceHandler(mockWallet);
  });

  it('should show BTC price in user display currency when authenticated', async () => {
    const ctx = createCtx();
    mockWallet.getUserInfo.mockResolvedValue({
      displayCurrency: 'EUR',
    });
    mockWallet.getPrice.mockResolvedValue({
      price: 45000,
      currency: 'EUR',
      change24h: 2.5,
    });

    const result = await handler.execute(ctx);

    expect(result.messages).toHaveLength(1);
    expect(mockWallet.getPrice).toHaveBeenCalledWith('EUR');
    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('EUR');
    expect(text).toContain('45,000');
    expect(text).toContain('+2.50%');
  });

  it('should show USD price when unauthenticated with link CTA', async () => {
    const ctx = createCtx();
    ctx.session.flashAuthToken = undefined;
    mockWallet.getPrice.mockResolvedValue({
      price: 50000,
      currency: 'USD',
    });

    const result = await handler.execute(ctx);

    expect(mockWallet.getUserInfo).not.toHaveBeenCalled();
    expect(mockWallet.getPrice).toHaveBeenCalledWith('USD');
    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('Link your account');
  });

  it('should default to USD when user has no display currency', async () => {
    const ctx = createCtx();
    mockWallet.getUserInfo.mockResolvedValue({});
    mockWallet.getPrice.mockResolvedValue({
      price: 50000,
      currency: 'USD',
    });

    const result = await handler.execute(ctx);

    expect(mockWallet.getPrice).toHaveBeenCalledWith('USD');
    expect(result.messages).toHaveLength(1);
  });

  it('should handle negative 24h change', async () => {
    const ctx = createCtx();
    mockWallet.getUserInfo.mockResolvedValue({ displayCurrency: 'USD' });
    mockWallet.getPrice.mockResolvedValue({
      price: 48000,
      currency: 'USD',
      change24h: -3.2,
    });

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('📉');
    expect(text).toContain('-3.20%');
  });
});
