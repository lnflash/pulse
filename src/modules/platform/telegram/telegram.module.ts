import { Module } from '@nestjs/common';
import { TelegramAdapter } from './adapters/telegram.adapter';
import { TelegramMediaService } from './services/telegram-media.service';

@Module({
  providers: [TelegramAdapter, TelegramMediaService],
  exports: [TelegramAdapter, TelegramMediaService],
})
export class TelegramPlatformModule {}
