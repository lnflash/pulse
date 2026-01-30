import { InvoiceDetectedHandler } from '../invoice-detected.handler';
import { WalletPort, DecodedInvoice } from '../../../../../core/ports/wallet.port';
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
      intent: 'INVOICE_DETECTED' as any,
      slots: {},
      confidence: 1,
      rawText: 'lnbc10u1p0testinvoice',
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
      content: { type: 'text' as const, body: 'lnbc10u1p0testinvoice' },
    },
    platform: Platform.WhatsAppCloud,
    ...overrides,
  };
}

describe('InvoiceDetectedHandler', () => {
  let handler: InvoiceDetectedHandler;
  let mockWallet: jest.Mocked<WalletPort>;

  beforeEach(() => {
    mockWallet = createMockWallet();
    handler = new InvoiceDetectedHandler(mockWallet);
  });

  it('should decode and display invoice details from rawText', async () => {
    const ctx = createCtx();
    const decoded: DecodedInvoice = {
      paymentHash: 'hash123',
      amount: 1000,
      currency: 'sats',
      memo: 'Coffee',
      destination: 'dest123',
      expiresAt: new Date(Date.now() + 3600000),
      isExpired: false,
    };
    mockWallet.decodeInvoice.mockResolvedValue(decoded);

    const result = await handler.execute(ctx);

    expect(mockWallet.decodeInvoice).toHaveBeenCalledWith(ctx.userId, 'lnbc10u1p0testinvoice');
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('Lightning Invoice Detected') }),
      ]),
    );
  });

  it('should use invoice from slots if available', async () => {
    const invoice = 'lnbc20u1p0slotinvoice';
    const ctx = createCtx({ slots: { invoice } });
    const decoded: DecodedInvoice = {
      paymentHash: 'hash456',
      amount: 2000,
      currency: 'sats',
      destination: 'dest456',
      expiresAt: new Date(Date.now() + 3600000),
      isExpired: false,
    };
    mockWallet.decodeInvoice.mockResolvedValue(decoded);

    const result = await handler.execute(ctx);

    expect(mockWallet.decodeInvoice).toHaveBeenCalledWith(ctx.userId, invoice);
  });

  it('should reject expired invoice', async () => {
    const ctx = createCtx();
    mockWallet.decodeInvoice.mockResolvedValue({
      paymentHash: 'hash',
      amount: 1000,
      currency: 'sats',
      destination: 'dest',
      expiresAt: new Date(Date.now() - 3600000),
      isExpired: true,
    });

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('expired') }),
      ]),
    );
  });

  it('should handle malformed invoice', async () => {
    const ctx = createCtx();
    mockWallet.decodeInvoice.mockRejectedValue(new Error('Invalid invoice'));

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('Could not decode') }),
      ]),
    );
  });

  it('should return error when no invoice found', async () => {
    const ctx = createCtx();
    (ctx.intent as any).rawText = 'no invoice here';

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('No valid Lightning invoice') }),
      ]),
    );
  });

  it('should throw when not authenticated', async () => {
    const ctx = createCtx();
    ctx.session.flashAuthToken = undefined;

    await expect(handler.execute(ctx)).rejects.toThrow('Authentication required');
  });
});
