import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import axios from 'axios';

@Injectable()
export class TelegramMediaService {
  private readonly logger = new Logger(TelegramMediaService.name);
  private bot: Telegraf | null = null;
  private readonly botToken: string;

  constructor(private readonly config: ConfigService) {
    this.botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN') || '';
    if (this.botToken) {
      this.bot = new Telegraf(this.botToken);
    }
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }

    try {
      const fileLink = await this.bot.telegram.getFileLink(fileId);
      const response = await axios.get(fileLink.href, {
        responseType: 'arraybuffer',
      });

      return Buffer.from(response.data);
    } catch (error) {
      this.logger.error(`Failed to download file ${fileId}:`, error);
      throw error;
    }
  }

  async getFileInfo(fileId: string): Promise<{ file_path: string; file_size: number }> {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }

    try {
      const file = await this.bot.telegram.getFile(fileId);
      return {
        file_path: file.file_path || '',
        file_size: file.file_size || 0,
      };
    } catch (error) {
      this.logger.error(`Failed to get file info for ${fileId}:`, error);
      throw error;
    }
  }

  createDataUrl(buffer: Buffer, mimeType: string): string {
    const base64 = buffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  }

  isEnabled(): boolean {
    return !!this.bot;
  }
}
