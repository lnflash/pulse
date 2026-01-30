import { InboundMessage, OutboundMessage } from '../types';

export interface MessageTransport {
  publishInbound(message: InboundMessage): Promise<void>;
  onInbound(handler: (message: InboundMessage) => Promise<void>): void;
  publishOutbound(message: OutboundMessage): Promise<void>;
  onOutbound(handler: (message: OutboundMessage) => Promise<void>): void;
}
