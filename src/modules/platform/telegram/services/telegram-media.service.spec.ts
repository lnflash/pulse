import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TelegramMediaService } from './telegram-media.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('telegraf', () => {
  return {
    Telegraf: jest.fn().mockImplementation(() => ({
      telegram: {
        getFile: jest.fn(),
        getFileLink: jest.fn(),
      },
    })),
  };
});

describe('TelegramMediaService', () => {
  let service: TelegramMediaService;
  let bot: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramMediaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'TELEGRAM_BOT_TOKEN') return 'test-token';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(TelegramMediaService);
    const { Telegraf } = require('telegraf');
    bot = Telegraf.mock.results[0]?.value;
  });

  afterEach(() => jest.clearAllMocks());

  describe('downloadFile', () => {
    it('should download file from Telegram', async () => {
      const fileBuffer = Buffer.from('fake-file-data');
      bot.telegram.getFileLink.mockResolvedValueOnce({
        href: 'https://api.telegram.org/file/bot-token/file-path',
      });
      mockedAxios.get.mockResolvedValueOnce({ data: fileBuffer });

      const result = await service.downloadFile('file-123');

      expect(bot.telegram.getFileLink).toHaveBeenCalledWith('file-123');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.telegram.org/file/bot-token/file-path',
        { responseType: 'arraybuffer' },
      );
      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe('fake-file-data');
    });

    it('should throw error if bot not initialized', async () => {
      const uninitializedService = new TelegramMediaService({
        get: jest.fn(() => ''),
      } as any);

      await expect(uninitializedService.downloadFile('file-123')).rejects.toThrow(
        'Telegram bot not initialized',
      );
    });

    it('should propagate download errors', async () => {
      bot.telegram.getFileLink.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.downloadFile('bad-file')).rejects.toThrow('Network error');
    });
  });

  describe('getFileInfo', () => {
    it('should get file metadata', async () => {
      bot.telegram.getFile.mockResolvedValueOnce({
        file_path: 'photos/file.jpg',
        file_size: 12345,
      });

      const result = await service.getFileInfo('file-456');

      expect(bot.telegram.getFile).toHaveBeenCalledWith('file-456');
      expect(result).toEqual({
        file_path: 'photos/file.jpg',
        file_size: 12345,
      });
    });

    it('should handle missing file_path and file_size', async () => {
      bot.telegram.getFile.mockResolvedValueOnce({});

      const result = await service.getFileInfo('file-789');

      expect(result).toEqual({
        file_path: '',
        file_size: 0,
      });
    });

    it('should throw error if bot not initialized', async () => {
      const uninitializedService = new TelegramMediaService({
        get: jest.fn(() => ''),
      } as any);

      await expect(uninitializedService.getFileInfo('file-123')).rejects.toThrow(
        'Telegram bot not initialized',
      );
    });

    it('should propagate getFile errors', async () => {
      bot.telegram.getFile.mockRejectedValueOnce(new Error('File not found'));

      await expect(service.getFileInfo('missing-file')).rejects.toThrow('File not found');
    });
  });

  describe('createDataUrl', () => {
    it('should create data URL from buffer', () => {
      const buffer = Buffer.from('test data');
      const result = service.createDataUrl(buffer, 'image/jpeg');

      expect(result).toBe('data:image/jpeg;base64,dGVzdCBkYXRh');
    });

    it('should handle different mime types', () => {
      const buffer = Buffer.from('audio data');
      const result = service.createDataUrl(buffer, 'audio/ogg');

      expect(result).toBe('data:audio/ogg;base64,YXVkaW8gZGF0YQ==');
    });
  });

  describe('isEnabled', () => {
    it('should return true when bot is initialized', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('should return false when bot token is missing', () => {
      const uninitializedService = new TelegramMediaService({
        get: jest.fn(() => ''),
      } as any);

      expect(uninitializedService.isEnabled()).toBe(false);
    });
  });
});
