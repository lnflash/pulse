import { PayInvoiceHandler } from '../pay-invoice.handler';
import {
  WalletPort,
  DecodedInvoice,
  PayInvoiceResult,
} from '../../../../../core/ports/wallet.port';
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
    requestPayment: jest.fn(),
    payInvoice: jest.fn(),
    decodeInvoice: jest.fn(),
    confirmPendingPayment: jest.fn(),
    clearBalanceCache: jest.fn(),
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
      intent: 'PAY_INVOICE' as any,
      slots: {},
      confidence: 1,
      rawText: 'pay',
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
      content: { type: 'text' as const, body: 'pay' },
    },
    platform: Platform.WhatsAppCloud,
    ...overrides,
  };
}

describe('PayInvoiceHandler', () => {
  let handler: PayInvoiceHandler;
  let mockWallet: jest.Mocked<WalletPort>;

  beforeEach(() => {
    mockWallet = createMockWallet();
    handler = new PayInvoiceHandler(mockWallet);
  });

  it('should list pending payments when no invoice or action', async () => {
    const ctx = createCtx();
    mockWallet.getPendingPayments.mockResolvedValue([]);

    const result = await handler.execute(ctx);

    expect(mockWallet.getPendingPayments).toHaveBeenCalledWith(ctx.userId, 'received');
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('No pending payments') }),
      ]),
    );
  });

  it('should list pending payments when action is list', async () => {
    const ctx = createCtx({ slots: { action: 'list' } });
    mockWallet.getPendingPayments.mockResolvedValue([
      {
        id: 'pp-1',
        amount: 1000,
        currency: 'sats',
        sender: '@alice',
        status: 'pending',
        createdAt: new Date(),
      },
    ]);

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('Pending Payments') }),
      ]),
    );
  });

  it('should pay a valid Lightning invoice', async () => {
    const invoice = 'lnbc10u1p0abcdef';
    const ctx = createCtx({ slots: { invoice } });

    const decoded: DecodedInvoice = {
      paymentHash: 'hash123',
      amount: 1000,
      currency: 'sats',
      memo: 'test payment',
      destination: 'dest123',
      expiresAt: new Date(Date.now() + 3600000),
      isExpired: false,
    };
    mockWallet.decodeInvoice.mockResolvedValue(decoded);

    const payResult: PayInvoiceResult = {
      success: true,
      preimage: 'pre123',
      paymentHash: 'hash123',
      feeSats: 1,
      message: 'Payment sent',
    };
    mockWallet.payInvoice.mockResolvedValue(payResult);

    const result = await handler.execute(ctx);

    expect(mockWallet.decodeInvoice).toHaveBeenCalledWith(ctx.userId, invoice);
    expect(mockWallet.payInvoice).toHaveBeenCalledWith(ctx.userId, invoice);
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('Payment sent') }),
      ]),
    );
  });

  it('should reject invalid Lightning invoice', async () => {
    const ctx = createCtx({ slots: { invoice: 'invalid_invoice' } });

    const result = await handler.execute(ctx);

    expect(mockWallet.decodeInvoice).not.toHaveBeenCalled();
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('Invalid Lightning invoice') }),
      ]),
    );
  });

  it('should reject expired invoice', async () => {
    const invoice = 'lnbc10u1p0expired';
    const ctx = createCtx({ slots: { invoice } });

    mockWallet.decodeInvoice.mockResolvedValue({
      paymentHash: 'hash',
      amount: 1000,
      currency: 'sats',
      destination: 'dest',
      expiresAt: new Date(Date.now() - 3600000),
      isExpired: true,
    });

    const result = await handler.execute(ctx);

    expect(mockWallet.payInvoice).not.toHaveBeenCalled();
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('expired') }),
      ]),
    );
  });

  it('should pay a request by ID', async () => {
    const ctx = createCtx({ slots: { requestId: 'req-123' } });
    mockWallet.confirmPendingPayment.mockResolvedValue({
      success: true,
      message: 'Paid 500 sats to @bob',
    });

    const result = await handler.execute(ctx);

    expect(mockWallet.confirmPendingPayment).toHaveBeenCalledWith(ctx.userId, 'req-123', 'confirm');
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('confirmed') }),
      ]),
    );
  });

  it('should cancel a payment', async () => {
    const ctx = createCtx({ slots: { action: 'cancel', requestId: 'req-123' } });
    mockWallet.confirmPendingPayment.mockResolvedValue({
      success: true,
      message: 'Cancelled',
    });

    const result = await handler.execute(ctx);

    expect(mockWallet.confirmPendingPayment).toHaveBeenCalledWith(ctx.userId, 'req-123', 'cancel');
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('cancelled') }),
      ]),
    );
  });

  it('should throw when not authenticated', async () => {
    const ctx = createCtx();
    ctx.session.flashAuthToken = undefined;

    await expect(handler.execute(ctx)).rejects.toThrow('Authentication required');
  });
});
