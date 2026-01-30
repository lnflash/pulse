import { Module } from '@nestjs/common';
import { TelegramAdapter } from './adapters/telegram.adapter';

@Module({
  providers: [TelegramAdapter],
  exports: [TelegramAdapter],
})
export class TelegramModule {}
