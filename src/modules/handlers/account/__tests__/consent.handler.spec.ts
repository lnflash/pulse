import { ConsentHandler } from '../consent.handler';
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
    getPrice: jest.fn(),
    getUserInfo: jest.fn(),
    setUsername: jest.fn(),
    setConsent: jest.fn(),
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
      intent: 'MANAGE_CONSENT' as any,
      slots: {},
      confidence: 1,
      rawText: 'consent',
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
      content: { type: 'text' as const, body: 'consent' },
    },
    platform: Platform.WhatsAppCloud,
  };
}

describe('ConsentHandler', () => {
  let handler: ConsentHandler;
  let mockWallet: jest.Mocked<WalletPort>;

  beforeEach(() => {
    mockWallet = createMockWallet();
    handler = new ConsentHandler(mockWallet);
  });

  it('should enable consent when choice is yes', async () => {
    const ctx = createCtx({ choice: 'yes' });
    mockWallet.setConsent.mockResolvedValue(undefined);

    const result = await handler.execute(ctx);

    expect(mockWallet.setConsent).toHaveBeenCalledWith(ctx.userId, true);
    const body = (result.messages[0].content as any).body;
    const textValues = body.map((s: any) => s.value ?? '').join('');
    expect(textValues).toContain('enabled');
  });

  it('should disable consent when choice is no', async () => {
    const ctx = createCtx({ choice: 'no' });
    mockWallet.setConsent.mockResolvedValue(undefined);

    const result = await handler.execute(ctx);

    expect(mockWallet.setConsent).toHaveBeenCalledWith(ctx.userId, false);
    const body = (result.messages[0].content as any).body;
    const textValues = body.map((s: any) => s.value ?? '').join('');
    expect(textValues).toContain('disabled');
  });

  it('should prompt when no choice provided', async () => {
    const ctx = createCtx();

    const result = await handler.execute(ctx);

    expect(mockWallet.setConsent).not.toHaveBeenCalled();
    const body = (result.messages[0].content as any).body;
    const textValues = body.map((s: any) => s.value ?? '').join('');
    expect(textValues).toContain('consent yes');
    expect(textValues).toContain('consent no');
  });

  it('should throw when not authenticated', async () => {
    const ctx = createCtx({ choice: 'yes' });
    ctx.session.flashAuthToken = undefined;

    await expect(handler.execute(ctx)).rejects.toThrow('Authentication required');
  });
});
