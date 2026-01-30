export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIConversationPort {
  /**
   * Generate a conversational response given a prompt and message history.
   */
  respond(prompt: string, history: ConversationMessage[]): Promise<string>;
}
