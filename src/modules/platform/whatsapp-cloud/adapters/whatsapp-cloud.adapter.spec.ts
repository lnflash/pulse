import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WhatsAppCloudAdapter } from './whatsapp-cloud.adapter';
import { MESSAGE_TRANSPORT } from '../../../queue/queue.module';
import { Platform } from '../../../../core/types';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WhatsAppCloudAdapter', () => {
  let adapter: WhatsAppCloudAdapter;
  let mockTransport: { publishInbound: jest.Mock };

  beforeEach(async () => {
    mockTransport = { publishInbound: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppCloudAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                'whatsapp.accessToken': 'test-token',
                'whatsapp.phoneNumberId': '123456',
              };
              return config[key];
            }),
          },
        },
        { provide: MESSAGE_TRANSPORT, useValue: mockTransport },
      ],
    }).compile();

    adapter = module.get(WhatsAppCloudAdapter);
  });

  afterEach(() => jest.clearAllMocks());

  const makeWebhookPayload = (message: any, contactName = 'Test User') => ({
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ profile: { name: contactName } }],
              messages: [message],
            },
          },
        ],
      },
    ],
  });

  describe('handleWebhook', () => {
    it('should handle text messages', async () => {
      const payload = makeWebhookPayload({
        id: 'msg1',
        from: '5511999999999',
        timestamp: '1700000000',
        type: 'text',
        text: { body: 'Hello' },
      });

      await adapter.handleWebhook(payload);

      expect(mockTransport.publishInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'msg1',
          content: { type: 'text', body: 'Hello' },
        }),
      );
    });

    it('should handle image messages', async () => {
      const payload = makeWebhookPayload({
        id: 'msg2',
        from: '5511999999999',
        timestamp: '1700000000',
        type: 'image',
        image: { id: 'media-123', caption: 'A photo', mime_type: 'image/jpeg' },
      });

      await adapter.handleWebhook(payload);

      expect(mockTransport.publishInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          content: {
            type: 'image',
            mediaRef: 'media-123',
            caption: 'A photo',
            mimeType: 'image/jpeg',
          },
        }),
      );
    });

    it('should handle voice messages', async () => {
      const payload = makeWebhookPayload({
        id: 'msg3',
        from: '5511999999999',
        timestamp: '1700000000',
        type: 'voice',
        voice: { id: 'media-456', mime_type: 'audio/ogg' },
      });

      await adapter.handleWebhook(payload);

      expect(mockTransport.publishInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          content: {
            type: 'voice',
            mediaRef: 'media-456',
            mimeType: 'audio/ogg',
          },
        }),
      );
    });

    it('should handle audio messages as voice', async () => {
      const payload = makeWebhookPayload({
        id: 'msg3b',
        from: '5511999999999',
        timestamp: '1700000000',
        type: 'audio',
        audio: { id: 'media-789', mime_type: 'audio/mpeg' },
      });

      await adapter.handleWebhook(payload);

      expect(mockTransport.publishInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          content: {
            type: 'voice',
            mediaRef: 'media-789',
            mimeType: 'audio/mpeg',
          },
        }),
      );
    });

    it('should handle document messages', async () => {
      const payload = makeWebhookPayload({
        id: 'msg4',
        from: '5511999999999',
        timestamp: '1700000000',
        type: 'document',
        document: { id: 'media-doc', filename: 'report.pdf', mime_type: 'application/pdf' },
      });

      await adapter.handleWebhook(payload);

      expect(mockTransport.publishInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          content: {
            type: 'document',
            mediaRef: 'media-doc',
            filename: 'report.pdf',
            mimeType: 'application/pdf',
          },
        }),
      );
    });

    it('should handle video messages as image type', async () => {
      const payload = makeWebhookPayload({
        id: 'msg5',
        from: '5511999999999',
        timestamp: '1700000000',
        type: 'video',
        video: { id: 'media-vid', caption: 'A video', mime_type: 'video/mp4' },
      });

      await adapter.handleWebhook(payload);

      expect(mockTransport.publishInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          content: {
            type: 'image',
            mediaRef: 'media-vid',
            caption: 'A video',
            mimeType: 'video/mp4',
          },
        }),
      );
    });

    it('should ignore unsupported message types', async () => {
      const payload = makeWebhookPayload({
        id: 'msg6',
        from: '5511999999999',
        timestamp: '1700000000',
        type: 'sticker',
        sticker: { id: 'sticker-1' },
      });

      await adapter.handleWebhook(payload);

      expect(mockTransport.publishInbound).not.toHaveBeenCalled();
    });

    it('should handle empty payload gracefully', async () => {
      await adapter.handleWebhook({});
      expect(mockTransport.publishInbound).not.toHaveBeenCalled();
    });
  });

  describe('downloadMedia', () => {
    it('should fetch media metadata then download binary', async () => {
      const mediaBuffer = Buffer.from('fake-image-data');
      mockedAxios.get
        .mockResolvedValueOnce({ data: { url: 'https://media.example.com/file' } })
        .mockResolvedValueOnce({ data: mediaBuffer });

      const result = await adapter.downloadMedia('media-123');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://graph.facebook.com/v18.0/media-123',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        }),
      );
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://media.example.com/file',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
          responseType: 'arraybuffer',
        }),
      );
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should propagate errors on download failure', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(adapter.downloadMedia('bad-id')).rejects.toThrow('Network error');
    });
  });

  describe('uploadMedia', () => {
    it('should upload media and return media id', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'uploaded-media-id' } });

      const result = await adapter.uploadMedia(Buffer.from('data'), 'image/jpeg');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v18.0/123456/media',
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
      expect(result).toBe('uploaded-media-id');
    });

    it('should propagate errors on upload failure', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Upload failed'));

      await expect(adapter.uploadMedia(Buffer.from('data'), 'image/png')).rejects.toThrow(
        'Upload failed',
      );
    });
  });

  describe('send', () => {
    it('should send text messages', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: {} });

      await adapter.send({
        to: { platform: Platform.WhatsAppCloud, platformChatId: '5511999999999', isGroup: false },
        content: {
          type: 'text',
          body: [{ type: 'text', value: 'Hello' }],
        },
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v18.0/123456/messages',
        expect.objectContaining({
          messaging_product: 'whatsapp',
          type: 'text',
          text: { body: 'Hello' },
        }),
        expect.anything(),
      );
    });

    it('should send image messages', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: {} });

      await adapter.send({
        to: { platform: Platform.WhatsAppCloud, platformChatId: '5511999999999', isGroup: false },
        content: {
          type: 'image',
          mediaRef: 'media-img-1',
          caption: [{ type: 'text', value: 'A caption' }],
        },
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'image',
          image: { id: 'media-img-1', caption: 'A caption' },
        }),
        expect.anything(),
      );
    });

    it('should send voice messages as audio', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: {} });

      await adapter.send({
        to: { platform: Platform.WhatsAppCloud, platformChatId: '5511999999999', isGroup: false },
        content: { type: 'voice', mediaRef: 'media-voice-1' },
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'audio',
          audio: { id: 'media-voice-1' },
        }),
        expect.anything(),
      );
    });

    it('should send document messages', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: {} });

      await adapter.send({
        to: { platform: Platform.WhatsAppCloud, platformChatId: '5511999999999', isGroup: false },
        content: { type: 'document', mediaRef: 'media-doc-1', filename: 'report.pdf' },
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'document',
          document: { id: 'media-doc-1', filename: 'report.pdf' },
        }),
        expect.anything(),
      );
    });

    it('should skip typing indicator messages', async () => {
      await adapter.send({
        to: { platform: Platform.WhatsAppCloud, platformChatId: '5511999999999', isGroup: false },
        content: { type: 'typing' },
      });

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });
});
