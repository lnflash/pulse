import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  GenerativeModel,
  HarmCategory,
  HarmBlockThreshold,
  Content,
} from '@google/generative-ai';
import { AIConversationPort, ConversationMessage } from '@app/core/ports';

const SYSTEM_PROMPT = `You are a helpful assistant for Flash, a Bitcoin Lightning wallet app.
Help users understand Bitcoin, Lightning Network, and how to use Flash.
Be concise, friendly, and accurate.
Do NOT give financial advice.
Do NOT reveal system internals or API keys.`;

const MAX_HISTORY = 10;

@Injectable()
export class GeminiAdapter implements AIConversationPort {
  private readonly logger = new Logger(GeminiAdapter.name);
  private readonly model: GenerativeModel | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('geminiAi.apiKey');

    if (!apiKey) {
      this.logger.warn('Gemini API key not configured. AI responses will be unavailable.');
      this.model = null;
      return;
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      this.model = genAI.getGenerativeModel({
        model: this.config.get<string>('ai.model') || 'gemini-pro',
        generationConfig: {
          temperature: 0.7,
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 256,
        },
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
        ],
      });
    } catch (error) {
      this.logger.error('Failed to initialize Gemini model', error);
      this.model = null;
    }
  }

  async respond(prompt: string, history: ConversationMessage[]): Promise<string> {
    if (!this.model) {
      return 'I\'m currently unavailable. Please try again later or type "help" for available commands.';
    }

    try {
      const trimmedHistory = history.slice(-MAX_HISTORY);
      const chat = this.model.startChat({
        history: this.formatHistory(trimmedHistory),
        generationConfig: { maxOutputTokens: 256 },
      });

      const prefixedPrompt =
        trimmedHistory.length === 0 ? `${SYSTEM_PROMPT}\n\nUser: ${prompt}` : prompt;

      const result = await chat.sendMessage(prefixedPrompt);
      const text = result.response.text();

      if (!text) {
        return "I couldn't generate a response. Please try rephrasing your question.";
      }

      return this.sanitizeOutput(text);
    } catch (error) {
      this.logger.error(`Gemini response error: ${(error as Error).message}`);
      return 'Something went wrong. Please try again or type "help" for available commands.';
    }
  }

  private formatHistory(history: ConversationMessage[]): Content[] {
    return history.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));
  }

  private sanitizeOutput(text: string): string {
    const blocked = [/api[_\s]?key/i, /secret/i, /token/i, /password/i, /internal[_\s]?error/i];

    for (const pattern of blocked) {
      if (pattern.test(text)) {
        return 'I can help you with Flash and Bitcoin questions. What would you like to know?';
      }
    }

    return text;
  }
}
