/**
 * WhatsAppCloudAdapter — MessagingPort implementation for WhatsApp Cloud API.
 *
 * Stub implementation. Full implementation in Week 2 (Messaging sprint).
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import type {
  MessagingPort,
  IncomingMessage,
  MessageDeliveryResult,
} from '../../ports/MessagingPort.js';
import { logger } from '../../config/logger.js';

/** Configuration for the WhatsApp Cloud API adapter. */
export interface WhatsAppCloudConfig {
  /** WhatsApp Business phone number ID */
  phoneNumberId: string;
  /** Permanent access token or system user token */
  accessToken: string;
  /** Webhook verify token (for endpoint verification) */
  webhookVerifyToken: string;
  /** API version, e.g. 'v18.0' */
  apiVersion?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * WhatsAppCloudAdapter — implements MessagingPort for the WhatsApp Cloud API.
 *
 * @todo Week 2: Implement full adapter
 */
export class WhatsAppCloudAdapter implements MessagingPort {
  private readonly config: WhatsAppCloudConfig;
  private messageHandler?: (message: IncomingMessage) => Promise<void>;
  private initialized = false;

  constructor(config: WhatsAppCloudConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    logger.info({ phoneNumberId: this.config.phoneNumberId }, 'WhatsAppCloudAdapter initializing (stub)');
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    logger.info('WhatsAppCloudAdapter shut down');
  }

  onMessage(handler: (message: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  /**
   * Called by the webhook route when a WhatsApp payload arrives.
   * @todo Week 2: Parse WhatsApp Cloud API webhook payload format.
   */
  async handleWebhookPayload(payload: unknown): Promise<void> {
    if (!this.messageHandler) {
      logger.warn('WhatsAppCloudAdapter: no message handler registered');
      return;
    }
    logger.debug({ payload }, 'WhatsApp webhook payload received (stub — not parsed)');
  }

  async sendText(_to: string, _text: string): Promise<MessageDeliveryResult> {
    this.assertInitialized();
    throw new Error('WhatsAppCloudAdapter.sendText not implemented — Week 2');
  }

  async sendImage(
    _to: string,
    _imageBuffer: Buffer,
    _caption?: string,
  ): Promise<MessageDeliveryResult> {
    this.assertInitialized();
    throw new Error('WhatsAppCloudAdapter.sendImage not implemented — Week 2');
  }

  async sendVoice(_to: string, _audioBuffer: Buffer): Promise<MessageDeliveryResult> {
    this.assertInitialized();
    throw new Error('WhatsAppCloudAdapter.sendVoice not implemented — Week 2');
  }

  async sendDocument(
    _to: string,
    _docBuffer: Buffer,
    _filename: string,
    _mimeType?: string,
  ): Promise<MessageDeliveryResult> {
    this.assertInitialized();
    throw new Error('WhatsAppCloudAdapter.sendDocument not implemented — Week 2');
  }

  async sendTypingIndicator(_to: string): Promise<void> {
    // No-op stub — WhatsApp typing indicators implemented in Week 2
  }

  getPlatformName(): string { return 'WhatsApp Cloud API'; }
  getMaxMessageLength(): number { return 4096; }
  supportsVoice(): boolean { return true; }
  supportsImages(): boolean { return true; }
  supportsDocuments(): boolean { return true; }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('WhatsAppCloudAdapter: call initialize() before sending messages');
    }
  }
}
