import { UnlinkAccountHandler } from '../unlink.handler';
import { SessionPort } from '../../../../core/ports/session.port';
import { CommandContext } from '../../../bot-core/types/command-context';
import { ChatId } from '../../../../core/types/chat-id';
import { UserId } from '../../../../core/types/user-id';
import { Platform } from '../../../../core/types/platform';

function createMockSession(): jest.Mocked<SessionPort> {
  return {
    getSession: jest.fn(),
    getOrCreateSession: jest.fn(),
    updateSession: jest.fn(),
    deleteSession: jest.fn(),
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
      intent: 'UNLINK_ACCOUNT' as any,
      slots: {},
      confidence: 1,
      rawText: 'unlink',
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
      content: { type: 'text' as const, body: 'unlink' },
    },
    platform: Platform.WhatsAppCloud,
  };
}

describe('UnlinkAccountHandler', () => {
  let handler: UnlinkAccountHandler;
  let mockSession: jest.Mocked<SessionPort>;

  beforeEach(() => {
    mockSession = createMockSession();
    handler = new UnlinkAccountHandler(mockSession);
  });

  it('should show confirmation prompt when no confirm slot', async () => {
    const ctx = createCtx();

    const result = await handler.execute(ctx);

    expect(mockSession.deleteSession).not.toHaveBeenCalled();
    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('unlink confirm');
  });

  it('should delete session when confirmed', async () => {
    const ctx = createCtx({ confirm: 'confirm' });
    mockSession.deleteSession.mockResolvedValue(undefined);

    const result = await handler.execute(ctx);

    expect(mockSession.deleteSession).toHaveBeenCalledWith(ctx.userId);
    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('disconnected');
  });

  it('should throw when not authenticated', async () => {
    const ctx = createCtx({ confirm: 'confirm' });
    ctx.session.flashAuthToken = undefined;

    await expect(handler.execute(ctx)).rejects.toThrow('Authentication required');
  });
});
