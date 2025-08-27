import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { WhatsAppInstanceManager } from './whatsapp-instance-manager.service';
import { WhatsappService } from './whatsapp.service';
import { InstanceMessage } from '../interfaces/instance-config.interface';
import { Message } from 'whatsapp-web.js';

@Injectable()
export class WhatsAppMessageRouter {
  private readonly logger = new Logger(WhatsAppMessageRouter.name);

  constructor(
    private readonly instanceManager: WhatsAppInstanceManager,
    private readonly whatsappService: WhatsappService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Handle incoming messages from any instance
   */
  @OnEvent('whatsapp.message')
  async handleIncomingMessage(payload: { phoneNumber: string; message: Message }) {
    const { phoneNumber, message } = payload;

    try {
      this.logger.debug(`Routing message from instance ${phoneNumber}: ${message.body}`);
      
      // Update instance activity
      const instance = this.instanceManager.getInstance(phoneNumber);
      if (instance) {
        instance.lastActivity = new Date();
      }

      // Extract message data
      const messageData: any = {
        from: message.from,
        text: message.body,
        messageId: (message.id as any)._serialized,
        timestamp: new Date((message.timestamp as any) * 1000).toISOString(),
        name: (message as any)._data?.notifyName || undefined,
        isVoiceCommand: message.hasMedia && message.type === 'ptt',
        whatsappId: message.from,
        isGroup: message.from.endsWith('@g.us'),
        groupId: message.from.endsWith('@g.us') ? message.from : undefined,
        instancePhone: phoneNumber, // Add instance identifier
        messageType: message.type,
      };

      // Handle vCard messages
      if (message.type === 'vcard' && message.hasMedia) {
        try {
          const vCardData = (message as any).body || (message as any)._data?.body;
          if (vCardData) {
            // Parse vCard data
            const vCardInfo = this.parseVCard(vCardData);
            if (vCardInfo) {
              messageData.vCard = vCardInfo;
              messageData.isVCard = true;
              this.logger.log(`Received vCard for ${vCardInfo.name} (${vCardInfo.phone})`);
            }
          }
        } catch (error) {
          this.logger.error(`Error parsing vCard: ${error.message}`);
        }
      }

      // Process message through the main WhatsApp service
      const response = await this.whatsappService.processCloudMessage(messageData);

      // Send response back through the correct instance
      if (response) {
        await this.sendResponse(phoneNumber, message.from, response);
      }
    } catch (error) {
      this.logger.error(`Error handling message from instance ${phoneNumber}:`, error);

      // Send error message back to user
      try {
        await this.sendResponse(
          phoneNumber,
          message.from,
          '❌ Sorry, an error occurred processing your message. Please try again.',
        );
      } catch (sendError) {
        this.logger.error(`Failed to send error message:`, sendError);
      }
    }
  }

  /**
   * Send a message through a specific instance
   */
  async sendMessage(
    instancePhone: string,
    recipient: string,
    content: string | { text: string; media?: Buffer; voice?: Buffer },
  ): Promise<boolean> {
    const instance = this.instanceManager.getInstance(instancePhone);

    if (!instance || instance.status !== 'ready') {
      this.logger.error(`Instance ${instancePhone} not ready for sending`);
      return false;
    }

    try {
      // Update last activity
      instance.lastActivity = new Date();
      const client = instance.client;
      
      // Ensure recipient is properly formatted
      const formattedRecipient = this.formatWhatsAppId(recipient);

      if (typeof content === 'string') {
        // Send text message
        await client.sendMessage(formattedRecipient, content);
      } else {
        // Handle complex content (text + media/voice)
        if (content.text) {
          await client.sendMessage(formattedRecipient, content.text);
        }

        if (content.voice) {
          // Send voice message
          const media = new MessageMedia(
            'audio/ogg; codecs=opus',
            content.voice.toString('base64'),
          );
          await client.sendMessage(formattedRecipient, media, { sendAudioAsVoice: true });
        } else if (content.media) {
          // Send regular media
          const media = new MessageMedia('image/png', content.media.toString('base64'));
          await client.sendMessage(formattedRecipient, media);
        }
      }

      this.logger.debug(`Message sent through instance ${instancePhone} to ${recipient}`);
      return true;
    } catch (error) {
      this.logger.error(`Error sending message through instance ${instancePhone}:`, error);
      return false;
    }
  }

  /**
   * Send a response through the appropriate instance
   */
  private async sendResponse(
    instancePhone: string,
    recipient: string,
    response: string | { text: string; media?: Buffer; voice?: Buffer; voiceOnly?: boolean },
  ): Promise<void> {
    if (typeof response === 'string') {
      await this.sendMessage(instancePhone, recipient, response);
    } else {
      if (response.voiceOnly && response.voice) {
        // Voice only - don't send text
        await this.sendMessage(instancePhone, recipient, { text: '', voice: response.voice });
      } else {
        // Send full response
        await this.sendMessage(instancePhone, recipient, response);
      }
    }
  }

  /**
   * Find the best instance to send a message
   * This can be extended with load balancing logic
   */
  async findBestInstance(recipient?: string): Promise<string | null> {
    const instances = this.instanceManager.getAllInstances();

    // Filter ready instances
    const readyInstances = instances.filter((i) => i.status === 'ready');

    if (readyInstances.length === 0) {
      return null;
    }

    // For now, return the first ready instance
    // This can be enhanced with:
    // - Round-robin selection
    // - Least recently used
    // - Load-based selection
    // - Geographic/number-based routing
    return readyInstances[0].phoneNumber;
  }

  /**
   * Broadcast a message to all instances
   */
  async broadcastMessage(
    recipient: string,
    content: string | { text: string; media?: Buffer; voice?: Buffer },
  ): Promise<{ instance: string; success: boolean }[]> {
    const instances = this.instanceManager.getAllInstances();
    const results: { instance: string; success: boolean }[] = [];

    for (const instance of instances) {
      if (instance.status === 'ready') {
        const success = await this.sendMessage(instance.phoneNumber, recipient, content);
        results.push({ instance: instance.phoneNumber, success });
      }
    }

    return results;
  }

  /**
   * Get routing statistics
   */
  getRoutingStats() {
    const instances = this.instanceManager.getAllInstances();

    return {
      totalInstances: instances.length,
      readyInstances: instances.filter((i) => i.status === 'ready').length,
      messagesRouted: {
        // These would be tracked with counters in production
        total: 0,
        byInstance: {},
      },
    };
  }

  /**
   * Format a phone number or chat ID for WhatsApp
   */
  private formatWhatsAppId(id: string): string {
    // If already formatted, return as is
    if (id.includes('@')) {
      return id;
    }
    
    // Remove any non-numeric characters
    const cleaned = id.replace(/\D/g, '');
    
    // Format as WhatsApp chat ID
    return `${cleaned}@c.us`;
  }

  /**
   * Parse vCard data to extract contact information
   */
  private parseVCard(vCardData: string): { name: string; phone: string } | null {
    try {
      // vCard format typically looks like:
      // BEGIN:VCARD
      // VERSION:3.0
      // FN:John Doe
      // TEL:+1234567890
      // END:VCARD

      const lines = vCardData.split('\n');
      let name = '';
      let phone = '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Extract full name
        if (trimmedLine.startsWith('FN:')) {
          name = trimmedLine.substring(3).trim();
        }
        
        // Extract phone number
        if (trimmedLine.startsWith('TEL:') || trimmedLine.startsWith('TEL;')) {
          // Handle different TEL formats (TEL:+123 or TEL;TYPE=CELL:+123)
          const telParts = trimmedLine.split(':');
          if (telParts.length >= 2) {
            phone = telParts[telParts.length - 1].trim();
          }
        }
      }

      // Clean up phone number - remove all non-digits except +
      if (phone) {
        phone = phone.replace(/[^\d+]/g, '');
        // Remove leading + for consistency
        if (phone.startsWith('+')) {
          phone = phone.substring(1);
        }
      }

      if (name && phone) {
        return { name, phone };
      }

      return null;
    } catch (error) {
      this.logger.error(`Error parsing vCard data: ${error.message}`);
      return null;
    }
  }
}

// Import MessageMedia from whatsapp-web.js
import { MessageMedia } from 'whatsapp-web.js';
