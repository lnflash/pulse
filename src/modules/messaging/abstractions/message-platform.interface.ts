/**
 * Core messaging platform abstraction
 * This interface allows Pulse to work with any messaging platform (WhatsApp Web, WhatsApp Cloud API, Telegram, etc.)
 */

export interface MessageContent {
  text?: string;
  voice?: Buffer;
  image?: Buffer;
  document?: Buffer;
  location?: { latitude: number; longitude: number };
  contacts?: ContactCard[];
  buttons?: MessageButton[];
  listItems?: ListItem[];
}

export interface ContactCard {
  name: string;
  phone: string;
  email?: string;
}

export interface MessageButton {
  id: string;
  text: string;
  type: 'reply' | 'url' | 'call';
  payload?: string;
}

export interface ListItem {
  id: string;
  title: string;
  description?: string;
}

export interface IncomingMessage {
  id: string;
  from: string;
  to?: string;
  timestamp: Date;
  type: MessageType;
  content: MessageContent;
  isGroup: boolean;
  groupId?: string;
  replyTo?: string;
  metadata?: Record<string, any>;
}

export interface OutgoingMessage {
  to: string;
  content: MessageContent;
  replyTo?: string;
  options?: MessageOptions;
}

export interface MessageOptions {
  mentions?: string[];
  ephemeral?: boolean;
  editMessageId?: string;
  priority?: 'high' | 'normal' | 'low';
}

export interface MessageReceipt {
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  error?: string;
}

export interface PlatformUser {
  id: string;
  phone?: string;
  name?: string;
  profilePicture?: string;
  isBusinessAccount?: boolean;
  metadata?: Record<string, any>;
}

export interface GroupInfo {
  id: string;
  name: string;
  description?: string;
  participants: string[];
  admins: string[];
  created: Date;
  profilePicture?: string;
}

export enum MessageType {
  TEXT = 'text',
  VOICE = 'voice',
  IMAGE = 'image',
  VIDEO = 'video',
  DOCUMENT = 'document',
  LOCATION = 'location',
  CONTACT = 'contact',
  BUTTON_RESPONSE = 'button_response',
  LIST_RESPONSE = 'list_response',
  STICKER = 'sticker'
}

export enum PlatformStatus {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
  QR_REQUIRED = 'qr_required',
  AUTHENTICATED = 'authenticated'
}

/**
 * Main messaging platform interface
 * All messaging platforms must implement this interface
 */
export interface IMessagePlatform {
  // Connection management
  initialize(config: PlatformConfig): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): PlatformStatus;
  
  // Message operations
  sendMessage(message: OutgoingMessage): Promise<MessageReceipt>;
  sendBulkMessages(messages: OutgoingMessage[]): Promise<MessageReceipt[]>;
  editMessage(messageId: string, newContent: MessageContent): Promise<boolean>;
  deleteMessage(messageId: string): Promise<boolean>;
  
  // Media operations
  sendVoice(to: string, audio: Buffer, caption?: string): Promise<MessageReceipt>;
  sendImage(to: string, image: Buffer, caption?: string): Promise<MessageReceipt>;
  sendDocument(to: string, document: Buffer, filename: string, caption?: string): Promise<MessageReceipt>;
  downloadMedia(messageId: string): Promise<Buffer>;
  
  // User operations
  getUserInfo(userId: string): Promise<PlatformUser>;
  getProfilePicture(userId: string): Promise<Buffer | null>;
  blockUser(userId: string): Promise<boolean>;
  unblockUser(userId: string): Promise<boolean>;
  
  // Group operations
  getGroupInfo(groupId: string): Promise<GroupInfo>;
  createGroup(name: string, participants: string[]): Promise<string>;
  addToGroup(groupId: string, participants: string[]): Promise<boolean>;
  removeFromGroup(groupId: string, participants: string[]): Promise<boolean>;
  leaveGroup(groupId: string): Promise<boolean>;
  
  // Status operations
  setStatus(status: string): Promise<boolean>;
  setProfilePicture(image: Buffer): Promise<boolean>;
  
  // Event handlers
  onMessage(handler: (message: IncomingMessage) => Promise<void>): void;
  onMessageStatus(handler: (receipt: MessageReceipt) => Promise<void>): void;
  onConnectionStatus(handler: (status: PlatformStatus) => Promise<void>): void;
  
  // Platform-specific features (optional)
  getQRCode?(): Promise<string>;
  getPairingCode?(): Promise<string>;
  isRegistered?(phoneNumber: string): Promise<boolean>;
  formatPhoneNumber?(phoneNumber: string): string;
}

/**
 * Platform configuration
 */
export interface PlatformConfig {
  platformType: 'whatsapp-web' | 'whatsapp-cloud' | 'telegram' | 'signal';
  instanceId?: string;
  webhookUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  phoneNumber?: string;
  sessionData?: any;
  options?: Record<string, any>;
}

/**
 * Message handler interface for processing incoming messages
 */
export interface IMessageHandler {
  canHandle(message: IncomingMessage): boolean;
  handle(message: IncomingMessage, platform: IMessagePlatform): Promise<void>;
  priority: number; // Lower number = higher priority
}

/**
 * Platform factory interface
 */
export interface IPlatformFactory {
  createPlatform(config: PlatformConfig): IMessagePlatform;
  supportedPlatforms(): string[];
}