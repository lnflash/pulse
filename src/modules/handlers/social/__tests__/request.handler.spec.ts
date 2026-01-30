import { RequestHandler } from '../request.handler';
import { WalletPort, PaymentRequest } from '../../../../core/ports/wallet.port';
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
      intent: 'REQUEST_PAYMENT' as any,
      slots: {},
      confidence: 1,
      rawText: 'request 10 from alice',
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
      content: { type: 'text' as const, body: 'request 10 from alice' },
    },
    platform: Platform.WhatsAppCloud,
    ...overrides,
  };
}

describe('RequestHandler', () => {
  let handler: RequestHandler;
  let mockWallet: jest.Mocked<WalletPort>;

  beforeEach(() => {
    mockWallet = createMockWallet();
    handler = new RequestHandler(mockWallet);
  });

  it('should send a payment request', async () => {
    const request: PaymentRequest = {
      id: 'req-1',
      fromUserId: 'user-1',
      toTarget: 'alice',
      amount: 10,
      currency: 'USD',
      status: 'pending',
      createdAt: new Date(),
    };
    mockWallet.requestPayment.mockResolvedValue(request);
    const ctx = createCtx({ slots: { target: 'alice', amount: '10' } });

    const result = await handler.execute(ctx);

    expect(mockWallet.requestPayment).toHaveBeenCalledWith(
      ctx.userId,
      'alice',
      10,
      'USD',
      undefined,
    );
    expect(result.messages).toHaveLength(1);
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('request sent') }),
      ]),
    );
  });

  it('should include memo when provided', async () => {
    const request: PaymentRequest = {
      id: 'req-2',
      fromUserId: 'user-1',
      toTarget: 'bob',
      amount: 25,
      currency: 'USD',
      memo: 'lunch',
      status: 'pending',
      createdAt: new Date(),
    };
    mockWallet.requestPayment.mockResolvedValue(request);
    const ctx = createCtx({ slots: { target: 'bob', amount: '25', memo: 'lunch' } });

    const result = await handler.execute(ctx);

    expect(mockWallet.requestPayment).toHaveBeenCalledWith(ctx.userId, 'bob', 25, 'USD', 'lunch');
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'italic', value: 'lunch' })]),
    );
  });

  it('should error when target is missing', async () => {
    const ctx = createCtx({ slots: { amount: '10' } });

    const result = await handler.execute(ctx);

    expect(mockWallet.requestPayment).not.toHaveBeenCalled();
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('specify who') }),
      ]),
    );
  });

  it('should error when amount is missing', async () => {
    const ctx = createCtx({ slots: { target: 'alice' } });

    const result = await handler.execute(ctx);

    expect(mockWallet.requestPayment).not.toHaveBeenCalled();
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('specify an amount') }),
      ]),
    );
  });

  it('should error on invalid amount', async () => {
    const ctx = createCtx({ slots: { target: 'alice', amount: 'abc' } });

    const result = await handler.execute(ctx);

    expect(mockWallet.requestPayment).not.toHaveBeenCalled();
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('Invalid amount') }),
      ]),
    );
  });

  it('should error on zero amount', async () => {
    const ctx = createCtx({ slots: { target: 'alice', amount: '0' } });

    const result = await handler.execute(ctx);

    expect(mockWallet.requestPayment).not.toHaveBeenCalled();
  });

  it('should throw when not authenticated', async () => {
    const ctx = createCtx({ slots: { target: 'alice', amount: '10' } });
    ctx.session.flashAuthToken = undefined;

    await expect(handler.execute(ctx)).rejects.toThrow('Authentication required');
  });
});
