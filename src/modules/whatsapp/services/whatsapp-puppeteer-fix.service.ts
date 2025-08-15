import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

/**
 * Service to handle Puppeteer initialization with fixes for common issues
 */
@Injectable()
export class WhatsAppPuppeteerFixService {
  private readonly logger = new Logger(WhatsAppPuppeteerFixService.name);

  /**
   * Get fixed Puppeteer configuration
   */
  getFixedPuppeteerConfig(): any {
    const executablePath = this.findChromePath();
    
    return {
      headless: true,
      executablePath,
      args: [
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
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--no-experiments',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-component-extensions-with-background-pages',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--password-store=basic',
        '--use-mock-keychain',
        '--force-color-profile=srgb',
      ],
      defaultViewport: null,
      ignoreDefaultArgs: ['--disable-extensions'],
      // Increase protocol timeout to handle slower connections
      protocolTimeout: 120000,
    };
  }

  /**
   * Find Chrome executable path
   */
  private findChromePath(): string | undefined {
    const fs = require('fs');
    const paths = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium',
      '/usr/bin/microsoft-edge',
    ].filter(Boolean);

    for (const path of paths) {
      if (path && fs.existsSync(path)) {
        this.logger.log(`Found Chrome at: ${path}`);
        return path;
      }
    }

    this.logger.warn('No Chrome executable found, using Puppeteer default');
    return undefined;
  }

  /**
   * Test Chrome/Puppeteer setup
   */
  async testPuppeteer(): Promise<boolean> {
    const config = this.getFixedPuppeteerConfig();
    
    try {
      this.logger.log('Testing Puppeteer configuration...');
      
      const browser = await puppeteer.launch(config);
      const page = await browser.newPage();
      
      // Try to navigate to a simple page
      await page.goto('https://example.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      
      const title = await page.title();
      this.logger.log(`Puppeteer test successful. Page title: ${title}`);
      
      await browser.close();
      return true;
    } catch (error) {
      this.logger.error('Puppeteer test failed:', error.message);
      return false;
    }
  }

  /**
   * Apply runtime fixes for WhatsApp Web.js
   */
  applyRuntimeFixes(): void {
    // Override problematic methods at runtime
    try {
      const Client = require('whatsapp-web.js').Client;
      
      // Store original initialize method
      const originalInitialize = Client.prototype.initialize;
      
      // Override with error handling
      Client.prototype.initialize = async function() {
        this.logger?.log('Initializing with runtime fixes...');
        
        // Ensure pupPage exists before calling methods on it
        if (!this.pupPage) {
          this.pupPage = await this.pupBrowser.newPage();
        }
        
        // Wrap setUserAgent in try-catch
        const page = this.pupPage;
        const originalSetUserAgent = page.setUserAgent;
        page.setUserAgent = async function(userAgent: string) {
          try {
            return await originalSetUserAgent.call(this, userAgent);
          } catch (error) {
            console.warn('setUserAgent failed, continuing anyway:', error.message);
            return Promise.resolve();
          }
        };
        
        // Call original initialize
        return originalInitialize.call(this);
      };
      
      this.logger.log('Runtime fixes applied to WhatsApp Web.js');
    } catch (error) {
      this.logger.warn('Could not apply runtime fixes:', error.message);
    }
  }
}