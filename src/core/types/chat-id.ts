import { IsEnum, IsString, IsBoolean, validateSync } from 'class-validator';
import { Platform } from './platform';

export class ChatId {
  @IsEnum(Platform)
  platform!: Platform;

  @IsString()
  platformChatId!: string;

  @IsBoolean()
  isGroup!: boolean;

  static create(data: Partial<ChatId>): ChatId {
    const chat = Object.assign(new ChatId(), data);
    const errors = validateSync(chat);
    if (errors.length > 0) {
      throw new Error(`ChatId validation failed: ${JSON.stringify(errors)}`);
    }
    return chat;
  }
}
