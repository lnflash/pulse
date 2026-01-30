import { HistoryHandler } from '../history.handler';
import { WalletPort, TransactionRecord } from '../../../../core/ports/wallet.port';
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
      intent: 'VIEW_HISTORY' as any,
      slots: {},
      confidence: 1,
      rawText: 'history',
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
      content: { type: 'text' as const, body: 'history' },
    },
    platform: Platform.WhatsAppCloud,
    ...overrides,
  };
}

describe('HistoryHandler', () => {
  let handler: HistoryHandler;
  let mockWallet: jest.Mocked<WalletPort>;

  beforeEach(() => {
    mockWallet = createMockWallet();
    handler = new HistoryHandler(mockWallet);
  });

  it('should show transaction list when no transactionId slot', async () => {
    const ctx = createCtx();
    const txs: TransactionRecord[] = [
      {
        id: 'tx-1',
        type: 'send',
        amount: 100,
        currency: 'USD',
        counterparty: 'alice',
        status: 'completed',
        createdAt: new Date(),
      },
      {
        id: 'tx-2',
        type: 'receive',
        amount: 50,
        currency: 'USD',
        status: 'completed',
        createdAt: new Date(),
      },
    ];
    mockWallet.getTransactionHistory.mockResolvedValue(txs);

    const result = await handler.execute(ctx);

    expect(mockWallet.getTransactionHistory).toHaveBeenCalledWith(ctx.userId, 10);
    expect(result.messages).toHaveLength(1);
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'bold', value: '📋 Recent Transactions' }),
      ]),
    );
  });

  it('should show empty message when no transactions', async () => {
    const ctx = createCtx();
    mockWallet.getTransactionHistory.mockResolvedValue([]);

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('No transactions') }),
      ]),
    );
  });

  it('should show transaction detail when transactionId provided', async () => {
    const ctx = createCtx({ slots: { transactionId: 'tx-123' } });
    const tx: TransactionRecord = {
      id: 'tx-123',
      type: 'send',
      amount: 200,
      currency: 'USD',
      counterparty: 'bob',
      memo: 'lunch',
      status: 'completed',
      createdAt: new Date(),
    };
    mockWallet.getTransaction.mockResolvedValue(tx);

    const result = await handler.execute(ctx);

    expect(mockWallet.getTransaction).toHaveBeenCalledWith(ctx.userId, 'tx-123');
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'bold', value: '200 USD' })]),
    );
  });

  it('should show not found when transaction does not exist', async () => {
    const ctx = createCtx({ slots: { transactionId: 'tx-404' } });
    mockWallet.getTransaction.mockResolvedValue(null);

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('not found') }),
      ]),
    );
  });

  it('should throw when not authenticated', async () => {
    const ctx = createCtx();
    ctx.session.flashAuthToken = undefined;

    await expect(handler.execute(ctx)).rejects.toThrow('Authentication required');
  });
});
