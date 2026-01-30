import { Module } from '@nestjs/common';
import { ConversationService } from './services/conversation.service';

@Module({
  providers: [ConversationService],
  exports: [ConversationService],
})
export class AiModule {}
