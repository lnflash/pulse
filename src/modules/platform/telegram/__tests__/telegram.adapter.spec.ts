import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TelegramAdapter } from '../adapters/telegram.adapter';
import { MESSAGE_TRANSPORT } from '../../../queue/queue.module';
import { Platform } from '../../../../core/types';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('telegraf', () => {
  const handlers: Record<string, Function> = {};
  return {
    Telegraf: jest.fn().mockImplementation(() => ({
      on: jest.fn((event: string, handler: Function) => {
        handlers[event] = handler;
      }),
      catch: jest.fn(),
      launch: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      handleUpdate: jest.fn(),
      telegram: {
        setWebhook: jest.fn(),
        sendMessage: jest.fn().mockResolvedValue({}),
        sendPhoto: jest.fn().mockResolvedValue({}),
        sendVoice: jest.fn().mockResolvedValue({}),
        sendDocument: jest.fn().mockResolvedValue({}),
        sendChatAction: jest.fn().mockResolvedValue({}),
        getFileLink: jest.fn().mockResolvedValue({ href: 'https://api.telegram.org/file/test' }),
      },
      _handlers: handlers,
    })),
  };
});

jest.mock('telegraf/filters', () => ({
  message: (type: string) => `message:${type}`,
}));

describe('TelegramAdapter', () => {
  let adapter: TelegramAdapter;
  let mockTransport: {
    publishInbound: jest.Mock;
    onInbound: jest.Mock;
    publishOutbound: jest.Mock;
    onOutbound: jest.Mock;
  };
  let bot: any;

  beforeEach(async () => {
    mockTransport = {
      publishInbound: jest.fn(),
      onInbound: jest.fn(),
      publishOutbound: jest.fn(),
      onOutbound: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'TELEGRAM_BOT_TOKEN') return 'test-token';
              return undefined;
            }),
          },
        },
        { provide: MESSAGE_TRANSPORT, useValue: mockTransport },
      ],
    }).compile();

    adapter = module.get(TelegramAdapter);
    await adapter.onModuleInit();

    const { Telegraf } = require('telegraf');
    bot = Telegraf.mock.results[0]?.value;
  });

  afterEach(() => jest.clearAllMocks());

  const makeCtx = (overrides: any = {}) => ({
    from: { id: 12345, first_name: 'Alice' },
    chat: { id: 67890, type: 'private' },
    message: { message_id: 1, date: 1700000000, ...overrides.message },
    callbackQuery: overrides.callbackQuery,
    answerCbQuery: jest.fn(),
  });

  describe('onModuleInit', () => {
    it('should register outbound handler', () => {
      expect(mockTransport.onOutbound).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should launch bot in polling mode', () => {
      expect(bot.launch).toHaveBeenCalled();
    });
  });

  describe('inbound: text', () => {
    it('should translate text message to InboundMessage', async () => {
      const handler = bot.on.mock.calls.find((c: any[]) => c[0] === 'message:text')?.[1];
      expect(handler).toBeDefined();

      const ctx = makeCtx({ message: { message_id: 1, date: 1700000000, text: 'Hello' } });
      await handler(ctx);

      expect(mockTransport.publishInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          from: expect.objectContaining({
            platform: Platform.Telegram,
            platformUserId: '12345',
          }),
          chat: expect.objectContaining({
            platform: Platform.Telegram,
            platformChatId: '67890',
            isGroup: false,
          }),
          content: { type: 'text', body: 'Hello' },
        }),
      );
    });
  });

  describe('inbound: voice', () => {
    it('should translate voice message', async () => {
      const handler = bot.on.mock.calls.find((c: any[]) => c[0] === 'message:voice')?.[1];
      const ctx = makeCtx({
        message: {
          message_id: 2,
          date: 1700000000,
          voice: { file_id: 'voice-123', mime_type: 'audio/ogg' },
        },
      });
      await handler(ctx);

      expect(mockTransport.publishInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          content: { type: 'voice', mediaRef: 'voice-123', mimeType: 'audio/ogg' },
        }),
      );
    });
  });

  describe('inbound: photo', () => {
    it('should use largest photo and extract caption', async () => {
      const handler = bot.on.mock.calls.find((c: any[]) => c[0] === 'message:photo')?.[1];
      const ctx = makeCtx({
        message: {
          message_id: 3,
          date: 1700000000,
          photo: [
            { file_id: 'small', width: 100, height: 100 },
            { file_id: 'large', width: 800, height: 600 },
          ],
          caption: 'My photo',
        },
      });
      await handler(ctx);

      expect(mockTransport.publishInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          content: { type: 'image', mediaRef: 'large', caption: 'My photo' },
        }),
      );
    });
  });

  describe('inbound: document', () => {
    it('should translate document message', async () => {
      const handler = bot.on.mock.calls.find((c: any[]) => c[0] === 'message:document')?.[1];
      const ctx = makeCtx({
        message: {
          message_id: 4,
          date: 1700000000,
          document: { file_id: 'doc-1', file_name: 'report.pdf', mime_type: 'application/pdf' },
        },
      });
      await handler(ctx);

      expect(mockTransport.publishInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          content: {
            type: 'document',
            mediaRef: 'doc-1',
            filename: 'report.pdf',
            mimeType: 'application/pdf',
          },
        }),
      );
    });
  });

  describe('inbound: callback_query (button response)', () => {
    it('should translate callback query to button_response', async () => {
      const handler = bot.on.mock.calls.find((c: any[]) => c[0] === 'callback_query')?.[1];
      const ctx = makeCtx({
        callbackQuery: { id: 'cb-1', data: 'action_confirm' },
      });
      await handler(ctx);

      expect(mockTransport.publishInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          content: {
            type: 'button_response',
            buttonId: 'action_confirm',
            buttonText: 'action_confirm',
          },
        }),
      );
      expect(ctx.answerCbQuery).toHaveBeenCalled();
    });
  });

  describe('outbound: text with buttons', () => {
    it('should send text with inline keyboard', async () => {
      const outboundHandler = mockTransport.onOutbound.mock.calls[0][0];

      await outboundHandler({
        to: { platform: Platform.Telegram, platformChatId: '67890', isGroup: false },
        content: {
          type: 'text',
          body: [{ type: 'text', value: 'Choose' }],
          buttons: [
            { id: 'yes', label: 'Yes' },
            { id: 'no', label: 'No' },
          ],
        },
      });

      expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
        '67890',
        'Choose',
        expect.objectContaining({
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Yes', callback_data: 'yes' },
                { text: 'No', callback_data: 'no' },
              ],
            ],
          },
        }),
      );
    });
  });

  describe('outbound: formatted text', () => {
    it('should render HTML formatting', async () => {
      const outboundHandler = mockTransport.onOutbound.mock.calls[0][0];

      await outboundHandler({
        to: { platform: Platform.Telegram, platformChatId: '67890', isGroup: false },
        content: {
          type: 'text',
          body: [
            { type: 'bold', value: 'Title' },
            { type: 'newline' },
            { type: 'italic', value: 'sub' },
            { type: 'text', value: ' <safe>' },
            { type: 'code', value: 'x=1' },
            { type: 'link', url: 'https://example.com', label: 'Link' },
          ],
        },
      });

      expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
        '67890',
        '<b>Title</b>\n<i>sub</i> &lt;safe&gt;<code>x=1</code><a href="https://example.com">Link</a>',
        expect.objectContaining({ parse_mode: 'HTML' }),
      );
    });
  });

  describe('outbound: image', () => {
    it('should send photo with caption', async () => {
      const outboundHandler = mockTransport.onOutbound.mock.calls[0][0];

      await outboundHandler({
        to: { platform: Platform.Telegram, platformChatId: '67890', isGroup: false },
        content: {
          type: 'image',
          mediaRef: 'photo-1',
          caption: [{ type: 'text', value: 'A photo' }],
        },
      });

      expect(bot.telegram.sendPhoto).toHaveBeenCalledWith('67890', 'photo-1', {
        caption: 'A photo',
        parse_mode: 'HTML',
      });
    });
  });

  describe('outbound: voice', () => {
    it('should send voice', async () => {
      const outboundHandler = mockTransport.onOutbound.mock.calls[0][0];

      await outboundHandler({
        to: { platform: Platform.Telegram, platformChatId: '67890', isGroup: false },
        content: { type: 'voice', mediaRef: 'voice-out-1' },
      });

      expect(bot.telegram.sendVoice).toHaveBeenCalledWith('67890', 'voice-out-1');
    });
  });

  describe('outbound: typing', () => {
    it('should send chat action', async () => {
      const outboundHandler = mockTransport.onOutbound.mock.calls[0][0];

      await outboundHandler({
        to: { platform: Platform.Telegram, platformChatId: '67890', isGroup: false },
        content: { type: 'typing' },
      });

      expect(bot.telegram.sendChatAction).toHaveBeenCalledWith('67890', 'typing');
    });
  });

  describe('outbound: ignores other platforms', () => {
    it('should skip non-Telegram messages', async () => {
      const outboundHandler = mockTransport.onOutbound.mock.calls[0][0];

      await outboundHandler({
        to: { platform: Platform.WhatsAppCloud, platformChatId: '999', isGroup: false },
        content: { type: 'text', body: [{ type: 'text', value: 'Hi' }] },
      });

      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('group detection', () => {
    it('should detect group chats', async () => {
      const handler = bot.on.mock.calls.find((c: any[]) => c[0] === 'message:text')?.[1];
      const ctx = {
        ...makeCtx({ message: { message_id: 10, date: 1700000000, text: 'group msg' } }),
        chat: { id: 111, type: 'supergroup' },
      };
      await handler(ctx);

      expect(mockTransport.publishInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          chat: expect.objectContaining({ isGroup: true }),
        }),
      );
    });
  });

  describe('downloadMedia', () => {
    it('should download file from Telegram', async () => {
      const fileBuffer = Buffer.from('fake-file-data');
      bot.telegram.getFileLink.mockResolvedValueOnce({
        href: 'https://api.telegram.org/file/bot-token/file-path',
      });
      mockedAxios.get.mockResolvedValueOnce({ data: fileBuffer });

      const result = await adapter.downloadMedia('file-123');

      expect(bot.telegram.getFileLink).toHaveBeenCalledWith('file-123');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.telegram.org/file/bot-token/file-path',
        { responseType: 'arraybuffer' },
      );
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should propagate download errors', async () => {
      bot.telegram.getFileLink.mockRejectedValueOnce(new Error('Network error'));

      await expect(adapter.downloadMedia('bad-file')).rejects.toThrow('Network error');
    });
  });

  describe('uploadMedia', () => {
    it('should create data URL from buffer', async () => {
      const buffer = Buffer.from('test data');
      const result = await adapter.uploadMedia(buffer, 'image/jpeg', 'test.jpg');

      expect(result).toBe('data:image/jpeg;base64,dGVzdCBkYXRh');
    });

    it('should handle different mime types', async () => {
      const buffer = Buffer.from('audio data');
      const result = await adapter.uploadMedia(buffer, 'audio/ogg');

      expect(result).toBe('data:audio/ogg;base64,YXVkaW8gZGF0YQ==');
    });
  });
});
