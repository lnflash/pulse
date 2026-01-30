import { SaveContactVCardHandler } from '../save-vcard.handler';
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
    payInvoice: jest.fn(),
    decodeInvoice: jest.fn(),
    confirmPendingPayment: jest.fn(),
    requestPayment: jest.fn(),
    clearBalanceCache: jest.fn(),
  };
}

function createCtx(slots: Record<string, string> = {}): CommandContext {
  const userId = UserId.generate();
  const chat = ChatId.create({
    platform: Platform.WhatsAppCloud,
    platformChatId: 'chat-1',
    isGroup: false,
  });
  return {
    intent: {
      kind: 'core' as const,
      intent: 'SAVE_CONTACT_VCARD' as any,
      slots: {},
      confidence: 1,
      rawText: '',
    },
    slots,
    userId,
    session: { userId, flashAuthToken: 'token-abc', lastActivity: new Date() },
    chat,
    inboundMessage: {
      id: 'msg-1',
      from: { platform: Platform.WhatsAppCloud, platformId: '123' } as any,
      chat,
      timestamp: new Date(),
      content: { type: 'text' as const, body: '' },
    },
    platform: Platform.WhatsAppCloud,
  };
}

describe('SaveContactVCardHandler', () => {
  let handler: SaveContactVCardHandler;
  let mockWallet: jest.Mocked<WalletPort>;

  beforeEach(() => {
    mockWallet = createMockWallet();
    handler = new SaveContactVCardHandler(mockWallet);
  });

  it('should save contact from vCard slots', async () => {
    const ctx = createCtx({ name: 'Alice', phone: '+1234567890' });
    mockWallet.addContact.mockResolvedValue({
      name: 'Alice',
      phone: '+1234567890',
      source: 'vcard',
      addedAt: new Date(),
    });

    const result = await handler.execute(ctx);

    expect(mockWallet.addContact).toHaveBeenCalledWith(ctx.userId, 'Alice', '+1234567890');
    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('Alice');
    expect(text).toContain('Contact saved');
  });

  it('should return error when name or phone missing', async () => {
    const ctx = createCtx({});

    const result = await handler.execute(ctx);

    expect(mockWallet.addContact).not.toHaveBeenCalled();
    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('Could not extract');
  });

  it('should throw when not authenticated', async () => {
    const ctx = createCtx({ name: 'Alice', phone: '+1234567890' });
    ctx.session.flashAuthToken = undefined;

    await expect(handler.execute(ctx)).rejects.toThrow('Authentication required');
  });
});
