import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, LocalAuth } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SessionDirectoryUtil } from '../../../common/utils/session-directory.util';

export interface WhatsAppInstance {
  phoneNumber: string;
  client: Client;
  status: 'initializing' | 'qr_pending' | 'authenticated' | 'ready' | 'disconnected' | 'failed';
  sessionPath: string;
  createdAt: Date;
  lastActivity?: Date;
  qrCode?: string;
}

export interface InstanceConfig {
  phoneNumber: string;
  sessionPath?: string;
  clientId?: string;
  chromiumPort?: number;
}

@Injectable()
export class WhatsAppInstanceManager implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppInstanceManager.name);
  private instances = new Map<string, WhatsAppInstance>();
  private portAllocator = 9222; // Starting port for Chrome debugging

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Create and initialize a new WhatsApp instance
   */
  async createInstance(config: InstanceConfig): Promise<WhatsAppInstance> {
    const phoneNumber = config.phoneNumber;

    // Check if instance already exists
    if (this.instances.has(phoneNumber)) {
      this.logger.warn(`Instance for ${phoneNumber} already exists`);
      return this.instances.get(phoneNumber)!;
    }

    // Create unique paths and IDs for this instance
    const clientId = config.clientId || `pulse-bot-${phoneNumber}`;
    // Ensure session directory exists with proper permissions
    const basePath = config.sessionPath?.replace(`/${phoneNumber}`, '') || './whatsapp-sessions';
    const sessionPath = await SessionDirectoryUtil.ensureSessionDirectory(phoneNumber, basePath);
    const chromiumPort = config.chromiumPort || this.allocatePort();

    this.logger.log(`Creating WhatsApp instance for ${phoneNumber}`);
    this.logger.log(`Session path: ${sessionPath}`);
    this.logger.log(`Chrome debugging port: ${chromiumPort}`);

    // Configure Puppeteer with isolated profile and port
    const puppeteerConfig = {
      headless: true,
      executablePath: '/usr/bin/google-chrome',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        `--remote-debugging-port=${chromiumPort}`,
        `--user-data-dir=${sessionPath}/chrome-profile`, // Isolated Chrome profile
      ]
    };

    // Create WhatsApp Web client
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: clientId,
        dataPath: sessionPath,
      }),
      puppeteer: puppeteerConfig,
      authTimeoutMs: 60000,
    });

    // Create instance object
    const instance: WhatsAppInstance = {
      phoneNumber,
      client,
      status: 'initializing',
      sessionPath,
      createdAt: new Date(),
    };

    // Store instance
    this.instances.set(phoneNumber, instance);

    // Set up event handlers
    this.setupEventHandlers(instance);

    // Initialize the client
    try {
      await client.initialize();
      this.logger.log(`WhatsApp instance for ${phoneNumber} initialized successfully`);
    } catch (error: any) {
      this.logger.error(`Failed to initialize instance for ${phoneNumber}:`, error);
      instance.status = 'failed';
      
      // Check for permission errors
      if (error.message?.includes('Permission denied') || 
          error.message?.includes('SingletonLock') ||
          error.message?.includes('EACCES')) {
        this.logger.error(`Permission error detected. Please run: sudo ./scripts/fix-whatsapp-permissions.sh`);
        throw new Error(`WhatsApp initialization failed due to permission issues. Please check file permissions for ${sessionPath}`);
      }
      
      throw error;
    }

    return instance;
  }

  /**
   * Get an instance by phone number
   */
  getInstance(phoneNumber: string): WhatsAppInstance | undefined {
    return this.instances.get(phoneNumber);
  }

  /**
   * Get all instances
   */
  getAllInstances(): WhatsAppInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Remove and cleanup an instance
   */
  async removeInstance(phoneNumber: string): Promise<void> {
    const instance = this.instances.get(phoneNumber);
    if (!instance) {
      this.logger.warn(`Instance for ${phoneNumber} not found`);
      return;
    }

    this.logger.log(`Removing WhatsApp instance for ${phoneNumber}`);

    try {
      // Clean up session directory first
      const basePath = instance.sessionPath?.replace(`/${phoneNumber}`, '') || './whatsapp-sessions';
      await SessionDirectoryUtil.cleanupSessionDirectory(phoneNumber, basePath);
      
      // Logout and destroy the client
      await instance.client.logout();
      await instance.client.destroy();
    } catch (error) {
      this.logger.error(`Error cleaning up instance for ${phoneNumber}:`, error);
    }

    // Remove from map
    this.instances.delete(phoneNumber);

    // Free up the port
    this.freePort(instance.client);
  }

  /**
   * Get instance status
   */
  getInstanceStatus(phoneNumber: string): string | undefined {
    const instance = this.instances.get(phoneNumber);
    return instance?.status;
  }

  /**
   * Restart an instance
   */
  async restartInstance(phoneNumber: string): Promise<WhatsAppInstance> {
    this.logger.log(`Restarting instance for ${phoneNumber}`);

    // Get current config
    const currentInstance = this.instances.get(phoneNumber);
    const config: InstanceConfig = {
      phoneNumber,
      sessionPath: currentInstance?.sessionPath,
      clientId: `pulse-bot-${phoneNumber}`, // Use standard client ID format
    };

    // Remove current instance
    await this.removeInstance(phoneNumber);

    // Wait a bit for cleanup
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Create new instance
    return this.createInstance(config);
  }

  /**
   * Set up event handlers for a WhatsApp instance
   */
  private setupEventHandlers(instance: WhatsAppInstance): void {
    const { client, phoneNumber } = instance;

    client.on('qr', (qr) => {
      this.logger.log(`QR code received for ${phoneNumber}`);
      instance.status = 'qr_pending';
      instance.qrCode = qr;

      // Display QR in terminal
      qrcode.generate(qr, { small: true });

      // Emit event for external handling
      this.eventEmitter.emit('whatsapp.qr', { phoneNumber, qr });
    });

    client.on('authenticated', () => {
      this.logger.log(`Authenticated for ${phoneNumber}`);
      instance.status = 'authenticated';
      instance.qrCode = undefined;

      this.eventEmitter.emit('whatsapp.authenticated', { phoneNumber });
    });

    client.on('ready', () => {
      this.logger.log(`WhatsApp client ready for ${phoneNumber}`);
      instance.status = 'ready';
      instance.lastActivity = new Date();

      this.eventEmitter.emit('whatsapp.ready', { phoneNumber });
    });

    client.on('disconnected', (reason) => {
      this.logger.warn(`WhatsApp client disconnected for ${phoneNumber}: ${reason}`);
      instance.status = 'disconnected';

      this.eventEmitter.emit('whatsapp.disconnected', { phoneNumber, reason });
    });

    client.on('message', async (message) => {
      instance.lastActivity = new Date();

      // Skip echo messages (messages we sent)
      if (message.fromMe) {
        return;
      }

      // Emit message with instance information
      this.eventEmitter.emit('whatsapp.message', {
        phoneNumber,
        message,
      });
    });

    client.on('message_create', async (message) => {
      // Handle sent messages
      if (message.fromMe) {
        instance.lastActivity = new Date();

        this.eventEmitter.emit('whatsapp.message_sent', {
          phoneNumber,
          message,
        });
      }
    });
  }

  /**
   * Allocate a unique port for Chrome debugging
   */
  private allocatePort(): number {
    return this.portAllocator++;
  }

  /**
   * Free up a port when instance is removed
   */
  private freePort(client: Client): void {
    // In a production system, you might want to track and reuse freed ports
    // For now, we just increment to avoid conflicts
  }

  /**
   * Cleanup all instances on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Cleaning up all WhatsApp instances...');

    const removePromises = Array.from(this.instances.keys()).map((phoneNumber) =>
      this.removeInstance(phoneNumber).catch((err) =>
        this.logger.error(`Error removing instance ${phoneNumber}:`, err),
      ),
    );

    await Promise.all(removePromises);

    this.logger.log('All WhatsApp instances cleaned up');
  }

  /**
   * Get instance metrics
   */
  getMetrics() {
    const instances = Array.from(this.instances.values());

    return {
      total: instances.length,
      ready: instances.filter((i) => i.status === 'ready').length,
      disconnected: instances.filter((i) => i.status === 'disconnected').length,
      failed: instances.filter((i) => i.status === 'failed').length,
      instances: instances.map((i) => ({
        phoneNumber: i.phoneNumber,
        status: i.status,
        createdAt: i.createdAt,
        lastActivity: i.lastActivity,
      })),
    };
  }
}
