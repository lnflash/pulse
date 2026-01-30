import { UsernameHandler } from '../username.handler';
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
      intent: 'MANAGE_USERNAME' as any,
      slots: {},
      confidence: 1,
      rawText: 'username',
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
      content: { type: 'text' as const, body: 'username' },
    },
    platform: Platform.WhatsAppCloud,
    ...overrides,
  };
}

describe('UsernameHandler', () => {
  let handler: UsernameHandler;
  let mockWallet: jest.Mocked<WalletPort>;

  beforeEach(() => {
    mockWallet = createMockWallet();
    handler = new UsernameHandler(mockWallet);
  });

  it('should show current username when no args provided', async () => {
    const ctx = createCtx();
    mockWallet.getUserInfo.mockResolvedValue({
      username: 'johndoe',
      lightningAddress: 'johndoe@flashapp.me',
    });

    const result = await handler.execute(ctx);

    expect(mockWallet.getUserInfo).toHaveBeenCalledWith(ctx.userId);
    expect(result.messages).toHaveLength(1);
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'bold', value: '@johndoe' })]),
    );
  });

  it('should show prompt when no username is set', async () => {
    const ctx = createCtx();
    mockWallet.getUserInfo.mockResolvedValue({});

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text', value: expect.stringContaining("haven't set") }),
      ]),
    );
  });

  it('should set username when arg provided', async () => {
    const ctx = createCtx({ slots: { username: 'newuser' } });
    mockWallet.getUserInfo.mockResolvedValue({});
    mockWallet.setUsername.mockResolvedValue(undefined);

    const result = await handler.execute(ctx);

    expect(mockWallet.setUsername).toHaveBeenCalledWith(ctx.userId, 'newuser');
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'bold', value: '@newuser' })]),
    );
  });

  it('should reject username change when already set', async () => {
    const ctx = createCtx({ slots: { username: 'newuser' } });
    mockWallet.getUserInfo.mockResolvedValue({ username: 'existing' });

    const result = await handler.execute(ctx);

    expect(mockWallet.setUsername).not.toHaveBeenCalled();
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('cannot be changed') }),
      ]),
    );
  });

  it('should throw when not authenticated', async () => {
    const ctx = createCtx();
    ctx.session.flashAuthToken = undefined;

    await expect(handler.execute(ctx)).rejects.toThrow('Authentication required');
  });
});
