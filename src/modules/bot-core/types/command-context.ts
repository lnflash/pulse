import { IntentResult, UserId, ChatId, InboundMessage, Platform } from '../../../core/types';
import { Session } from '../../../core/ports/session.port';

export interface CommandContext {
  intent: IntentResult;
  slots: Record<string, string>;
  userId: UserId;
  session: Session;
  chat: ChatId;
  inboundMessage: InboundMessage;
  platform: Platform;
}
