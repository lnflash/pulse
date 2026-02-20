/**
 * MessagingPort — hexagonal boundary for all messaging platform adapters.
 * Any adapter (WhatsApp, Telegram, SMS, etc.) must implement this interface.
 */

/** Represents an incoming message from any messaging platform. */
export interface IncomingMessage {
  /** Platform-native message ID */
  id: string;
  /** Sender identifier (phone number, user ID, etc.) */
  from: string;
  /** Plain-text content, if present */
  text?: string;
  /** Raw audio bytes for voice messages */
  voice?: Buffer;
  /** Raw image bytes for image messages */
  image?: Buffer;
  /** MIME type of the voice/image attachment */
  mimeType?: string;
  /** When the message was sent */
  timestamp: Date;
  /** Platform identifier, e.g. 'whatsapp', 'telegram' */
  platform: string;
  /** True if the message was sent in a group/channel */
  isGroup: boolean;
  /** Group/channel identifier, present when isGroup is true */
  groupId?: string;
  /** ID of the message this is a reply to, if any */
  replyTo?: string;
  /** Raw platform-native payload for adapter-specific handling */
  raw: unknown;
}

/** Delivery receipt returned after sending a message */
export interface MessageDeliveryResult {
  /** Platform-native ID of the sent message */
  messageId: string;
  /** Timestamp when the platform accepted the message */
  acceptedAt: Date;
}

/**
 * MessagingPort — implement this for every supported messaging platform.
 *
 * Lifecycle: initialize() → (onMessage handler receives messages) → shutdown()
 */
export interface MessagingPort {
  /**
   * Connect to the messaging platform and begin receiving messages.
   * Should be idempotent if called more than once.
   */
  initialize(): Promise<void>;

  /**
   * Gracefully disconnect and release all resources.
   */
  shutdown(): Promise<void>;

  /**
   * Register a handler that will be called for every incoming message.
   * Only one handler is supported — calling this twice replaces the first handler.
   * @param handler Async function called with each incoming message.
   */
  onMessage(handler: (message: IncomingMessage) => Promise<void>): void;

  /**
   * Send a plain-text message to a recipient.
   * @param to Recipient identifier (phone number, user ID, etc.)
   * @param text Message text. Callers are responsible for respecting getMaxMessageLength().
   */
  sendText(to: string, text: string): Promise<MessageDeliveryResult>;

  /**
   * Send an image to a recipient.
   * @param to Recipient identifier
   * @param imageBuffer Raw image bytes (JPEG or PNG recommended)
   * @param caption Optional caption displayed below the image
   */
  sendImage(
    to: string,
    imageBuffer: Buffer,
    caption?: string,
  ): Promise<MessageDeliveryResult>;

  /**
   * Send a voice/audio message to a recipient.
   * @param to Recipient identifier
   * @param audioBuffer Raw audio bytes (OGG/Opus for WhatsApp, MP3 fallback)
   */
  sendVoice(to: string, audioBuffer: Buffer): Promise<MessageDeliveryResult>;

  /**
   * Send a document/file to a recipient.
   * @param to Recipient identifier
   * @param docBuffer Raw file bytes
   * @param filename Filename shown to the recipient
   * @param mimeType MIME type of the document
   */
  sendDocument(
    to: string,
    docBuffer: Buffer,
    filename: string,
    mimeType?: string,
  ): Promise<MessageDeliveryResult>;

  /**
   * Send a typing indicator / "is typing..." status to a recipient.
   * No-op on platforms that don't support this.
   */
  sendTypingIndicator(to: string): Promise<void>;

  /** Human-readable platform name, e.g. 'WhatsApp Cloud API' */
  getPlatformName(): string;

  /**
   * Maximum character length for a single text message.
   * Callers must split longer messages before calling sendText().
   */
  getMaxMessageLength(): number;

  /** True if this adapter supports sending/receiving voice messages */
  supportsVoice(): boolean;

  /** True if this adapter supports sending/receiving images */
  supportsImages(): boolean;

  /** True if this adapter supports sending documents */
  supportsDocuments(): boolean;
}
