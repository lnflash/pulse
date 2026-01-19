import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramService } from './services/telegram.service';
import { TelegramKeyboardService } from './services/telegram-keyboard.service';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { FlashApiModule } from '../flash-api/flash-api.module';
import { GeminiAiModule } from '../gemini-ai/gemini-ai.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
    AuthModule,
    FlashApiModule,
    GeminiAiModule,
    forwardRef(() => WhatsappModule),
  ],
  providers: [TelegramService, TelegramKeyboardService],
  exports: [TelegramService, TelegramKeyboardService],
})
export class TelegramModule {}
