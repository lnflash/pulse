import { TemplateHandler } from '../template.handler';
import { TemplatePort } from '../../../../core/ports/template.port';
import { CommandContext } from '../../../bot-core/types/command-context';
import { ChatId } from '../../../../core/types/chat-id';
import { UserId } from '../../../../core/types/user-id';
import { Platform } from '../../../../core/types/platform';

function createMockTemplatePort(): jest.Mocked<TemplatePort> {
  return {
    listTemplates: jest.fn(),
    addTemplate: jest.fn(),
    removeTemplate: jest.fn(),
    getTemplate: jest.fn(),
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
      intent: 'MANAGE_TEMPLATE' as any,
      slots,
      confidence: 1,
      rawText: 'template',
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
      content: { type: 'text' as const, body: 'template' },
    },
    platform: Platform.WhatsAppCloud,
  };
}

describe('TemplateHandler', () => {
  let handler: TemplateHandler;
  let mockPort: jest.Mocked<TemplatePort>;

  beforeEach(() => {
    mockPort = createMockTemplatePort();
    handler = new TemplateHandler(mockPort);
  });

  it('should throw when not authenticated', async () => {
    const ctx = createCtx();
    ctx.session.flashAuthToken = undefined;
    await expect(handler.execute(ctx)).rejects.toThrow('Authentication required');
  });

  it('should list templates', async () => {
    const ctx = createCtx({ action: 'list' });
    mockPort.listTemplates.mockResolvedValue([
      { name: 'coffee', amount: 500, recipient: '@barista', createdAt: new Date() },
      {
        name: 'rent',
        amount: 100000,
        recipient: '@landlord',
        memo: 'monthly',
        createdAt: new Date(),
      },
    ]);

    const result = await handler.execute(ctx);

    expect(result.messages).toHaveLength(1);
    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('coffee');
    expect(text).toContain('@barista');
    expect(text).toContain('rent');
    expect(text).toContain('monthly');
  });

  it('should show empty state when no templates', async () => {
    const ctx = createCtx();
    mockPort.listTemplates.mockResolvedValue([]);

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('No templates saved');
  });

  it('should add a template', async () => {
    const ctx = createCtx({
      action: 'add',
      name: 'coffee',
      amount: '500',
      recipient: '@barista',
      memo: 'morning brew',
    });
    mockPort.addTemplate.mockResolvedValue({
      name: 'coffee',
      amount: 500,
      recipient: '@barista',
      memo: 'morning brew',
      createdAt: new Date(),
    });

    const result = await handler.execute(ctx);

    expect(mockPort.addTemplate).toHaveBeenCalledWith(ctx.userId, {
      name: 'coffee',
      amount: 500,
      recipient: '@barista',
      memo: 'morning brew',
    });
    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('Template saved');
    expect(text).toContain('coffee');
  });

  it('should show error when add fields missing', async () => {
    const ctx = createCtx({ action: 'add', name: 'coffee' });

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('Missing fields');
  });

  it('should remove a template', async () => {
    const ctx = createCtx({ action: 'remove', name: 'coffee' });
    mockPort.removeTemplate.mockResolvedValue(true);

    const result = await handler.execute(ctx);

    expect(mockPort.removeTemplate).toHaveBeenCalledWith(ctx.userId, 'coffee');
    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('removed');
  });

  it('should handle removing nonexistent template', async () => {
    const ctx = createCtx({ action: 'remove', name: 'nope' });
    mockPort.removeTemplate.mockResolvedValue(false);

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('not found');
  });
});
