import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MESSAGE_TRANSPORT } from '../../../queue/queue.module';
import { MessageTransport } from '../../../../core/ports/message-transport.port';
import { InboundMessage, OutboundMessage, Platform, ActorId, ChatId } from '../../../../core/types';
import axios from 'axios';
import * as FormData from 'form-data';

@Injectable()
export class WhatsAppCloudAdapter {
  private readonly logger = new Logger(WhatsAppCloudAdapter.name);
  private readonly apiUrl = 'https://graph.facebook.com/v18.0';
  private readonly accessToken: string;
  private readonly phoneNumberId: string;

  constructor(
    private readonly config: ConfigService,
    @Inject(MESSAGE_TRANSPORT) private readonly messageTransport: MessageTransport,
  ) {
    this.accessToken = this.config.get<string>('whatsapp.accessToken') || '';
    this.phoneNumberId = this.config.get<string>('whatsapp.phoneNumberId') || '';
  }

  async handleWebhook(payload: any): Promise<void> {
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return;

    const from: ActorId = {
      platform: Platform.WhatsAppCloud,
      platformUserId: message.from,
      displayName: value.contacts?.[0]?.profile?.name,
    };

    const chat: ChatId = {
      platform: Platform.WhatsAppCloud,
      platformChatId: message.from,
      isGroup: false,
    };

    let content: any;
    if (message.type === 'text') {
      content = { type: 'text', body: message.text.body };
    } else if (message.type === 'image') {
      content = {
        type: 'image',
        mediaRef: message.image.id,
        caption: message.image.caption,
        mimeType: message.image.mime_type,
      };
    } else if (message.type === 'audio' || message.type === 'voice') {
      content = {
        type: 'voice',
        mediaRef: message.audio?.id || message.voice?.id,
        mimeType: message.audio?.mime_type || message.voice?.mime_type,
      };
    } else if (message.type === 'document') {
      content = {
        type: 'document',
        mediaRef: message.document.id,
        filename: message.document.filename,
        mimeType: message.document.mime_type,
      };
    } else if (message.type === 'video') {
      content = {
        type: 'image',
        mediaRef: message.video.id,
        caption: message.video.caption,
        mimeType: message.video.mime_type,
      };
    } else {
      return;
    }

    const inbound: InboundMessage = {
      id: message.id,
      from,
      chat,
      timestamp: new Date(parseInt(message.timestamp) * 1000),
      content,
      replyTo: message.context?.id,
    };

    await this.messageTransport.publishInbound(inbound);
  }

  async send(message: OutboundMessage): Promise<void> {
    const url = `${this.apiUrl}/${this.phoneNumberId}/messages`;

    let payload: any = {
      messaging_product: 'whatsapp',
      to: message.to.platformChatId,
    };

    if (message.content.type === 'text') {
      const textContent = message.content;
      const text = this.formatText(textContent.body);
      payload.type = 'text';
      payload.text = { body: text };
    } else if (message.content.type === 'image') {
      payload.type = 'image';
      payload.image = { id: message.content.mediaRef };
      if (message.content.caption) {
        payload.image.caption = this.formatText(message.content.caption);
      }
    } else if (message.content.type === 'voice') {
      payload.type = 'audio';
      payload.audio = { id: message.content.mediaRef };
    } else if (message.content.type === 'document') {
      payload.type = 'document';
      payload.document = { id: message.content.mediaRef };
      if (message.content.filename) {
        payload.document.filename = message.content.filename;
      }
    } else if (message.content.type === 'typing') {
      return; // typing indicators not supported via Cloud API send
    }

    await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async downloadMedia(mediaId: string): Promise<Buffer> {
    const metaUrl = `${this.apiUrl}/${mediaId}`;
    const metaResponse = await axios.get(metaUrl, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    const mediaUrl = metaResponse.data.url;
    const mediaResponse = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      responseType: 'arraybuffer',
    });

    return Buffer.from(mediaResponse.data);
  }

  async uploadMedia(buffer: Buffer, mimeType: string, filename?: string): Promise<string> {
    const url = `${this.apiUrl}/${this.phoneNumberId}/media`;

    const form = new FormData();
    form.append('file', buffer, {
      contentType: mimeType,
      filename: filename || `file.${this.getExtensionForMimeType(mimeType)}`,
    });
    form.append('type', mimeType);
    form.append('messaging_product', 'whatsapp');

    const response = await axios.post(url, form, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...form.getHeaders(),
      },
    });

    return response.data.id;
  }

  private getExtensionForMimeType(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'audio/ogg': 'ogg',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'video/mp4': 'mp4',
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    };
    return map[mimeType] || 'bin';
  }

  private formatText(segments: any[]): string {
    return segments
      .map((seg) => {
        if (seg.type === 'text') return seg.value;
        if (seg.type === 'bold') return `*${seg.value}*`;
        if (seg.type === 'italic') return `_${seg.value}_`;
        if (seg.type === 'code') return `\`\`\`${seg.value}\`\`\``;
        if (seg.type === 'newline') return '\n';
        if (seg.type === 'link') return seg.label ? `${seg.label}: ${seg.url}` : seg.url;
        return '';
      })
      .join('');
  }
}
