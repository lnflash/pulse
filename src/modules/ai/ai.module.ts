import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { ConversationService, AI_CONVERSATION_PORT } from './services/conversation.service';

@Module({
  imports: [ConfigModule],
  providers: [
    GeminiAdapter,
    {
      provide: AI_CONVERSATION_PORT,
      useExisting: GeminiAdapter,
    },
    ConversationService,
  ],
  exports: [ConversationService, AI_CONVERSATION_PORT],
})
export class AiModule {}
