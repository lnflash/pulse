import { VoiceHandler } from '../voice.handler';
import { VoicePort } from '../../../../core/ports/voice.port';
import { CommandContext } from '../../../bot-core/types/command-context';
import { ChatId } from '../../../../core/types/chat-id';
import { UserId } from '../../../../core/types/user-id';
import { Platform } from '../../../../core/types/platform';

function createMockVoicePort(): jest.Mocked<VoicePort> {
  return {
    getVoiceConfig: jest.fn(),
    setVoiceMode: jest.fn(),
    selectVoice: jest.fn(),
    listVoices: jest.fn(),
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
      intent: 'MANAGE_VOICE' as any,
      slots,
      confidence: 1,
      rawText: 'voice',
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
      content: { type: 'text' as const, body: 'voice' },
    },
    platform: Platform.WhatsAppCloud,
  };
}

describe('VoiceHandler', () => {
  let handler: VoiceHandler;
  let mockPort: jest.Mocked<VoicePort>;

  beforeEach(() => {
    mockPort = createMockVoicePort();
    handler = new VoiceHandler(mockPort);
  });

  it('should throw when not authenticated', async () => {
    const ctx = createCtx();
    ctx.session.flashAuthToken = undefined;
    await expect(handler.execute(ctx)).rejects.toThrow('Authentication required');
  });

  it('should show voice status by default', async () => {
    const ctx = createCtx();
    mockPort.getVoiceConfig.mockResolvedValue({
      mode: 'on',
      selectedVoice: 'Rachel',
    });

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('Voice Settings');
    expect(text).toContain('🔊 ON');
    expect(text).toContain('Rachel');
  });

  it('should set voice mode to on', async () => {
    const ctx = createCtx({ action: 'on' });
    mockPort.setVoiceMode.mockResolvedValue(undefined);

    const result = await handler.execute(ctx);

    expect(mockPort.setVoiceMode).toHaveBeenCalledWith(ctx.userId, 'on');
    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('Voice Settings Updated');
    expect(text).toContain('Voice ON');
  });

  it('should set voice mode to off', async () => {
    const ctx = createCtx({ action: 'off' });
    mockPort.setVoiceMode.mockResolvedValue(undefined);

    const result = await handler.execute(ctx);

    expect(mockPort.setVoiceMode).toHaveBeenCalledWith(ctx.userId, 'off');
    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('Voice OFF');
  });

  it('should set voice mode to only', async () => {
    const ctx = createCtx({ action: 'only' });
    mockPort.setVoiceMode.mockResolvedValue(undefined);

    const result = await handler.execute(ctx);

    expect(mockPort.setVoiceMode).toHaveBeenCalledWith(ctx.userId, 'only');
    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('Voice ONLY');
  });

  it('should list available voices', async () => {
    const ctx = createCtx({ action: 'list' });
    mockPort.listVoices.mockResolvedValue([
      { name: 'Rachel', voiceId: 'v1', description: 'Warm and friendly' },
      { name: 'Josh', voiceId: 'v2', description: 'Deep and calm' },
    ]);
    mockPort.getVoiceConfig.mockResolvedValue({ mode: 'on', selectedVoice: 'Rachel' });

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('Rachel');
    expect(text).toContain('Josh');
    expect(text).toContain('✅');
    expect(text).toContain('Warm and friendly');
  });

  it('should select a voice by name', async () => {
    const ctx = createCtx({ action: 'select', voiceName: 'Josh' });
    mockPort.listVoices.mockResolvedValue([
      { name: 'Rachel', voiceId: 'v1' },
      { name: 'Josh', voiceId: 'v2' },
    ]);
    mockPort.selectVoice.mockResolvedValue(undefined);

    const result = await handler.execute(ctx);

    expect(mockPort.selectVoice).toHaveBeenCalledWith(ctx.userId, 'Josh', 'v2');
    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('Josh');
  });

  it('should error when selecting unknown voice', async () => {
    const ctx = createCtx({ action: 'select', voiceName: 'Unknown' });
    mockPort.listVoices.mockResolvedValue([{ name: 'Rachel', voiceId: 'v1' }]);

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('not found');
  });

  it('should error when no voice name provided for select', async () => {
    const ctx = createCtx({ action: 'select' });

    const result = await handler.execute(ctx);

    const body = (result.messages[0].content as any).body;
    const text = body.map((s: any) => s.value ?? '').join('');
    expect(text).toContain('Missing voice name');
  });
});
