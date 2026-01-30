import { ActorId } from './actor-id';
import { ChatId } from './chat-id';

export type FormattedSegment =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'code'; value: string }
  | { type: 'newline' }
  | { type: 'link'; url: string; label?: string };

export type FormattedText = FormattedSegment[];

export interface TextContent {
  type: 'text';
  body: string;
}

export interface VoiceContent {
  type: 'voice';
  mediaRef: string;
  mimeType?: string;
}

export interface ImageContent {
  type: 'image';
  mediaRef: string;
  caption?: string;
  mimeType?: string;
}

export interface DocumentContent {
  type: 'document';
  mediaRef: string;
  filename?: string;
  mimeType?: string;
}

export interface ContactContent {
  type: 'contact';
  name: string;
  phone: string;
}

export interface LocationContent {
  type: 'location';
  latitude: number;
  longitude: number;
  address?: string;
}

export interface ButtonResponseContent {
  type: 'button_response';
  buttonId: string;
  buttonText: string;
}

export interface InteractiveResponseContent {
  type: 'interactive_response';
  listId?: string;
  listTitle?: string;
  rowId?: string;
  rowTitle?: string;
}

export type MessageContent =
  | TextContent
  | VoiceContent
  | ImageContent
  | DocumentContent
  | ContactContent
  | LocationContent
  | ButtonResponseContent
  | InteractiveResponseContent;

export interface InboundMessage {
  id: string;
  from: ActorId;
  chat: ChatId;
  timestamp: Date;
  content: MessageContent;
  replyTo?: string;
  metadata?: Record<string, unknown>;
}

export interface OutboundTextContent {
  type: 'text';
  body: FormattedText;
  buttons?: Array<{ id: string; label: string }>;
  listSections?: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
}

export interface OutboundVoiceContent {
  type: 'voice';
  mediaRef: string;
}

export interface OutboundImageContent {
  type: 'image';
  mediaRef: string;
  caption?: FormattedText;
}

export interface OutboundDocumentContent {
  type: 'document';
  mediaRef: string;
  filename?: string;
}

export interface TypingIndicatorContent {
  type: 'typing';
}

export type OutboundContent =
  | OutboundTextContent
  | OutboundVoiceContent
  | OutboundImageContent
  | OutboundDocumentContent
  | TypingIndicatorContent;

export interface OutboundMessage {
  to: ChatId;
  content: OutboundContent;
  replyTo?: string;
}
