import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { Message, Update } from 'telegraf/types';
import axios from 'axios';
import { MESSAGE_TRANSPORT } from '../../../../core/ports/tokens';
import { MessageTransport } from '../../../../core/ports/message-transport.port';
import {
  InboundMessage,
  OutboundMessage,
  FormattedText,
  Platform,
  ActorId,
  ChatId,
} from '../../../../core/types';

@Injectable()
export class TelegramAdapter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramAdapter.name);
  private bot: Telegraf | null = null;
  private readonly enabled: boolean;
  private readonly botToken: string;
  private readonly webhookUrl: string | undefined;

  constructor(
    private readonly config: ConfigService,
    @Inject(MESSAGE_TRANSPORT) private readonly transport: MessageTransport,
  ) {
    this.botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN') || '';
    this.webhookUrl = this.config.get<string>('TELEGRAM_WEBHOOK_URL');
    this.enabled = !!this.botToken;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('Telegram adapter disabled - TELEGRAM_BOT_TOKEN not set');
      return;
    }

    this.bot = new Telegraf(this.botToken);
    this.setupInboundHandlers();
    this.transport.onOutbound(this.handleOutbound.bind(this));

    if (this.webhookUrl) {
      await this.bot.telegram.setWebhook(this.webhookUrl);
      this.logger.log('Telegram adapter started (webhook mode)');
    } else {
      this.bot.launch().catch((err) => this.logger.error('Polling error', err));
      this.logger.log('Telegram adapter started (polling mode)');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.bot) {
      this.bot.stop('SIGTERM');
    }
  }

  /** Process webhook update (used when in webhook mode) */
  async handleWebhookUpdate(update: Update): Promise<void> {
    if (!this.bot) return;
    await this.bot.handleUpdate(update);
  }

  private setupInboundHandlers(): void {
    if (!this.bot) return;

    this.bot.on(message('text'), (ctx) => this.onText(ctx));
    this.bot.on(message('voice'), (ctx) => this.onVoice(ctx));
    this.bot.on(message('photo'), (ctx) => this.onPhoto(ctx));
    this.bot.on(message('document'), (ctx) => this.onDocument(ctx));
    this.bot.on('callback_query', (ctx) => this.onCallbackQuery(ctx));

    this.bot.catch((err: any) => this.logger.error('Telegraf error', err));
  }

  // ── Inbound translators ──────────────────────────────────────────

  private async onText(ctx: any): Promise<void> {
    const msg: Message.TextMessage = ctx.message;
    const inbound = this.buildInbound(ctx, {
      type: 'text',
      body: msg.text,
    });
    await this.transport.publishInbound(inbound);
  }

  private async onVoice(ctx: any): Promise<void> {
    const msg: Message.VoiceMessage = ctx.message;
    const inbound = this.buildInbound(ctx, {
      type: 'voice',
      mediaRef: msg.voice.file_id,
      mimeType: msg.voice.mime_type,
    });
    await this.transport.publishInbound(inbound);
  }

  private async onPhoto(ctx: any): Promise<void> {
    const msg: Message.PhotoMessage = ctx.message;
    const largest = msg.photo[msg.photo.length - 1];
    const inbound = this.buildInbound(ctx, {
      type: 'image',
      mediaRef: largest.file_id,
      caption: msg.caption,
    });
    await this.transport.publishInbound(inbound);
  }

  private async onDocument(ctx: any): Promise<void> {
    const msg: Message.DocumentMessage = ctx.message;
    const inbound = this.buildInbound(ctx, {
      type: 'document',
      mediaRef: msg.document.file_id,
      filename: msg.document.file_name,
      mimeType: msg.document.mime_type,
    });
    await this.transport.publishInbound(inbound);
  }

  private async onCallbackQuery(ctx: any): Promise<void> {
    const cb = ctx.callbackQuery;
    if (!cb || !('data' in cb)) return;

    const inbound = this.buildInbound(ctx, {
      type: 'button_response',
      buttonId: cb.data,
      buttonText: cb.data,
    });
    await this.transport.publishInbound(inbound);
    await ctx.answerCbQuery();
  }

  private buildInbound(ctx: any, content: any): InboundMessage {
    const from: ActorId = {
      platform: Platform.Telegram,
      platformUserId: String(ctx.from?.id ?? ''),
      displayName: ctx.from?.first_name,
    };

    const chatId = ctx.chat?.id ?? ctx.from?.id;
    const chat: ChatId = {
      platform: Platform.Telegram,
      platformChatId: String(chatId),
      isGroup: ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup',
    };

    return {
      id: String(ctx.message?.message_id ?? ctx.callbackQuery?.id ?? Date.now()),
      from,
      chat,
      timestamp: new Date((ctx.message?.date ?? Math.floor(Date.now() / 1000)) * 1000),
      content,
      replyTo: ctx.message?.reply_to_message
        ? String(ctx.message.reply_to_message.message_id)
        : undefined,
    };
  }

  // ── Outbound translator ──────────────────────────────────────────

  private async handleOutbound(outbound: OutboundMessage): Promise<void> {
    if (outbound.to.platform !== Platform.Telegram || !this.bot) return;

    const chatId = outbound.to.platformChatId;

    switch (outbound.content.type) {
      case 'text': {
        const text = this.formatText(outbound.content.body);
        const keyboard = outbound.content.buttons?.length
          ? {
              reply_markup: {
                inline_keyboard: [
                  outbound.content.buttons.map((b) => ({
                    text: b.label,
                    callback_data: b.id,
                  })),
                ],
              },
            }
          : {};
        await this.bot.telegram.sendMessage(chatId, text, {
          parse_mode: 'HTML',
          ...keyboard,
        });
        break;
      }
      case 'image':
        await this.bot.telegram.sendPhoto(chatId, outbound.content.mediaRef, {
          caption: outbound.content.caption ? this.formatText(outbound.content.caption) : undefined,
          parse_mode: 'HTML',
        });
        break;
      case 'voice':
        await this.bot.telegram.sendVoice(chatId, outbound.content.mediaRef);
        break;
      case 'document':
        await this.bot.telegram.sendDocument(chatId, outbound.content.mediaRef, {
          caption: outbound.content.filename,
        });
        break;
      case 'typing':
        await this.bot.telegram.sendChatAction(chatId, 'typing');
        break;
    }
  }

  private formatText(segments: FormattedText): string {
    return segments
      .map((seg) => {
        switch (seg.type) {
          case 'text':
            return this.escapeHtml(seg.value);
          case 'bold':
            return `<b>${this.escapeHtml(seg.value)}</b>`;
          case 'italic':
            return `<i>${this.escapeHtml(seg.value)}</i>`;
          case 'code':
            return `<code>${this.escapeHtml(seg.value)}</code>`;
          case 'newline':
            return '\n';
          case 'link':
            return seg.label ? `<a href="${seg.url}">${this.escapeHtml(seg.label)}</a>` : seg.url;
          default:
            return '';
        }
      })
      .join('');
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Media handling ───────────────────────────────────────────────

  async downloadMedia(fileId: string): Promise<Buffer> {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }

    const fileLink = await this.bot.telegram.getFileLink(fileId);
    const response = await axios.get(fileLink.href, {
      responseType: 'arraybuffer',
    });

    return Buffer.from(response.data);
  }

  async uploadMedia(buffer: Buffer, mimeType: string, filename?: string): Promise<string> {
    // Telegram doesn't have a separate upload endpoint
    // Media is uploaded when sending messages
    // Return a data URL that can be used with InputFile
    const base64 = buffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  }
}
