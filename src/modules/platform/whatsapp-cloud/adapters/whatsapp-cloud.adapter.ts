import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MESSAGE_TRANSPORT } from '../../../queue/queue.module';
import { MessageTransport } from '../../../../core/ports/message-transport.port';
import { InboundMessage, OutboundMessage, Platform, ActorId, ChatId } from '../../../../core/types';
import axios from 'axios';

@Injectable()
export class WhatsAppCloudAdapter {
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
    }

    await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
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
