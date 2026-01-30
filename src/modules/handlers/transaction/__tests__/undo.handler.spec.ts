import { UndoHandler } from '../undo.handler';
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
      intent: 'UNDO_TRANSACTION' as any,
      slots: {},
      confidence: 1,
      rawText: 'undo',
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
      content: { type: 'text' as const, body: 'undo' },
    },
    platform: Platform.WhatsAppCloud,
    ...overrides,
  };
}

describe('UndoHandler', () => {
  let handler: UndoHandler;
  let mockWallet: jest.Mocked<WalletPort>;

  beforeEach(() => {
    mockWallet = createMockWallet();
    handler = new UndoHandler(mockWallet);
  });

  it('should show success when undo succeeds', async () => {
    const ctx = createCtx();
    mockWallet.undoLastTransaction.mockResolvedValue({
      success: true,
      message: 'Reversed 100 USD to alice',
      transactionId: 'tx-rev-1',
    });

    const result = await handler.execute(ctx);

    expect(mockWallet.undoLastTransaction).toHaveBeenCalledWith(ctx.userId);
    expect(result.messages).toHaveLength(1);
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'bold', value: 'Transaction reversed!' }),
      ]),
    );
    expect(body).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'code', value: 'tx-rev-1' })]),
    );
  });

  it('should show failure when no transaction to undo', async () => {
    const ctx = createCtx();
    mockWallet.undoLastTransaction.mockResolvedValue({
      success: false,
      message: 'No recent transaction to undo or time window expired.',
    });

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'bold', value: 'Cannot undo' })]),
    );
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('time window') }),
      ]),
    );
  });

  it('should throw when not authenticated', async () => {
    const ctx = createCtx();
    ctx.session.flashAuthToken = undefined;

    await expect(handler.execute(ctx)).rejects.toThrow('Authentication required');
  });
});
