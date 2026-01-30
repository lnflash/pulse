import { RefreshBalanceHandler } from '../refresh-balance.handler';
import { WalletPort } from '../../../../../core/ports/wallet.port';
import { CommandContext } from '../../../../bot-core/types/command-context';
import { ChatId } from '../../../../../core/types/chat-id';
import { UserId } from '../../../../../core/types/user-id';
import { Platform } from '../../../../../core/types/platform';

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
    payInvoice: jest.fn(),
    decodeInvoice: jest.fn(),
    confirmPendingPayment: jest.fn(),
    requestPayment: jest.fn(),
    clearBalanceCache: jest.fn(),
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
      intent: 'REFRESH_BALANCE' as any,
      slots: {},
      confidence: 1,
      rawText: 'refresh',
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
      content: { type: 'text' as const, body: 'refresh' },
    },
    platform: Platform.WhatsAppCloud,
  };
}

describe('RefreshBalanceHandler', () => {
  let handler: RefreshBalanceHandler;
  let mockWallet: jest.Mocked<WalletPort>;

  beforeEach(() => {
    mockWallet = createMockWallet();
    handler = new RefreshBalanceHandler(mockWallet);
  });

  it('should clear cache then fetch balance', async () => {
    const ctx = createCtx();
    mockWallet.clearBalanceCache.mockResolvedValue(undefined);
    mockWallet.getBalance.mockResolvedValue({ btc: '0.001' });

    const result = await handler.execute(ctx);

    expect(mockWallet.clearBalanceCache).toHaveBeenCalledWith(ctx.userId);
    expect(mockWallet.getBalance).toHaveBeenCalledWith(ctx.userId);
    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('Balance Refreshed');
  });

  it('should throw when not authenticated', async () => {
    const ctx = createCtx();
    ctx.session.flashAuthToken = undefined;

    await expect(handler.execute(ctx)).rejects.toThrow('Authentication required');
  });
});
