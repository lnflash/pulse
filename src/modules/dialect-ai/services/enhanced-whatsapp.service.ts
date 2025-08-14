import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { WhatsappService } from '../../whatsapp/services/whatsapp.service';
import { ConversationManagerService, ConversationResponse } from './conversation-manager.service';
import { EnhancedPaymentFlowService } from './enhanced-payment-flow.service';
import { IntentRecognizerService } from './intent-recognizer.service';
import { SessionService } from '../../auth/services/session.service';
import { FlashApiService } from '../../flash-api/flash-api.service';
import { TtsService } from '../../tts/tts.service';
import { WhisperService } from '../../speech/whisper.service';

export interface EnhancedMessageData {
  from: string;
  text?: string;
  voice?: Buffer;
  messageId: string;
  timestamp: string;
  name?: string;
  isVoiceCommand?: boolean;
  whatsappId?: string;
  isGroup?: boolean;
  groupId?: string;
  instancePhone?: string;
  messageType?: 'text' | 'voice' | 'image';
}

@Injectable()
export class EnhancedWhatsappService {
  private readonly logger = new Logger(EnhancedWhatsappService.name);
  private readonly dialectFeatureEnabled = true;

  constructor(
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsappService: WhatsappService,
    private readonly conversationManager: ConversationManagerService,
    private readonly paymentFlowService: EnhancedPaymentFlowService,
    private readonly intentRecognizer: IntentRecognizerService,
    private readonly sessionService: SessionService,
    private readonly flashApiService: FlashApiService,
    private readonly ttsService: TtsService,
    private readonly whisperService: WhisperService
  ) {}

  /**
   * Process incoming message with dialect AI enhancement
   */
  async processEnhancedMessage(
    messageData: EnhancedMessageData
  ): Promise<string | { text: string; voice?: Buffer; media?: Buffer }> {
    const startTime = Date.now();
    
    try {
      const whatsappId = messageData.whatsappId || this.extractWhatsappId(messageData.from);
      
      // Log incoming message
      this.logger.debug(`Processing enhanced message from ${whatsappId}`);
      
      // Check if dialect processing is enabled
      if (!this.dialectFeatureEnabled) {
        // Fall back to original WhatsApp service
        return await this.fallbackToOriginal(messageData);
      }

      // Get or create session
      const session = await this.sessionService.getSession(whatsappId);
      
      // Handle voice messages
      let messageContent: string | Buffer = messageData.text || '';
      let messageType: 'text' | 'voice' = 'text';
      
      if (messageData.voice) {
        messageContent = messageData.voice;
        messageType = 'voice';
      } else if (messageData.isVoiceCommand && messageData.text) {
        // Already transcribed voice
        messageType = 'voice';
      }

      // Process with conversation manager
      const response = await this.conversationManager.processMessage(
        whatsappId,
        messageContent,
        messageType
      );

      // Handle based on intent and confidence
      const result = await this.handleConversationResponse(
        whatsappId,
        response,
        session
      );

      // Log processing time
      const processingTime = Date.now() - startTime;
      this.logger.debug(`Enhanced message processed in ${processingTime}ms`);
      
      // Track analytics
      await this.trackInteraction(whatsappId, response, processingTime);

      return result;

    } catch (error) {
      this.logger.error('Error in enhanced message processing:', error);
      
      // Fall back to original processing on error
      return await this.fallbackToOriginal(messageData);
    }
  }

  /**
   * Handle conversation response based on intent
   */
  private async handleConversationResponse(
    whatsappId: string,
    response: ConversationResponse,
    session: any
  ): Promise<string | { text: string; voice?: Buffer }> {
    
    // Check if we need to execute a command
    if (response.intent === 'sendFunds' && !response.needsConfirmation) {
      // Get pending transaction from conversation manager
      const pendingTx = this.conversationManager.getPendingTransaction(whatsappId);
      
      if (pendingTx?.confirmed) {
        // Execute the payment
        const paymentResult = await this.paymentFlowService.handleSendFunds(
          whatsappId,
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
      }
    } else if (response.intent === 'checkBalance') {
      // Execute balance check
      const balanceResult = await this.paymentFlowService.handleCheckBalance(
        whatsappId,
        {
          dialect: response.dialect,
          lastIntent: 'checkBalance',
          conversationHistory: [],
          preferences: {},
          lastActivity: new Date()
        }
      );
      
      response.response = balanceResult.message;
    } else if (response.intent === 'linkAccount' && session === null) {
      // Initiate account linking
      const linkingUrl = await this.generateAccountLinkingUrl(whatsappId);
      response.response += `\n\nClick here to link your account: ${linkingUrl}`;
    }

    // Generate voice response if needed
    if (response.voiceResponse || await this.shouldSendVoice(whatsappId)) {
      const voiceBuffer = await this.generateVoiceResponse(
        response.response,
        response.dialect
      );
      
      return {
        text: response.response,
        voice: voiceBuffer
      };
    }

    return response.response;
  }

  /**
   * Fall back to original WhatsApp service
   */
  private async fallbackToOriginal(
    messageData: EnhancedMessageData
  ): Promise<string | { text: string; voice?: Buffer; media?: Buffer }> {
    this.logger.debug('Falling back to original WhatsApp service');
    
    // Convert to format expected by original service
    const originalData = {
      from: messageData.from,
      text: messageData.text || '',
      messageId: messageData.messageId,
      timestamp: messageData.timestamp,
      name: messageData.name,
      isVoiceCommand: messageData.isVoiceCommand,
      whatsappId: messageData.whatsappId,
      isGroup: messageData.isGroup,
      groupId: messageData.groupId,
      instancePhone: messageData.instancePhone,
      messageType: messageData.messageType
    };
    
    return await this.whatsappService.processCloudMessage(originalData);
  }

  /**
   * Generate voice response
   */
  private async generateVoiceResponse(
    text: string,
    dialect: string
  ): Promise<Buffer> {
    try {
      // Map dialect to language code
      const languageMap: Record<string, string> = {
        jamaican: 'en-JM',
        trinidadian: 'en-TT',
        barbadian: 'en-BB',
        haitian: 'ht',
        guyanese: 'en-GY',
        standard: 'en-US'
      };
      
      const languageCode = languageMap[dialect] || 'en-US';
      
      // Generate TTS with appropriate accent/language
      const audioBuffer = await this.ttsService.textToSpeech(
        text,
        languageCode,
        'enhanced'
      );
      
      return audioBuffer;
    } catch (error) {
      this.logger.error('Error generating voice response:', error);
      // Return empty buffer on error
      return Buffer.from([]);
    }
  }

  /**
   * Check if voice should be sent
   */
  private async shouldSendVoice(whatsappId: string): Promise<boolean> {
    try {
      // Check user preferences
      const voiceMode = await this.ttsService.shouldSendVoiceOnly(whatsappId);
      return voiceMode;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate account linking URL
   */
  private async generateAccountLinkingUrl(whatsappId: string): Promise<string> {
    // Generate a secure token for linking
    const token = Buffer.from(whatsappId).toString('base64url');
    const baseUrl = process.env.APP_URL || 'https://flash.app';
    
    return `${baseUrl}/link?token=${token}&source=whatsapp`;
  }

  /**
   * Track interaction for analytics
   */
  private async trackInteraction(
    whatsappId: string,
    response: ConversationResponse,
    processingTime: number
  ): Promise<void> {
    try {
      const analyticsData = {
        userId: whatsappId,
        dialect: response.dialect,
        intent: response.intent,
        confidence: response.confidence,
        processingTime,
        timestamp: new Date().toISOString(),
        needsConfirmation: response.needsConfirmation
      };
      
      // Log to analytics service (implement as needed)
      this.logger.debug('Analytics tracked:', analyticsData);
      
      // Store in Redis for later analysis
      const key = `analytics:dialect:${whatsappId}:${Date.now()}`;
      await this.storeAnalytics(key, analyticsData);
      
    } catch (error) {
      this.logger.error('Error tracking analytics:', error);
    }
  }

  /**
   * Store analytics data
   */
  private async storeAnalytics(key: string, data: any): Promise<void> {
    // Implement Redis storage or other analytics storage
    // This is a placeholder
    this.logger.debug(`Storing analytics: ${key}`, data);
  }

  /**
   * Extract WhatsApp ID from various formats
   */
  private extractWhatsappId(from: string): string {
    // Handle various WhatsApp ID formats
    if (from.includes('@')) {
      return from;
    }
    
    // Remove any non-numeric characters except +
    const cleaned = from.replace(/[^\d+]/g, '');
    
    // Add WhatsApp suffix
    return `${cleaned}@c.us`;
  }

  /**
   * Public method to check if dialect feature is available
   */
  isDialectFeatureEnabled(): boolean {
    return this.dialectFeatureEnabled;
  }

  /**
   * Public method to get user's current dialect
   */
  getUserDialect(whatsappId: string): string {
    return this.conversationManager.getUserDialect(whatsappId);
  }

  /**
   * Public method to clear user context
   */
  clearUserContext(whatsappId: string): void {
    this.conversationManager.clearUserContext(whatsappId);
  }
}