import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../core/types';
import { CommandContext } from '../../bot-core/types/command-context';
import { HandlerResult } from '../../bot-core/types/handler-result';
import { VoicePort } from '../../../core/ports/voice.port';
import { FormattedText } from '../../../core/types/messages';

@Injectable()
@IntentHandler(Intent.ManageVoice)
export class VoiceHandler extends CommandHandler {
  constructor(@Inject('VoicePort') private readonly voice: VoicePort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    const action = ctx.slots.action ?? 'status';

    switch (action) {
      case 'on':
      case 'off':
      case 'only':
        return this.handleSetMode(ctx, action);
      case 'list':
        return this.handleList(ctx);
      case 'select':
        return this.handleSelect(ctx);
      case 'status':
      case 'help':
      default:
        return this.handleStatus(ctx);
    }
  }

  private async handleSetMode(
    ctx: CommandContext,
    mode: 'on' | 'off' | 'only',
  ): Promise<HandlerResult> {
    await this.voice.setVoiceMode(ctx.userId, mode);

    const modeLabels: Record<string, string> = {
      on: "🔊 Voice ON — You'll get text + voice replies",
      off: '🔇 Voice OFF — Text only',
      only: '🎧 Voice ONLY — Replies as voice notes',
    };

    const body: FormattedText = [
      { type: 'bold', value: '🎙️ Voice Settings Updated' },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'text', value: modeLabels[mode] },
    ];

    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }

  private async handleList(ctx: CommandContext): Promise<HandlerResult> {
    const voices = await this.voice.listVoices();
    const config = await this.voice.getVoiceConfig(ctx.userId);

    const body: FormattedText = [
      { type: 'bold', value: '🎙️ Available Voices' },
      { type: 'newline' },
    ];

    if (voices.length === 0) {
      body.push({ type: 'newline' });
      body.push({ type: 'text', value: 'No voices configured.' });
    } else {
      for (const v of voices) {
        const selected = config.selectedVoice === v.name ? ' ✅' : '';
        body.push({ type: 'newline' });
        body.push({ type: 'text', value: `• ` });
        body.push({ type: 'bold', value: v.name });
        body.push({ type: 'text', value: selected });
        if (v.description) {
          body.push({ type: 'text', value: ` — ${v.description}` });
        }
        body.push({ type: 'newline' });
      }
    }

    body.push({ type: 'newline' });
    body.push({ type: 'text', value: 'Select: ' });
    body.push({ type: 'code', value: 'voice select <name>' });

    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }

  private async handleSelect(ctx: CommandContext): Promise<HandlerResult> {
    const { voiceName, voiceId } = ctx.slots;

    if (!voiceName) {
      const body: FormattedText = [
        { type: 'bold', value: '❌ Missing voice name' },
        { type: 'newline' },
        { type: 'newline' },
        { type: 'text', value: 'Usage: ' },
        { type: 'code', value: 'voice select <name>' },
        { type: 'newline' },
        { type: 'text', value: 'See available: ' },
        { type: 'code', value: 'voice list' },
      ];
      return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
    }

    let resolvedId = voiceId;
    if (!resolvedId) {
      const voices = await this.voice.listVoices();
      const match = voices.find((v) => v.name.toLowerCase() === voiceName.toLowerCase());
      if (!match) {
        return {
          messages: [
            this.reply(
              `Voice "${voiceName}" not found. Use "voice list" to see available voices.`,
              ctx,
            ),
          ],
        };
      }
      resolvedId = match.voiceId;
    }

    await this.voice.selectVoice(ctx.userId, voiceName, resolvedId);

    const body: FormattedText = [
      { type: 'text', value: '✅ Voice set to ' },
      { type: 'bold', value: voiceName },
    ];

    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }

  private async handleStatus(ctx: CommandContext): Promise<HandlerResult> {
    const config = await this.voice.getVoiceConfig(ctx.userId);

    const modeEmoji: Record<string, string> = {
      on: '🔊 ON',
      off: '🔇 OFF',
      only: '🎧 ONLY',
    };

    const body: FormattedText = [
      { type: 'bold', value: '🎙️ Voice Settings' },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'text', value: `Mode: ${modeEmoji[config.mode] ?? config.mode}` },
      { type: 'newline' },
      {
        type: 'text',
        value: `Voice: ${config.selectedVoice ?? 'Default'}`,
      },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'bold', value: 'Commands:' },
      { type: 'newline' },
      { type: 'text', value: '• ' },
      { type: 'code', value: 'voice on/off/only' },
      { type: 'text', value: ' — Set mode' },
      { type: 'newline' },
      { type: 'text', value: '• ' },
      { type: 'code', value: 'voice list' },
      { type: 'text', value: ' — Available voices' },
      { type: 'newline' },
      { type: 'text', value: '• ' },
      { type: 'code', value: 'voice select <name>' },
      { type: 'text', value: ' — Choose voice' },
    ];

    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }
}
