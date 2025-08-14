import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IMessagePlatform,
  PlatformConfig,
  IncomingMessage,
  MessageReceipt,
  PlatformStatus,
  OutgoingMessage
} from '../abstractions/message-platform.interface';
import { IMessageHandler } from '../abstractions/message-platform.interface';
import { WhatsAppWebAdapter } from '../adapters/whatsapp-web.adapter';
import { CommandMessageHandler } from '../handlers/command-message.handler';
import { GeneralMessageHandler } from '../handlers/general-message.handler';
import { EventsService } from '../../events/events.service';
import { MetricsService } from '../../common/services/metrics.service';

/**
 * Central orchestrator for all messaging platforms
 * Manages platform lifecycle, message routing, and handler execution
 */
@Injectable()
export class MessagingOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(MessagingOrchestratorService.name);
  private platforms: Map<string, IMessagePlatform> = new Map();
  private handlers: IMessageHandler[] = [];
  private defaultPlatform: string = 'whatsapp-web';

  constructor(
    private readonly configService: ConfigService,
    private readonly eventsService: EventsService,
    private readonly metricsService: MetricsService,
    private readonly commandHandler: CommandMessageHandler,
    private readonly generalHandler: GeneralMessageHandler
  ) {
    // Register handlers in priority order
    this.registerHandler(commandHandler);
    this.registerHandler(generalHandler);
  }

  async onModuleInit() {
    // Initialize default platform on startup
    await this.initializeDefaultPlatform();
  }

  /**
   * Initialize the default messaging platform
   */
  private async initializeDefaultPlatform() {
    try {
      const platformType = this.configService.get<string>('MESSAGING_PLATFORM', 'whatsapp-web');
      
      const config: PlatformConfig = {
        platformType: platformType as any,
        instanceId: 'default',
        phoneNumber: this.configService.get<string>('WHATSAPP_PHONE_NUMBER'),
        options: {
          headless: this.configService.get<boolean>('PUPPETEER_HEADLESS', true)
        }
      };

      await this.initializePlatform('default', config);
      
    } catch (error) {
      this.logger.error('Failed to initialize default platform:', error);
    }
  }

  /**
   * Initialize a messaging platform
   */
  async initializePlatform(instanceId: string, config: PlatformConfig): Promise<void> {
    this.logger.log(`Initializing platform: ${config.platformType} (${instanceId})`);

    let platform: IMessagePlatform;

    // Create platform based on type
    switch (config.platformType) {
      case 'whatsapp-web':
        platform = new WhatsAppWebAdapter();
        break;
      
      case 'whatsapp-cloud':
        // TODO: Implement WhatsAppCloudAdapter
        throw new Error('WhatsApp Cloud API adapter not yet implemented');
      
      case 'telegram':
        // TODO: Implement TelegramAdapter
        throw new Error('Telegram adapter not yet implemented');
      
      default:
        throw new Error(`Unsupported platform type: ${config.platformType}`);
    }

    // Initialize the platform
    await platform.initialize(config);

    // Set up event handlers
    this.setupPlatformEventHandlers(platform, instanceId);

    // Store platform
    this.platforms.set(instanceId, platform);

    // Connect to the platform
    await platform.connect();

    this.logger.log(`Platform initialized successfully: ${instanceId}`);
  }

  /**
   * Set up event handlers for a platform
   */
  private setupPlatformEventHandlers(platform: IMessagePlatform, instanceId: string) {
    // Handle incoming messages
    platform.onMessage(async (message: IncomingMessage) => {
      await this.handleIncomingMessage(message, platform, instanceId);
    });

    // Handle message status updates
    platform.onMessageStatus(async (receipt: MessageReceipt) => {
      await this.handleMessageStatus(receipt, instanceId);
    });

    // Handle connection status changes
    platform.onConnectionStatus(async (status: PlatformStatus) => {
      await this.handleConnectionStatus(status, instanceId);
    });
  }

  /**
   * Handle incoming messages from any platform
   */
  private async handleIncomingMessage(
    message: IncomingMessage,
    platform: IMessagePlatform,
    instanceId: string
  ) {
    const startTime = Date.now();
    
    try {
      this.logger.debug(`Received message from ${message.from} on ${instanceId}`);
      
      // Track metrics
      this.metricsService.incrementCounter('messages.received', {
        platform: instanceId,
        type: message.type
      });

      // Emit event for other services
      await this.eventsService.emit('message.received', {
        message,
        instanceId
      });

      // Find the first handler that can process this message
      const handler = this.handlers
        .sort((a, b) => a.priority - b.priority)
        .find(h => h.canHandle(message));

      if (handler) {
        this.logger.debug(`Message will be handled by: ${handler.constructor.name}`);
        await handler.handle(message, platform);
        
        // Track successful handling
        this.metricsService.incrementCounter('messages.handled', {
          platform: instanceId,
          handler: handler.constructor.name
        });
      } else {
        this.logger.warn(`No handler found for message type: ${message.type}`);
        
        // Send a default response for unhandled messages
        if (message.type === 'text' && !message.metadata?.fromMe) {
          await platform.sendMessage({
            to: message.from,
            content: {
              text: "I'm not sure how to help with that. Try 'help' to see what I can do!"
            }
          });
        }
      }

      // Track processing time
      const processingTime = Date.now() - startTime;
      this.metricsService.recordHistogram('messages.processing_time', processingTime, {
        platform: instanceId,
        type: message.type
      });

    } catch (error) {
      this.logger.error(`Error handling message: ${error.message}`, error.stack);
      
      // Track error
      this.metricsService.incrementCounter('messages.errors', {
        platform: instanceId,
        error: error.message
      });

      // Try to send error response
      try {
        await platform.sendMessage({
          to: message.from,
          content: {
            text: "Sorry, something went wrong. Please try again later."
          }
        });
      } catch (sendError) {
        this.logger.error('Failed to send error response:', sendError);
      }
    }
  }

  /**
   * Handle message status updates
   */
  private async handleMessageStatus(receipt: MessageReceipt, instanceId: string) {
    this.logger.debug(`Message ${receipt.messageId} status: ${receipt.status}`);
    
    // Track metrics
    this.metricsService.incrementCounter('messages.status', {
      platform: instanceId,
      status: receipt.status
    });

    // Emit event
    await this.eventsService.emit('message.status', {
      receipt,
      instanceId
    });
  }

  /**
   * Handle connection status changes
   */
  private async handleConnectionStatus(status: PlatformStatus, instanceId: string) {
    this.logger.log(`Platform ${instanceId} status: ${status}`);
    
    // Track metrics
    this.metricsService.incrementCounter('platform.status', {
      platform: instanceId,
      status
    });

    // Emit event
    await this.eventsService.emit('platform.status', {
      status,
      instanceId
    });

    // Handle specific status changes
    switch (status) {
      case PlatformStatus.QR_REQUIRED:
        // Generate and display QR code
        const platform = this.platforms.get(instanceId);
        if (platform?.getQRCode) {
          const qr = await platform.getQRCode();
          this.logger.log(`QR Code for ${instanceId}: ${qr.substring(0, 50)}...`);
          // TODO: Send QR to admin or display somehow
        }
        break;
      
      case PlatformStatus.DISCONNECTED:
        // Attempt reconnection after delay
        setTimeout(async () => {
          await this.reconnectPlatform(instanceId);
        }, 5000);
        break;
    }
  }

  /**
   * Reconnect a disconnected platform
   */
  private async reconnectPlatform(instanceId: string) {
    const platform = this.platforms.get(instanceId);
    if (platform && platform.getStatus() === PlatformStatus.DISCONNECTED) {
      this.logger.log(`Attempting to reconnect platform: ${instanceId}`);
      try {
        await platform.connect();
      } catch (error) {
        this.logger.error(`Failed to reconnect platform ${instanceId}:`, error);
      }
    }
  }

  /**
   * Register a message handler
   */
  registerHandler(handler: IMessageHandler) {
    this.handlers.push(handler);
    this.handlers.sort((a, b) => a.priority - b.priority);
    this.logger.log(`Registered handler: ${handler.constructor.name} (priority: ${handler.priority})`);
  }

  /**
   * Send a message through a specific platform
   */
  async sendMessage(
    message: OutgoingMessage,
    instanceId: string = 'default'
  ): Promise<MessageReceipt> {
    const platform = this.platforms.get(instanceId);
    
    if (!platform) {
      throw new Error(`Platform not found: ${instanceId}`);
    }

    if (platform.getStatus() !== PlatformStatus.CONNECTED) {
      throw new Error(`Platform not connected: ${instanceId}`);
    }

    return await platform.sendMessage(message);
  }

  /**
   * Get platform by instance ID
   */
  getPlatform(instanceId: string = 'default'): IMessagePlatform | undefined {
    return this.platforms.get(instanceId);
  }

  /**
   * Get all platform instances
   */
  getAllPlatforms(): Map<string, IMessagePlatform> {
    return this.platforms;
  }

  /**
   * Disconnect a platform
   */
  async disconnectPlatform(instanceId: string): Promise<void> {
    const platform = this.platforms.get(instanceId);
    if (platform) {
      await platform.disconnect();
      this.platforms.delete(instanceId);
      this.logger.log(`Platform disconnected: ${instanceId}`);
    }
  }

  /**
   * Disconnect all platforms
   */
  async disconnectAll(): Promise<void> {
    for (const [instanceId, platform] of this.platforms.entries()) {
      await platform.disconnect();
    }
    this.platforms.clear();
    this.logger.log('All platforms disconnected');
  }
}