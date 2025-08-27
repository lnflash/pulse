import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  BeforeApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsAppInstanceManager } from './whatsapp-instance-manager.service';
import { WhatsAppMessageRouter } from './whatsapp-message-router.service';
import { QrCodeService } from './qr-code.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChromeCleanupUtil } from '../../../common/utils/chrome-cleanup.util';
import { InstanceConfiguration } from '../interfaces/instance-config.interface';

@Injectable()
export class WhatsAppWebService
  implements OnModuleInit, OnModuleDestroy, BeforeApplicationShutdown
{
  private readonly logger = new Logger(WhatsAppWebService.name);
  private isInitialized = false;
  private eventEmitter = new EventTarget();

  constructor(
    private readonly configService: ConfigService,
    private readonly instanceManager: WhatsAppInstanceManager,
    private readonly messageRouter: WhatsAppMessageRouter,
    private readonly qrCodeService: QrCodeService,
    private readonly eventEmitter2: EventEmitter2,
  ) {}

  async onModuleInit() {
    // Skip initialization in test environment
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_WHATSAPP_WEB === 'true') {
      this.logger.log('WhatsApp Web initialization skipped');
      return;
    }

    // Start WhatsApp initialization in the background to not block app startup
    this.initializeWhatsAppInBackground();
  }

  private async initializeWhatsAppInBackground() {
    try {
      // Clean up any stuck Chrome processes before initialization
      this.logger.log('Cleaning up any stuck Chrome processes...');
      try {
        await ChromeCleanupUtil.cleanup();
      } catch (cleanupError) {
        this.logger.warn('Chrome cleanup failed, continuing anyway:', cleanupError.message);
      }

      // Get instance configurations
      const instances = this.configService.get<InstanceConfiguration[]>(
        'whatsappWeb.instances',
        [],
      );

      if (instances.length === 0) {
        // No instances configured, WhatsApp Web will be inactive
        this.logger.warn(
          'No WhatsApp instances configured. WhatsApp Web features will be unavailable.',
        );
        this.logger.warn(
          'To enable WhatsApp, set WHATSAPP_DEFAULT_PHONE or WHATSAPP_INSTANCES in your .env file.',
        );
        this.isInitialized = false;
        return;
      }

      this.logger.log(`Found ${instances.length} WhatsApp instance configuration(s)`);

      // Initialize each configured instance with error handling
      let successCount = 0;
      for (const instanceConfig of instances) {
        if (!instanceConfig.enabled) {
          this.logger.log(`Skipping disabled instance: ${instanceConfig.phoneNumber}`);
          continue;
        }

        try {
          this.logger.log(`Attempting to initialize instance for ${instanceConfig.phoneNumber}...`);
          await this.instanceManager.createInstance({
            phoneNumber: instanceConfig.phoneNumber,
            sessionPath: instanceConfig.sessionPath,
          });
          this.logger.log(`✓ Instance ${instanceConfig.phoneNumber} initialized successfully`);
          successCount++;
        } catch (error: any) {
          this.logger.error(`✗ Failed to initialize instance ${instanceConfig.phoneNumber}:`, error.message);
          
          // Log specific error guidance
          if (error.message?.includes('setUserAgent') || error.message?.includes('CDPPage')) {
            this.logger.error('This appears to be a Puppeteer/Chrome issue.');
            this.logger.error('Please ensure Chrome is installed: apt-get install chromium-browser');
          } else if (error.message?.includes('Permission denied')) {
            this.logger.error('Permission issue detected. Run: sudo ./scripts/fix-whatsapp-permissions.sh');
          }
          
          // Continue with other instances even if one fails
          continue;
        }
      }

      if (successCount > 0) {
        this.isInitialized = true;
        this.logger.log(`WhatsApp Web service initialized with ${successCount} instance(s)`);
        
        // Set up event proxying from instance manager to this service
        this.setupEventProxying();
      } else {
        this.logger.error('No WhatsApp instances could be initialized. Service will be inactive.');
        this.isInitialized = false;
      }
    } catch (error) {
      this.logger.error('Critical error during WhatsApp Web service initialization:', error);
      this.logger.error('Stack trace:', error.stack);
      this.isInitialized = false;
    }
  }

  async onModuleDestroy() {
    await this.cleanup();
  }

  async beforeApplicationShutdown(_signal?: string) {
    await this.cleanup();
  }

  private async cleanup() {
    try {
      this.isInitialized = false;
      // The instance manager will handle cleanup of all instances
      this.logger.log('WhatsApp Web service cleanup complete');
    } catch (error) {
      this.logger.error('Error during WhatsApp Web service cleanup:', error);
    }
  }

  /**
   * Set up event proxying from instance manager events to this service
   */
  private setupEventProxying() {
    // Proxy QR events
    this.eventEmitter2.on('whatsapp.qr', (data) => {
      this.emit('qr', data.qr);
      this.logger.log(`QR event proxied for instance ${data.phoneNumber}`);
    });

    // Proxy ready events
    this.eventEmitter2.on('whatsapp.ready', (data) => {
      this.emit('ready', data);
      this.logger.log(`Ready event proxied for instance ${data.phoneNumber}`);
    });

    // Proxy disconnected events
    this.eventEmitter2.on('whatsapp.disconnected', (data) => {
      this.emit('disconnected', data);
      this.logger.log(`Disconnected event proxied for instance ${data.phoneNumber}`);
    });

    // Proxy message events
    this.eventEmitter2.on('whatsapp.message', (data) => {
      this.emit('message', data.message);
      this.logger.log(`Message event proxied for instance ${data.phoneNumber}`);
    });
  }

  /**
   * Get current connection status for all instances
   */
  getStatus(): {
    instances: Array<{ phoneNumber: string; connected: boolean; number?: string; name?: string }>;
  } {
    const instances = this.instanceManager.getAllInstances();

    return {
      instances: instances.map((instance) => {
        if (instance.status !== 'ready' || !instance.client) {
          return {
            phoneNumber: instance.phoneNumber,
            connected: false,
          };
        }

        try {
          const info = instance.client.info;
          return {
            phoneNumber: instance.phoneNumber,
            connected: true,
            number: info?.wid?.user || 'Unknown',
            name: info?.pushname || 'Unknown',
          };
        } catch {
          return {
            phoneNumber: instance.phoneNumber,
            connected: false,
          };
        }
      }),
    };
  }

  /**
   * Get status for a specific instance
   */
  getInstanceStatus(phoneNumber: string): { connected: boolean; number?: string; name?: string } {
    const instance = this.instanceManager.getInstance(phoneNumber);

    if (!instance || instance.status !== 'ready') {
      return { connected: false };
    }

    try {
      const info = instance.client.info;
      return {
        connected: true,
        number: info?.wid?.user || 'Unknown',
        name: info?.pushname || 'Unknown',
      };
    } catch {
      return { connected: false };
    }
  }

  /**
   * Send a text message through a specific instance or best available
   */
  async sendMessage(
    to: string,
    message: string,
    mentions?: string[],
    instancePhone?: string,
  ): Promise<any> {
    // If instance is specified, use it
    if (instancePhone) {
      this.logger.debug(`Sending message to ${to} via specified instance: ${instancePhone}`);
      return this.messageRouter.sendMessage(instancePhone, to, message);
    }

    // Otherwise, find the best instance
    const bestInstance = await this.messageRouter.findBestInstance(to);
    if (!bestInstance) {
      throw new Error('No WhatsApp instances are ready');
    }

    this.logger.debug(`Sending message to ${to} via best instance: ${bestInstance}`);
    return this.messageRouter.sendMessage(bestInstance, to, message);
  }

  /**
   * Send a message with buttons (fallback to text-based menu)
   */
  async sendInteractiveMessage(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
    instancePhone?: string,
  ): Promise<void> {
    // whatsapp-web.js doesn't support buttons, so we create a text-based menu
    const buttonText = buttons.map((btn, index) => `${index + 1}. ${btn.title}`).join('\n');
    const fullMessage = `${body}\n\nPlease reply with the number of your choice:\n${buttonText}`;

    await this.sendMessage(to, fullMessage, undefined, instancePhone);
  }

  /**
   * Send an image with optional caption
   */
  async sendImage(
    to: string,
    imageBuffer: Buffer,
    caption?: string,
    instancePhone?: string,
  ): Promise<void> {
    const content = { text: caption || '', media: imageBuffer };

    if (instancePhone) {
      await this.messageRouter.sendMessage(instancePhone, to, content);
      return;
    }

    const bestInstance = await this.messageRouter.findBestInstance(to);
    if (!bestInstance) {
      throw new Error('No WhatsApp instances are ready');
    }

    await this.messageRouter.sendMessage(bestInstance, to, content);
  }

  /**
   * Send a voice message
   */
  async sendVoiceMessage(to: string, audioBuffer: Buffer, instancePhone?: string): Promise<void> {
    await this.sendVoiceNote(to, audioBuffer, instancePhone);
  }

  /**
   * Send voice note
   */
  async sendVoiceNote(to: string, audioBuffer: Buffer, instancePhone?: string): Promise<void> {
    const content = { text: '', voice: audioBuffer };

    if (instancePhone) {
      await this.messageRouter.sendMessage(instancePhone, to, content);
      return;
    }

    const bestInstance = await this.messageRouter.findBestInstance(to);
    if (!bestInstance) {
      throw new Error('No WhatsApp instances are ready');
    }

    await this.messageRouter.sendMessage(bestInstance, to, content);
  }

  /**
   * Send media (generic method for messaging abstraction)
   */
  async sendMedia(
    to: string,
    media: Buffer | string,
    caption?: string,
    instancePhone?: string,
  ): Promise<any> {
    if (typeof media === 'string') {
      throw new Error('URL media not supported in multi-instance mode yet');
    }

    return this.sendImage(to, media, caption, instancePhone);
  }

  /**
   * Get QR code for authentication (for a specific instance)
   */
  async getQRCode(phoneNumber?: string): Promise<string | null> {
    const instances = this.instanceManager.getAllInstances();

    // If phone number specified, get QR for that instance
    if (phoneNumber) {
      const instance = this.instanceManager.getInstance(phoneNumber);
      if (instance && instance.status === 'qr_pending' && instance.qrCode) {
        return instance.qrCode;
      }
      return null;
    }

    // Otherwise, get the first instance with a pending QR
    const pendingInstance = instances.find((i) => i.status === 'qr_pending' && i.qrCode);
    return pendingInstance?.qrCode || null;
  }

  /**
   * Get all instances with their QR codes
   */
  async getAllQRCodes(): Promise<Array<{ phoneNumber: string; qrCode: string | null }>> {
    const instances = this.instanceManager.getAllInstances();

    return instances.map((instance) => ({
      phoneNumber: instance.phoneNumber,
      qrCode: instance.status === 'qr_pending' ? instance.qrCode || null : null,
    }));
  }

  /**
   * Disconnect a specific instance
   */
  async disconnect(phoneNumber: string, logout: boolean = true): Promise<void> {
    const instance = this.instanceManager.getInstance(phoneNumber);
    if (!instance) {
      throw new Error(`Instance ${phoneNumber} not found`);
    }

    try {
      if (logout) {
        await instance.client.logout();
      }
      // Update instance status
      instance.status = 'disconnected';
    } catch (error) {
      this.logger.error(`Error disconnecting instance ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Clear session for a specific instance
   */
  async clearSession(phoneNumber: string): Promise<void> {
    await this.instanceManager.removeInstance(phoneNumber);

    // Wait a bit before recreating
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Recreate the instance
    await this.instanceManager.createInstance({ phoneNumber });
  }

  /**
   * Reconnect a specific instance (requires QR scan)
   */
  async reconnect(phoneNumber: string): Promise<void> {
    await this.clearSession(phoneNumber);
  }

  /**
   * Restart a specific instance
   */
  async restartInstance(phoneNumber: string): Promise<void> {
    await this.instanceManager.restartInstance(phoneNumber);
  }

  /**
   * Get client info for backward compatibility
   */
  getClientInfo(): any {
    // Return info from the first ready instance for backward compatibility
    const instances = this.instanceManager.getAllInstances();
    const readyInstance = instances.find((i) => i.status === 'ready');

    if (!readyInstance) {
      return null;
    }

    return readyInstance.client.info;
  }

  /**
   * Logout from all instances
   */
  async logout(): Promise<void> {
    const instances = this.instanceManager.getAllInstances();

    for (const instance of instances) {
      if (instance.status === 'ready') {
        try {
          await instance.client.logout();
        } catch (error) {
          this.logger.error(`Error logging out instance ${instance.phoneNumber}:`, error);
        }
      }
    }

    // Clean up Chrome processes after logout
    await ChromeCleanupUtil.cleanup();
  }

  /**
   * Check if service is ready (at least one instance is ready)
   */
  isClientReady(): boolean {
    const instances = this.instanceManager.getAllInstances();
    return instances.some((i) => i.status === 'ready');
  }

  /**
   * Get metrics for all instances
   */
  getMetrics() {
    return this.instanceManager.getMetrics();
  }

  /**
   * Event emitter methods for messaging abstraction
   */
  on(event: string, handler: Function): void {
    this.eventEmitter.addEventListener(event, handler as any);
  }

  off(event: string, handler: Function): void {
    this.eventEmitter.removeEventListener(event, handler as any);
  }

  private emit(event: string, data: any): void {
    this.eventEmitter.dispatchEvent(new CustomEvent(event, { detail: data }));
  }
}
