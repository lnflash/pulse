import { PendingHandler } from '../pending.handler';
import { WalletPort, PendingPayment } from '../../../../core/ports/wallet.port';
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
      intent: 'VIEW_PENDING' as any,
      slots: {},
      confidence: 1,
      rawText: 'pending',
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
      content: { type: 'text' as const, body: 'pending' },
    },
    platform: Platform.WhatsAppCloud,
    ...overrides,
  };
}

describe('PendingHandler', () => {
  let handler: PendingHandler;
  let mockWallet: jest.Mocked<WalletPort>;

  beforeEach(() => {
    mockWallet = createMockWallet();
    handler = new PendingHandler(mockWallet);
  });

  it('should list received pending payments by default', async () => {
    const ctx = createCtx();
    const payments: PendingPayment[] = [
      {
        id: 'pp-1',
        amount: 50,
        currency: 'USD',
        claimCode: 'ABC123',
        status: 'pending',
        createdAt: new Date(),
      },
    ];
    mockWallet.getPendingPayments.mockResolvedValue(payments);

    const result = await handler.execute(ctx);

    expect(mockWallet.getPendingPayments).toHaveBeenCalledWith(ctx.userId, 'received');
    expect(result.messages).toHaveLength(1);
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'bold', value: '⏳ Pending Received Payments' }),
      ]),
    );
  });

  it('should list sent pending payments when action is sent', async () => {
    const ctx = createCtx({ slots: { action: 'sent' } });
    mockWallet.getPendingPayments.mockResolvedValue([]);

    const result = await handler.execute(ctx);

    expect(mockWallet.getPendingPayments).toHaveBeenCalledWith(ctx.userId, 'sent');
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('No pending sent') }),
      ]),
    );
  });

  it('should claim payment when claimCode provided', async () => {
    const ctx = createCtx({ slots: { claimCode: 'XYZ789' } });
    mockWallet.claimPendingPayment.mockResolvedValue({
      success: true,
      message: 'Claimed 50 USD successfully',
    });

    const result = await handler.execute(ctx);

    expect(mockWallet.claimPendingPayment).toHaveBeenCalledWith(ctx.userId, 'XYZ789');
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'bold', value: 'Payment claimed!' }),
      ]),
    );
  });

  it('should show error when claim fails', async () => {
    const ctx = createCtx({ slots: { claimCode: 'INVALID' } });
    mockWallet.claimPendingPayment.mockResolvedValue({
      success: false,
      message: 'Invalid or expired claim code',
    });

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('Invalid or expired') }),
      ]),
    );
  });

  it('should throw when not authenticated', async () => {
    const ctx = createCtx();
    ctx.session.flashAuthToken = undefined;

    await expect(handler.execute(ctx)).rejects.toThrow('Authentication required');
  });
});
