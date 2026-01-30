import { Inject, Injectable, Logger } from '@nestjs/common';
import { AIConversationPort, ConversationMessage } from '@app/core/ports';

const MAX_HISTORY = 10;
const AI_CONVERSATION_PORT = 'AI_CONVERSATION_PORT';

export interface ConversationState {
  history: ConversationMessage[];
}

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private readonly conversations = new Map<string, ConversationState>();

  constructor(
    @Inject(AI_CONVERSATION_PORT)
    private readonly aiAdapter: AIConversationPort,
  ) {}

  async chat(userId: string, message: string): Promise<string> {
    const state = this.getOrCreateState(userId);

    state.history.push({ role: 'user', content: message });

    const trimmedHistory = state.history.slice(-MAX_HISTORY);

    try {
      const response = await this.aiAdapter.respond(message, trimmedHistory);

      state.history.push({ role: 'assistant', content: response });
      this.trimHistory(state);

      return response;
    } catch (error) {
      this.logger.error(`Conversation error for user ${userId}: ${(error as Error).message}`);
      return 'Something went wrong. Please try again.';
    }
  }

  getHistory(userId: string): ConversationMessage[] {
    return this.conversations.get(userId)?.history ?? [];
  }

  clearHistory(userId: string): void {
    this.conversations.delete(userId);
  }

  private getOrCreateState(userId: string): ConversationState {
    let state = this.conversations.get(userId);
    if (!state) {
      state = { history: [] };
      this.conversations.set(userId, state);
    }
    return state;
  }

  private trimHistory(state: ConversationState): void {
    if (state.history.length > MAX_HISTORY) {
      state.history = state.history.slice(-MAX_HISTORY);
    }
  }
}

export { AI_CONVERSATION_PORT };
