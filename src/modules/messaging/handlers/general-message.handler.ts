import { Injectable, Logger } from '@nestjs/common';
import { BaseMessageHandler } from './base-message.handler';
import { IMessagePlatform, IncomingMessage, MessageType } from '../abstractions/message-platform.interface';
import { GeminiAiService } from '../../gemini-ai/gemini-ai.service';
import { OnboardingService } from '../../whatsapp/services/onboarding.service';
import { SessionService } from '../../auth/services/session.service';

/**
 * Handles general conversational messages that aren't commands
 */
@Injectable()
export class GeneralMessageHandler extends BaseMessageHandler {
  private readonly logger = new Logger(GeneralMessageHandler.name);
  priority = 50; // Lower priority, handles messages after command handler

  constructor(
    private readonly geminiService: GeminiAiService,
    private readonly onboardingService: OnboardingService,
    private readonly sessionService: SessionService
  ) {
    super();
  }

  canHandle(message: IncomingMessage): boolean {
    // Handle all text and voice messages that aren't handled by other handlers
    return message.type === MessageType.TEXT || message.type === MessageType.VOICE;
  }

  async handle(message: IncomingMessage, platform: IMessagePlatform): Promise<void> {
    try {
      const userId = this.extractPhoneNumber(message.from);
      
      // Check if user needs onboarding
      const session = await this.sessionService.getSession(userId);
      
      if (!session) {
        // User is not linked, provide onboarding
        const onboardingResponse = await this.onboardingService.getWelcomeMessage(userId);
        await this.reply(message, platform, onboardingResponse);
        return;
      }

      // Handle greetings
      if (this.isGreeting(message.content.text)) {
        await this.handleGreeting(message, platform, userId);
        return;
      }

      // Handle general conversation with AI
      await this.handleConversation(message, platform, userId);
      
    } catch (error) {
      this.logger.error('Error handling general message:', error);
      await this.reply(
        message,
        platform,
        "I'm having trouble understanding. Try asking about your balance or sending money!"
      );
    }
  }

  private isGreeting(text?: string): boolean {
    if (!text) return false;
    
    const greetings = [
      'hello', 'hi', 'hey', 'good morning', 'good afternoon', 
      'good evening', 'greetings', 'yo', 'sup', 'wassup',
      'wah gwaan', 'wagwan', 'bless up', 'blessed'
    ];
    
    const lowerText = text.toLowerCase().trim();
    return greetings.some(greeting => lowerText.includes(greeting));
  }

  private async handleGreeting(
    message: IncomingMessage,
    platform: IMessagePlatform,
    userId: string
  ): Promise<void> {
    const greetings = [
      "👋 Hello! I'm Pulse, your Bitcoin wallet assistant. How can I help you today?",
      "Hey there! Ready to manage your Bitcoin? Try 'balance' or 'help' to get started!",
      "Welcome back! What would you like to do today? Send money, check balance, or something else?",
      "Hi! I can help you send money, check your balance, or answer questions about Bitcoin. What do you need?"
    ];
    
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    await this.reply(message, platform, randomGreeting);
  }

  private async handleConversation(
    message: IncomingMessage,
    platform: IMessagePlatform,
    userId: string
  ): Promise<void> {
    const text = message.content.text || '';
    
    // Check if it's a question about the service
    if (this.isServiceQuestion(text)) {
      await this.handleServiceQuestion(message, platform, text);
      return;
    }

    // Use AI for general conversation
    try {
      const aiResponse = await this.geminiService.generateContent(
        this.buildConversationPrompt(text, userId)
      );
      
      await this.reply(message, platform, aiResponse);
    } catch (error) {
      this.logger.error('AI response error:', error);
      
      // Fallback response
      await this.reply(
        message,
        platform,
        "I understand you're trying to tell me something. You can:\n" +
        "• Send money: 'send 50 to John'\n" +
        "• Check balance: 'balance'\n" +
        "• Get help: 'help'\n" +
        "• Request payment: 'request 20 from Sarah'"
      );
    }
  }

  private isServiceQuestion(text: string): boolean {
    const serviceKeywords = [
      'how', 'what', 'when', 'where', 'why', 'can',
      'bitcoin', 'lightning', 'wallet', 'payment',
      'fee', 'cost', 'price', 'rate', 'exchange'
    ];
    
    const lowerText = text.toLowerCase();
    return serviceKeywords.some(keyword => lowerText.includes(keyword));
  }

  private async handleServiceQuestion(
    message: IncomingMessage,
    platform: IMessagePlatform,
    text: string
  ): Promise<void> {
    const lowerText = text.toLowerCase();
    
    // Fee questions
    if (lowerText.includes('fee') || lowerText.includes('cost')) {
      await this.reply(
        message,
        platform,
        "💰 Flash uses the Lightning Network for instant, low-fee transactions. " +
        "Fees are typically less than 1 cent per transaction!"
      );
      return;
    }
    
    // Bitcoin/Lightning questions
    if (lowerText.includes('bitcoin') || lowerText.includes('lightning')) {
      await this.reply(
        message,
        platform,
        "⚡ Flash is a Bitcoin Lightning wallet that lets you send and receive Bitcoin instantly " +
        "through WhatsApp. It's fast, secure, and easy to use!"
      );
      return;
    }
    
    // How to questions
    if (lowerText.includes('how do i') || lowerText.includes('how to')) {
      await this.reply(
        message,
        platform,
        "Here's how to use Flash:\n" +
        "📱 Link account: 'link'\n" +
        "💸 Send money: 'send [amount] to [person]'\n" +
        "💰 Check balance: 'balance'\n" +
        "📥 Request money: 'request [amount] from [person]'\n" +
        "❓ Get help: 'help'"
      );
      return;
    }
    
    // Default to AI response for other questions
    await this.handleConversation(message, platform, this.extractPhoneNumber(message.from));
  }

  private buildConversationPrompt(text: string, userId: string): string {
    return `You are Pulse, a helpful assistant for Flash, a Bitcoin Lightning wallet that works through WhatsApp.
    
User message: "${text}"

Respond helpfully about Bitcoin, Lightning Network, or payments. Keep responses concise (2-3 sentences).
If they're asking about specific commands, mention:
- Send money: "send [amount] to [person]"
- Check balance: "balance"
- Get help: "help"
- Link account: "link"

Be friendly and encouraging about using Bitcoin for payments.`;
  }
}