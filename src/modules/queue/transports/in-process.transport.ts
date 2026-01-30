import { Injectable } from '@nestjs/common';
import { MessageTransport } from '../../../core/ports/message-transport.port';
import { InboundMessage, OutboundMessage } from '../../../core/types';

@Injectable()
export class InProcessTransport implements MessageTransport {
  private inboundHandler: ((message: InboundMessage) => Promise<void>) | null = null;
  private outboundHandler: ((message: OutboundMessage) => Promise<void>) | null = null;

  async publishInbound(message: InboundMessage): Promise<void> {
    if (this.inboundHandler) {
      await this.inboundHandler(message);
    }
  }

  onInbound(handler: (message: InboundMessage) => Promise<void>): void {
    this.inboundHandler = handler;
  }

  async publishOutbound(message: OutboundMessage): Promise<void> {
    if (this.outboundHandler) {
      await this.outboundHandler(message);
    }
  }

  onOutbound(handler: (message: OutboundMessage) => Promise<void>): void {
    this.outboundHandler = handler;
  }
}
