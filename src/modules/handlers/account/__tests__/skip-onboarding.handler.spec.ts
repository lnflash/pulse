import { SkipOnboardingHandler } from '../skip-onboarding.handler';
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

function createCtx(): CommandContext {
  const userId = UserId.generate();
  const chat = ChatId.create({
    platform: Platform.WhatsAppCloud,
    platformChatId: 'chat-1',
    isGroup: false,
  });
  return {
    intent: {
      kind: 'core' as const,
      intent: 'SKIP_ONBOARDING' as any,
      slots: {},
      confidence: 1,
      rawText: 'skip',
    },
    slots: {},
    userId,
    session: { userId, lastActivity: new Date() },
    chat,
    inboundMessage: {
      id: 'msg-1',
      from: { platform: Platform.WhatsAppCloud, platformId: '123' } as any,
      chat,
      timestamp: new Date(),
      content: { type: 'text' as const, body: 'skip' },
    },
    platform: Platform.WhatsAppCloud,
  };
}

describe('SkipOnboardingHandler', () => {
  let handler: SkipOnboardingHandler;
  let mockSession: jest.Mocked<SessionPort>;

  beforeEach(() => {
    mockSession = createMockSession();
    handler = new SkipOnboardingHandler(mockSession);
  });

  it('should mark onboarding as skipped', async () => {
    const ctx = createCtx();
    mockSession.updateSession.mockResolvedValue(undefined);

    const result = await handler.execute(ctx);

    expect(mockSession.updateSession).toHaveBeenCalledWith(ctx.userId, {
      onboardingSkipped: true,
    });
    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('Onboarding skipped');
    expect(text).toContain('help');
  });

  it('should work without authentication (no auth required)', async () => {
    const ctx = createCtx();
    mockSession.updateSession.mockResolvedValue(undefined);

    const result = await handler.execute(ctx);

    expect(result.messages).toHaveLength(1);
  });
});
