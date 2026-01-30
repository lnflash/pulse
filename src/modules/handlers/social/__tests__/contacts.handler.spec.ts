import { ContactsHandler } from '../contacts.handler';
import { WalletPort, Contact, ContactHistoryEntry } from '../../../../core/ports/wallet.port';
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
      intent: 'MANAGE_CONTACTS' as any,
      slots: {},
      confidence: 1,
      rawText: 'contacts',
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
      content: { type: 'text' as const, body: 'contacts' },
    },
    platform: Platform.WhatsAppCloud,
    ...overrides,
  };
}

describe('ContactsHandler', () => {
  let handler: ContactsHandler;
  let mockWallet: jest.Mocked<WalletPort>;

  beforeEach(() => {
    mockWallet = createMockWallet();
    handler = new ContactsHandler(mockWallet);
  });

  it('should list contacts', async () => {
    const contacts: Contact[] = [
      { name: 'Alice', phone: '+1234567890', source: 'manual', addedAt: new Date() },
      { name: 'Bob', username: 'bob', source: 'vcard', addedAt: new Date() },
    ];
    mockWallet.getContacts.mockResolvedValue(contacts);
    const ctx = createCtx({ slots: { action: 'list' } });

    const result = await handler.execute(ctx);

    expect(mockWallet.getContacts).toHaveBeenCalledWith(ctx.userId);
    expect(result.messages).toHaveLength(1);
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'bold', value: '📇 Your Contacts' }),
      ]),
    );
  });

  it('should show empty message when no contacts', async () => {
    mockWallet.getContacts.mockResolvedValue([]);
    const ctx = createCtx();

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('No contacts') }),
      ]),
    );
  });

  it('should add a contact', async () => {
    const contact: Contact = {
      name: 'Alice',
      phone: '+1234',
      source: 'manual',
      addedAt: new Date(),
    };
    mockWallet.addContact.mockResolvedValue(contact);
    const ctx = createCtx({ slots: { action: 'add', name: 'Alice', phone: '+1234' } });

    const result = await handler.execute(ctx);

    expect(mockWallet.addContact).toHaveBeenCalledWith(ctx.userId, 'Alice', '+1234');
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('added') }),
      ]),
    );
  });

  it('should error when adding without name', async () => {
    const ctx = createCtx({ slots: { action: 'add' } });

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('provide a contact name') }),
      ]),
    );
  });

  it('should remove a contact', async () => {
    mockWallet.removeContact.mockResolvedValue(true);
    const ctx = createCtx({ slots: { action: 'remove', name: 'Alice' } });

    const result = await handler.execute(ctx);

    expect(mockWallet.removeContact).toHaveBeenCalledWith(ctx.userId, 'Alice');
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('removed') }),
      ]),
    );
  });

  it('should show not found when removing non-existent contact', async () => {
    mockWallet.removeContact.mockResolvedValue(false);
    const ctx = createCtx({ slots: { action: 'remove', name: 'Ghost' } });

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('not found') }),
      ]),
    );
  });

  it('should view contact history', async () => {
    const history: ContactHistoryEntry[] = [
      { type: 'send', amount: 100, currency: 'USD', date: new Date() },
      { type: 'receive', amount: 50, currency: 'USD', date: new Date(), memo: 'thanks' },
    ];
    mockWallet.getContactHistory.mockResolvedValue(history);
    const ctx = createCtx({ slots: { action: 'history', name: 'Alice' } });

    const result = await handler.execute(ctx);

    expect(mockWallet.getContactHistory).toHaveBeenCalledWith(ctx.userId, 'Alice');
    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'bold',
          value: expect.stringContaining('Payment History'),
        }),
      ]),
    );
  });

  it('should show empty history message', async () => {
    mockWallet.getContactHistory.mockResolvedValue([]);
    const ctx = createCtx({ slots: { action: 'history', name: 'Bob' } });

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining('No payment history') }),
      ]),
    );
  });

  it('should throw when not authenticated', async () => {
    const ctx = createCtx();
    ctx.session.flashAuthToken = undefined;

    await expect(handler.execute(ctx)).rejects.toThrow('Authentication required');
  });
});
