import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Service to handle WhatsApp Web initialization with error handling
 */
@Injectable()
export class WhatsAppWebInitService {
  private readonly logger = new Logger(WhatsAppWebInitService.name);
  private initializationAttempts = 0;
  private readonly maxAttempts = 3;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Check if WhatsApp Web should be enabled
   */
  isEnabled(): boolean {
    // Check if explicitly disabled
    if (process.env.DISABLE_WHATSAPP_WEB === 'true') {
      this.logger.log('WhatsApp Web is disabled via DISABLE_WHATSAPP_WEB environment variable');
      return false;
    }

    // Check if in test environment
    if (process.env.NODE_ENV === 'test') {
      this.logger.log('WhatsApp Web is disabled in test environment');
      return false;
    }

    // Check if any instances are configured
    const instances = this.configService.get('whatsappWeb.instances', []);
    if (instances.length === 0) {
      this.logger.warn('No WhatsApp instances configured. WhatsApp Web will be disabled.');
      this.logger.warn('To enable, set WHATSAPP_DEFAULT_PHONE or WHATSAPP_INSTANCES in your .env file');
      return false;
    }

    return true;
  }

  /**
   * Handle initialization errors
   */
  handleInitError(error: any): boolean {
    this.initializationAttempts++;
    
    // Log the error details
    this.logger.error(`WhatsApp Web initialization failed (attempt ${this.initializationAttempts}/${this.maxAttempts}):`, error.message);
    
    // Check for specific error types
    if (error.message?.includes('setUserAgent') || error.message?.includes('CDPPage')) {
      this.logger.error('Puppeteer/Chrome error detected. Please check Chrome installation.');
      this.logger.error('Run: ./scripts/diagnose-chrome.sh to diagnose Chrome issues');
      return false;
    }

    if (error.message?.includes('Permission denied')) {
      this.logger.error('Permission error detected. Please run: sudo ./scripts/fix-whatsapp-permissions.sh');
      return false;
    }

    if (error.message?.includes('ECONNREFUSED')) {
      this.logger.error('Chrome debugging port connection refused. Chrome may not be installed properly.');
      return false;
    }

    // Check if we should retry
    if (this.initializationAttempts < this.maxAttempts) {
      this.logger.log(`Will retry initialization in 5 seconds...`);
      return true; // Indicate retry should happen
    }

    this.logger.error('Maximum initialization attempts reached. WhatsApp Web will remain disabled.');
    return false;
  }

  /**
   * Get initialization configuration
   */
  getInitConfig(): any {
    const instances = this.configService.get('whatsappWeb.instances', []);
    
    return {
      instances,
      sessionPath: this.configService.get('whatsappWeb.defaultSessionPath', './whatsapp-sessions'),
      chromeDebugPortStart: this.configService.get('whatsappWeb.chromeDebugPortStart', 9222),
      puppeteerArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-features=site-per-process',
        '--disable-web-security',
        '--disable-features=IsolateOrigins',
        '--disable-site-isolation-trials'
      ]
    };
  }

  /**
   * Reset initialization attempts
   */
  resetAttempts(): void {
    this.initializationAttempts = 0;
  }
}