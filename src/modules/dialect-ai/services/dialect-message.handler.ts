import { Injectable, Logger } from '@nestjs/common';
import { BaseMessageHandler } from '../../messaging/handlers/base-message.handler';
import { 
  IMessagePlatform, 
  IncomingMessage, 
  MessageType 
} from '../../messaging/abstractions/message-platform.interface';
import { ConversationManagerService } from './conversation-manager.service';
import { EnhancedPaymentFlowService } from './enhanced-payment-flow.service';
import { SessionService } from '../../auth/services/session.service';

/**
 * Dialect-aware message handler that uses the platform abstraction
 * This handler processes messages with Caribbean dialect understanding
 */
@Injectable()
export class DialectMessageHandler extends BaseMessageHandler {
  private readonly logger = new Logger(DialectMessageHandler.name);
  priority = 5; // Very high priority - processes before command handler

  constructor(
    private readonly conversationManager: ConversationManagerService,
    private readonly paymentFlowService: EnhancedPaymentFlowService,
    private readonly sessionService: SessionService
  ) {
    super();
  }

  canHandle(message: IncomingMessage): boolean {
    // Handle text and voice messages with dialect processing
    return (
      message.type === MessageType.TEXT || 
      message.type === MessageType.VOICE
    ) && !message.metadata?.fromMe;
  }

  async handle(message: IncomingMessage, platform: IMessagePlatform): Promise<void> {
    const startTime = Date.now();
    
    try {
      const userId = this.extractPhoneNumber(message.from);
      
      this.logger.debug(`Processing message with dialect AI from ${userId}`);

      // Get or create session
      const session = await this.sessionService.getSession(userId);

      // Determine message content and type
      let messageContent: string | Buffer;
      let messageType: 'text' | 'voice';

      if (message.type === MessageType.VOICE && message.content.voice) {
        messageContent = message.content.voice;
        messageType = 'voice';
      } else if (message.content.text) {
        messageContent = message.content.text;
        messageType = 'text';
      } else {
        this.logger.warn('Message has no processable content');
        return;
      }

      // Process with conversation manager (dialect AI)
      const response = await this.conversationManager.processMessage(
        userId,
        messageContent,
        messageType
      );

      // Handle the response based on intent
      await this.handleDialectResponse(
        message,
        platform,
        response,
        userId,
        session
      );

      // Log processing metrics
      const processingTime = Date.now() - startTime;
      this.logger.debug(
        `Dialect message processed in ${processingTime}ms - ` +
        `Dialect: ${response.dialect}, Intent: ${response.intent}, Confidence: ${response.confidence}`
      );

    } catch (error) {
      this.logger.error('Error in dialect message handling:', error);
      
      // Send error response in standard English
      await this.reply(
        message,
        platform,
        "Sorry, I'm having trouble understanding. Please try again or type 'help' for assistance."
      );
    }
  }

  private async handleDialectResponse(
    message: IncomingMessage,
    platform: IMessagePlatform,
    response: any,
    userId: string,
    session: any
  ): Promise<void> {
    // Check if we need to execute a payment command
    if (response.intent === 'sendFunds' && !response.needsConfirmation) {
      const pendingTx = this.conversationManager.getPendingTransaction(userId);
      
      if (pendingTx?.confirmed) {
        // Execute the payment
        const paymentResult = await this.paymentFlowService.handleSendFunds(
          userId,
          {
            amount: pendingTx.amount,
            recipient: pendingTx.recipient,
            currency: pendingTx.currency
          },
          {
            dialect: response.dialect,
            lastIntent: 'sendFunds',
            conversationHistory: [],
            preferences: {},
            lastActivity: new Date()
          }
        );
        
        response.response = paymentResult.message;
        
        // Add suggested actions if available
        if (paymentResult.suggestedActions) {
          response.suggestedActions = paymentResult.suggestedActions;
        }
      }
    } else if (response.intent === 'checkBalance' && session) {
      // Execute balance check
      const balanceResult = await this.paymentFlowService.handleCheckBalance(
        userId,
        {
          dialect: response.dialect,
          lastIntent: 'checkBalance',
          conversationHistory: [],
          preferences: {},
          lastActivity: new Date()
        }
      );
      
      response.response = balanceResult.message;
    } else if (response.intent === 'linkAccount' && !session) {
      // Generate linking instructions
      response.response += "\n\n📱 To link your account, use the 'link' command.";
    }

    // Send the response
    if (response.voiceResponse && response.voice) {
      // Send voice response
      await this.reply(message, platform, {
        text: response.response,
        voice: response.voice
      });
    } else {
      // Send text response
      await this.reply(message, platform, response.response);
    }

    // Send suggested actions as buttons if platform supports it
    if (response.suggestedActions && (platform as any).sendButtons) {
      await this.sendSuggestedActions(
        message,
        platform,
        response.suggestedActions
      );
    }
  }

  private async sendSuggestedActions(
    message: IncomingMessage,
    platform: any,
    actions: string[]
  ): Promise<void> {
    // If platform supports buttons, send them
    if (platform.sendButtons) {
      const buttons = actions.map((action, index) => ({
        id: `action_${index}`,
        text: action,
        type: 'reply' as const
      }));

      await platform.sendButtons(
        message.from,
        "What would you like to do next?",
        buttons
      );
    }
  }

  /**
   * Check if this message should be handled by dialect AI
   */
  private shouldUseDialectAI(text: string): boolean {
    // Skip if it's a clear command prefix
    if (text.startsWith('/') || text.startsWith('!') || text.startsWith('.')) {
      return false;
    }

    // Use dialect AI for natural language
    return true;
  }

  /**
   * Get user's preferred language/dialect for responses
   */
  private getUserDialect(userId: string): string {
    return this.conversationManager.getUserDialect(userId);
  }
}