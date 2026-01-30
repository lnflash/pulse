import { OutboundMessage } from '../../../core/types';

export interface SideEffect {
  type: 'voice' | 'ai' | 'notification';
  payload: unknown;
}

export interface HandlerResult {
  messages: OutboundMessage[];
  sideEffects?: SideEffect[];
}
