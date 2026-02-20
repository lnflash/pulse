/**
 * MockMessagingPort — configurable mock for MessagingPort.
 */

import type {
  MessagingPort,
  IncomingMessage,
  MessageDeliveryResult,
} from '../../src/ports/MessagingPort';

/** Factory for incoming messages with sensible defaults. */
export function makeIncomingMessage(
  overrides: Partial<IncomingMessage> = {},
): IncomingMessage {
  return {
    id: `msg-${Date.now()}`,
    from: '+18765551234',
    text: 'Hello',
    timestamp: new Date(),
    platform: 'whatsapp',
    isGroup: false,
    raw: {},
    ...overrides,
  };
}

/** Recorded outbound send. */
export interface SentMessage {
  type: 'text' | 'image' | 'voice' | 'document';
  to: string;
  content: string | Buffer;
  caption?: string;
  filename?: string;
  mimeType?: string;
}

/**
 * MockMessagingPort — records all outbound messages for assertion.
 */
export class MockMessagingPort implements MessagingPort {
  readonly sentMessages: SentMessage[] = [];
  readonly typingIndicators: string[] = [];
  private messageHandler?: (message: IncomingMessage) => Promise<void>;

  private _platformName = 'MockPlatform';
  private _maxLength = 4096;

  reset(): this {
    this.sentMessages.length = 0;
    this.typingIndicators.length = 0;
    return this;
  }

  /** Simulate an incoming message by invoking the registered handler. */
  async simulateIncoming(message: IncomingMessage): Promise<void> {
    if (!this.messageHandler) {
      throw new Error('MockMessagingPort: no message handler registered (call onMessage first)');
    }
    await this.messageHandler(message);
  }

  // ── MessagingPort implementation ─────────────────────────────────────────

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}

  onMessage(handler: (message: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  async sendText(to: string, text: string): Promise<MessageDeliveryResult> {
    this.sentMessages.push({ type: 'text', to, content: text });
    return { messageId: `sent-${Date.now()}`, acceptedAt: new Date() };
  }

  async sendImage(
    to: string,
    imageBuffer: Buffer,
    caption?: string,
  ): Promise<MessageDeliveryResult> {
    this.sentMessages.push({ type: 'image', to, content: imageBuffer, caption });
    return { messageId: `sent-${Date.now()}`, acceptedAt: new Date() };
  }

  async sendVoice(to: string, audioBuffer: Buffer): Promise<MessageDeliveryResult> {
    this.sentMessages.push({ type: 'voice', to, content: audioBuffer });
    return { messageId: `sent-${Date.now()}`, acceptedAt: new Date() };
  }

  async sendDocument(
    to: string,
    docBuffer: Buffer,
    filename: string,
    mimeType?: string,
  ): Promise<MessageDeliveryResult> {
    this.sentMessages.push({ type: 'document', to, content: docBuffer, filename, mimeType });
    return { messageId: `sent-${Date.now()}`, acceptedAt: new Date() };
  }

  async sendTypingIndicator(to: string): Promise<void> {
    this.typingIndicators.push(to);
  }

  getPlatformName(): string {
    return this._platformName;
  }

  getMaxMessageLength(): number {
    return this._maxLength;
  }

  supportsVoice(): boolean {
    return true;
  }

  supportsImages(): boolean {
    return true;
  }

  supportsDocuments(): boolean {
    return true;
  }
}
