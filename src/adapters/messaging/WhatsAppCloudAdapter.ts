/**
 * WhatsAppCloudAdapter — MessagingPort implementation for WhatsApp Cloud API.
 *
 * Full implementation using the Meta WhatsApp Cloud API v21.0.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import type {
  MessagingPort,
  IncomingMessage,
  MessageDeliveryResult,
} from '../../ports/MessagingPort.js';
import { logger } from '../../config/logger.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Configuration for the WhatsApp Cloud API adapter. */
export interface WhatsAppCloudConfig {
  /** WhatsApp Business phone number ID */
  phoneNumberId: string;
  /** Permanent access token or system user token */
  accessToken: string;
  /** Webhook verify token (for endpoint verification) */
  webhookVerifyToken: string;
  /** API version, e.g. 'v21.0' */
  apiVersion?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// WhatsApp Cloud API webhook payload types
// ---------------------------------------------------------------------------

interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppEntry[];
}

interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

interface WhatsAppChange {
  value: WhatsAppChangeValue;
  field: string;
}

interface WhatsAppChangeValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
}

interface WhatsAppContact {
  profile: { name: string };
  wa_id: string;
}

type WhatsAppMessageType =
  | 'text'
  | 'audio'
  | 'image'
  | 'document'
  | 'video'
  | 'sticker'
  | 'location'
  | 'contacts'
  | 'interactive'
  | 'button'
  | 'order'
  | 'system'
  | 'unknown';

interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: WhatsAppMessageType;
  text?: { body: string };
  audio?: { id: string; mime_type: string };
  image?: { id: string; mime_type: string; caption?: string; sha256?: string };
  document?: { id: string; filename?: string; mime_type: string; caption?: string };
  context?: { from: string; id: string };
}

interface WhatsAppStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
}

// ---------------------------------------------------------------------------
// WhatsApp Cloud API response types
// ---------------------------------------------------------------------------

interface WhatsAppSendResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

interface WhatsAppMediaUploadResponse {
  id: string;
}

interface WhatsAppMediaInfoResponse {
  url: string;
  mime_type: string;
  sha256: string;
  file_size: number;
  id: string;
  messaging_product: string;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * WhatsAppCloudAdapter — implements MessagingPort for the WhatsApp Cloud API.
 *
 * Lifecycle: initialize() → webhook calls handleWebhookPayload() → shutdown()
 */
export class WhatsAppCloudAdapter implements MessagingPort {
  private readonly config: WhatsAppCloudConfig;
  private readonly apiVersion: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  private messageHandler?: (message: IncomingMessage) => Promise<void>;
  private initialized = false;

  constructor(config: WhatsAppCloudConfig) {
    this.config = config;
    this.apiVersion = config.apiVersion ?? 'v21.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;
    logger.info(
      { phoneNumberId: this.config.phoneNumberId, apiVersion: this.apiVersion },
      'WhatsAppCloudAdapter initialized',
    );
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    logger.info('WhatsAppCloudAdapter shut down');
  }

  onMessage(handler: (message: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  // -------------------------------------------------------------------------
  // Inbound — webhook payload handling
  // -------------------------------------------------------------------------

  /**
   * Called by the webhook route when a WhatsApp payload arrives (POST).
   * Parses the WhatsApp Cloud API webhook format and dispatches to the registered
   * message handler.
   */
  async handleWebhookPayload(payload: unknown): Promise<void> {
    if (!this.messageHandler) {
      logger.warn('WhatsAppCloudAdapter: no message handler registered, dropping payload');
      return;
    }

    const wp = payload as WhatsAppWebhookPayload;

    if (wp.object !== 'whatsapp_business_account') {
      logger.debug({ object: wp.object }, 'Ignoring non-WhatsApp webhook object');
      return;
    }

    for (const entry of wp.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;

        for (const message of change.value.messages ?? []) {
          try {
            const incoming = await this.parseMessage(message);
            if (incoming) {
              await this.messageHandler(incoming);
            }
          } catch (err) {
            logger.error(
              { err, messageId: message.id, type: message.type },
              'Failed to parse or dispatch WhatsApp message',
            );
          }
        }
      }
    }
  }

  /**
   * Parse a raw WhatsApp message object into the platform-agnostic IncomingMessage.
   * Returns null for unsupported message types.
   */
  private async parseMessage(message: WhatsAppMessage): Promise<IncomingMessage | null> {
    const timestamp = new Date(parseInt(message.timestamp, 10) * 1000);

    const base = {
      id: message.id,
      from: message.from,
      timestamp,
      platform: 'whatsapp',
      isGroup: false,
      replyTo: message.context?.id,
      raw: message as unknown,
    } as const;

    switch (message.type) {
      case 'text': {
        return {
          ...base,
          text: message.text?.body ?? '',
        };
      }

      case 'audio': {
        if (!message.audio?.id) return null;
        try {
          const { data, mimeType } = await this.downloadMedia(message.audio.id);
          return {
            ...base,
            voice: data,
            mimeType: mimeType || message.audio.mime_type,
          };
        } catch (err) {
          logger.error(
            { err, mediaId: message.audio.id },
            'Failed to download audio; delivering message without voice data',
          );
          return { ...base };
        }
      }

      case 'image': {
        if (!message.image?.id) return null;
        try {
          const { data, mimeType } = await this.downloadMedia(message.image.id);
          return {
            ...base,
            image: data,
            mimeType: mimeType || message.image.mime_type,
            text: message.image.caption,
          };
        } catch (err) {
          logger.error(
            { err, mediaId: message.image.id },
            'Failed to download image; delivering message without image data',
          );
          return { ...base, text: message.image.caption };
        }
      }

      case 'document': {
        if (!message.document?.id) return null;
        logger.debug(
          { mediaId: message.document.id, filename: message.document.filename },
          'Received document message',
        );
        const docLabel = message.document.filename ?? 'file';
        return {
          ...base,
          text: `[Document: ${docLabel}]`,
        };
      }

      default: {
        logger.debug(
          { type: message.type, messageId: message.id },
          'Unsupported WhatsApp message type, skipping',
        );
        return null;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Media — download and upload
  // -------------------------------------------------------------------------

  /**
   * Download media from WhatsApp CDN.
   * Step 1: GET /v21.0/{mediaId}  →  fetch the CDN URL
   * Step 2: GET the CDN URL       →  fetch the raw bytes
   */
  private async downloadMedia(mediaId: string): Promise<{ data: Buffer; mimeType: string }> {
    // Step 1 — resolve media URL
    const infoRes = await this.fetchWithRetry(
      `${this.baseUrl}/${mediaId}`,
      { method: 'GET', headers: this.authHeaders() },
    );

    if (!infoRes.ok) {
      const body = await infoRes.text();
      throw new Error(`Failed to fetch media info for ${mediaId} (${infoRes.status}): ${body}`);
    }

    const mediaInfo = (await infoRes.json()) as WhatsAppMediaInfoResponse;

    // Step 2 — download bytes from CDN URL (WhatsApp CDN requires auth header)
    const dlRes = await fetch(mediaInfo.url, {
      method: 'GET',
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!dlRes.ok) {
      throw new Error(`Failed to download media from CDN (${dlRes.status})`);
    }

    const arrayBuffer = await dlRes.arrayBuffer();
    return {
      data: Buffer.from(arrayBuffer),
      mimeType: mediaInfo.mime_type,
    };
  }

  /**
   * Upload a media buffer to WhatsApp and return the resulting media ID.
   * Uses multipart/form-data via the built-in FormData global (Node 18+).
   */
  private async uploadMedia(
    buffer: Buffer,
    mimeType: string,
    filename: string,
  ): Promise<string> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    const blob = new Blob([buffer], { type: mimeType });
    form.append('file', blob, filename);

    // NOTE: Do NOT set Content-Type manually — fetch sets it with the boundary.
    const res = await this.fetchWithRetry(
      `${this.baseUrl}/${this.config.phoneNumberId}/media`,
      { method: 'POST', headers: this.authHeaders(), body: form },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Media upload failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as WhatsAppMediaUploadResponse;
    return data.id;
  }

  // -------------------------------------------------------------------------
  // Outbound — send helpers
  // -------------------------------------------------------------------------

  /**
   * POST a message payload to the WhatsApp messages endpoint.
   */
  private async sendMessage(payload: Record<string, unknown>): Promise<MessageDeliveryResult> {
    const res = await this.fetchWithRetry(
      `${this.baseUrl}/${this.config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WhatsApp send failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as WhatsAppSendResponse;
    const messageId = data.messages[0]?.id ?? 'unknown';

    return {
      messageId,
      acceptedAt: new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // MessagingPort — outbound API
  // -------------------------------------------------------------------------

  async sendText(to: string, text: string): Promise<MessageDeliveryResult> {
    this.assertInitialized();
    logger.debug({ to, length: text.length }, 'Sending WhatsApp text message');

    return this.sendMessage({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    });
  }

  async sendImage(
    to: string,
    imageBuffer: Buffer,
    caption?: string,
  ): Promise<MessageDeliveryResult> {
    this.assertInitialized();
    logger.debug({ to, bytes: imageBuffer.byteLength }, 'Sending WhatsApp image');

    const mediaId = await this.uploadMedia(imageBuffer, 'image/jpeg', 'image.jpg');

    const imageField: Record<string, unknown> = { id: mediaId };
    if (caption) imageField['caption'] = caption;

    return this.sendMessage({
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: imageField,
    });
  }

  async sendVoice(to: string, audioBuffer: Buffer): Promise<MessageDeliveryResult> {
    this.assertInitialized();
    logger.debug({ to, bytes: audioBuffer.byteLength }, 'Sending WhatsApp voice message');

    // WhatsApp recommends OGG/Opus for voice notes.
    const mediaId = await this.uploadMedia(audioBuffer, 'audio/ogg; codecs=opus', 'voice.ogg');

    return this.sendMessage({
      messaging_product: 'whatsapp',
      to,
      type: 'audio',
      audio: { id: mediaId },
    });
  }

  async sendDocument(
    to: string,
    docBuffer: Buffer,
    filename: string,
    mimeType = 'application/octet-stream',
  ): Promise<MessageDeliveryResult> {
    this.assertInitialized();
    logger.debug({ to, filename, bytes: docBuffer.byteLength }, 'Sending WhatsApp document');

    const mediaId = await this.uploadMedia(docBuffer, mimeType, filename);

    return this.sendMessage({
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { id: mediaId, filename },
    });
  }

  async sendTypingIndicator(_to: string): Promise<void> {
    // WhatsApp Cloud API does not officially support typing indicators.
    // This method is intentionally a no-op.
  }

  // -------------------------------------------------------------------------
  // MessagingPort — capability metadata
  // -------------------------------------------------------------------------

  getPlatformName(): string {
    return 'WhatsApp Cloud API';
  }

  getMaxMessageLength(): number {
    return 4096;
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

  // -------------------------------------------------------------------------
  // Private utilities
  // -------------------------------------------------------------------------

  /** Authorization header for WhatsApp Cloud API calls. */
  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.config.accessToken}` };
  }

  /**
   * Execute a fetch request, retrying once on 5xx server errors.
   * @param url Request URL
   * @param init Fetch options
   * @param attempt Current attempt number (1-based)
   */
  private async fetchWithRetry(
    url: string,
    init: Parameters<typeof fetch>[1],
    attempt = 1,
  ): Promise<Response> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    const res = await fetch(url, { ...init, signal });

    if (res.status >= 500 && attempt < 2) {
      logger.warn(
        { url, status: res.status, attempt },
        'WhatsApp API returned 5xx, retrying once after 1s',
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
      return this.fetchWithRetry(url, init, attempt + 1);
    }

    return res;
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('WhatsAppCloudAdapter: call initialize() before sending messages');
    }
  }
}
