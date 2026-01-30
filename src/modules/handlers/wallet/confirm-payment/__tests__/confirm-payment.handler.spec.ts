import { ConfirmPaymentHandler } from '../confirm-payment.handler';
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
    requestPayment: jest.fn(),
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
      intent: 'CONFIRM_PAYMENT' as any,
      slots: {},
      confidence: 1,
      rawText: 'yes',
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
      content: { type: 'text' as const, body: 'yes' },
    },
    platform: Platform.WhatsAppCloud,
    ...overrides,
  };
}

describe('ConfirmPaymentHandler', () => {
  let handler: ConfirmPaymentHandler;
  let mockWallet: jest.Mocked<WalletPort>;

  beforeEach(() => {
    mockWallet = createMockWallet();
    handler = new ConfirmPaymentHandler(mockWallet);
  });

  it('should return error when no paymentId', async () => {
    const ctx = createCtx({ slots: { confirmation: 'yes' } });

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('No pending payment') }),
      ]),
    );
  });

  it('should confirm payment with yes', async () => {
    const ctx = createCtx({ slots: { confirmation: 'yes', paymentId: 'pay-1' } });
    mockWallet.confirmPendingPayment.mockResolvedValue({
      success: true,
      message: 'Sent 1000 sats',
    });

    const result = await handler.execute(ctx);

    expect(mockWallet.confirmPendingPayment).toHaveBeenCalledWith(ctx.userId, 'pay-1', 'confirm');
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('confirmed') }),
      ]),
    );
  });

  it('should cancel payment with no', async () => {
    const ctx = createCtx({ slots: { confirmation: 'no', paymentId: 'pay-1' } });
    mockWallet.confirmPendingPayment.mockResolvedValue({
      success: true,
      message: 'Cancelled',
    });

    const result = await handler.execute(ctx);

    expect(mockWallet.confirmPendingPayment).toHaveBeenCalledWith(ctx.userId, 'pay-1', 'cancel');
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('cancelled') }),
      ]),
    );
  });

  it('should cancel payment with cancel keyword', async () => {
    const ctx = createCtx({ slots: { confirmation: 'cancel', paymentId: 'pay-1' } });
    mockWallet.confirmPendingPayment.mockResolvedValue({
      success: true,
      message: 'Cancelled',
    });

    const result = await handler.execute(ctx);

    expect(mockWallet.confirmPendingPayment).toHaveBeenCalledWith(ctx.userId, 'pay-1', 'cancel');
  });

  it('should handle failed confirmation', async () => {
    const ctx = createCtx({ slots: { confirmation: 'yes', paymentId: 'pay-1' } });
    mockWallet.confirmPendingPayment.mockResolvedValue({
      success: false,
      message: 'Insufficient balance',
    });

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('Insufficient balance') }),
      ]),
    );
  });

  it('should prompt when no confirmation provided', async () => {
    const ctx = createCtx({ slots: { paymentId: 'pay-1' } });

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('confirm') }),
      ]),
    );
  });

  it('should throw when not authenticated', async () => {
    const ctx = createCtx();
    ctx.session.flashAuthToken = undefined;

    await expect(handler.execute(ctx)).rejects.toThrow('Authentication required');
  });
});
