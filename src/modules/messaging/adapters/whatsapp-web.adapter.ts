import { Injectable, Logger } from '@nestjs/common';
import { Client, Message, MessageMedia, Chat, Contact } from 'whatsapp-web.js';
import {
  IMessagePlatform,
  IncomingMessage,
  OutgoingMessage,
  MessageContent,
  MessageReceipt,
  MessageType,
  PlatformStatus,
  PlatformConfig,
  PlatformUser,
  GroupInfo
} from '../abstractions/message-platform.interface';

@Injectable()
export class WhatsAppWebAdapter implements IMessagePlatform {
  private logger = new Logger(WhatsAppWebAdapter.name);
  private client: Client;
  private status: PlatformStatus = PlatformStatus.DISCONNECTED;
  private messageHandlers: ((message: IncomingMessage) => Promise<void>)[] = [];
  private statusHandlers: ((receipt: MessageReceipt) => Promise<void>)[] = [];
  private connectionHandlers: ((status: PlatformStatus) => Promise<void>)[] = [];
  private config: PlatformConfig;

  async initialize(config: PlatformConfig): Promise<void> {
    this.config = config;
    this.logger.log(`Initializing WhatsApp Web adapter for instance: ${config.instanceId || 'default'}`);

    // Initialize WhatsApp Web client
    this.client = new Client({
      authStrategy: config.sessionData,
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      },
      ...config.options
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle QR code generation
    this.client.on('qr', async (qr) => {
      this.status = PlatformStatus.QR_REQUIRED;
      this.logger.log('QR Code generated');
      await this.notifyConnectionStatus(PlatformStatus.QR_REQUIRED);
    });

    // Handle successful authentication
    this.client.on('authenticated', async () => {
      this.status = PlatformStatus.AUTHENTICATED;
      this.logger.log('WhatsApp Web authenticated');
      await this.notifyConnectionStatus(PlatformStatus.AUTHENTICATED);
    });

    // Handle ready state
    this.client.on('ready', async () => {
      this.status = PlatformStatus.CONNECTED;
      this.logger.log('WhatsApp Web client ready');
      await this.notifyConnectionStatus(PlatformStatus.CONNECTED);
    });

    // Handle disconnection
    this.client.on('disconnected', async (reason) => {
      this.status = PlatformStatus.DISCONNECTED;
      this.logger.warn(`WhatsApp Web disconnected: ${reason}`);
      await this.notifyConnectionStatus(PlatformStatus.DISCONNECTED);
    });

    // Handle incoming messages
    this.client.on('message', async (msg: Message) => {
      try {
        const incomingMessage = await this.convertToIncomingMessage(msg);
        await this.notifyMessageHandlers(incomingMessage);
      } catch (error) {
        this.logger.error('Error processing incoming message:', error);
      }
    });

    // Handle message acknowledgments
    this.client.on('message_ack', async (msg: Message, ack: number) => {
      const receipt: MessageReceipt = {
        messageId: msg.id._serialized,
        status: this.convertAckToStatus(ack),
        timestamp: new Date()
      };
      await this.notifyStatusHandlers(receipt);
    });
  }

  async connect(): Promise<void> {
    this.status = PlatformStatus.CONNECTING;
    await this.notifyConnectionStatus(PlatformStatus.CONNECTING);
    await this.client.initialize();
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
    }
    this.status = PlatformStatus.DISCONNECTED;
    await this.notifyConnectionStatus(PlatformStatus.DISCONNECTED);
  }

  getStatus(): PlatformStatus {
    return this.status;
  }

  async sendMessage(message: OutgoingMessage): Promise<MessageReceipt> {
    try {
      const chat = await this.client.getChatById(this.formatChatId(message.to));
      let sentMessage: Message;

      if (message.content.text) {
        sentMessage = await chat.sendMessage(message.content.text, {
          // mentions are not supported in v1.19.5 as Contact[]
          // mentions: message.options?.mentions,
          quotedMessageId: message.replyTo
        });
      } else if (message.content.voice) {
        const media = new MessageMedia('audio/ogg; codecs=opus', 
          message.content.voice.toString('base64'), 'voice.ogg');
        sentMessage = await chat.sendMessage(media, {
          sendAudioAsVoice: true,
          quotedMessageId: message.replyTo
        });
      } else if (message.content.image) {
        const media = new MessageMedia('image/jpeg', 
          message.content.image.toString('base64'), 'image.jpg');
        sentMessage = await chat.sendMessage(media, {
          caption: message.content.text,
          quotedMessageId: message.replyTo
        });
      } else {
        throw new Error('Unsupported message content type');
      }

      return {
        messageId: sentMessage.id._serialized,
        status: 'sent',
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('Error sending message:', error);
      return {
        messageId: '',
        status: 'failed',
        timestamp: new Date(),
        error: error.message
      };
    }
  }

  async sendBulkMessages(messages: OutgoingMessage[]): Promise<MessageReceipt[]> {
    const receipts: MessageReceipt[] = [];
    
    for (const message of messages) {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      const receipt = await this.sendMessage(message);
      receipts.push(receipt);
    }
    
    return receipts;
  }

  async editMessage(messageId: string, newContent: MessageContent): Promise<boolean> {
    // Message editing is not supported in whatsapp-web.js v1.19.5
    this.logger.warn('Message editing is not supported in whatsapp-web.js v1.19.5');
    return false;
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    // Message deletion via getMessageById is not supported in whatsapp-web.js v1.19.5
    this.logger.warn('Message deletion via getMessageById is not supported in whatsapp-web.js v1.19.5');
    return false;
  }

  async sendVoice(to: string, audio: Buffer, caption?: string): Promise<MessageReceipt> {
    return this.sendMessage({
      to,
      content: { voice: audio, text: caption }
    });
  }

  async sendImage(to: string, image: Buffer, caption?: string): Promise<MessageReceipt> {
    return this.sendMessage({
      to,
      content: { image, text: caption }
    });
  }

  async sendDocument(to: string, document: Buffer, filename: string, caption?: string): Promise<MessageReceipt> {
    try {
      const chat = await this.client.getChatById(this.formatChatId(to));
      const media = new MessageMedia('application/octet-stream', 
        document.toString('base64'), filename);
      
      const sentMessage = await chat.sendMessage(media, {
        caption: caption
      });

      return {
        messageId: sentMessage.id._serialized,
        status: 'sent',
        timestamp: new Date()
      };
    } catch (error) {
      return {
        messageId: '',
        status: 'failed',
        timestamp: new Date(),
        error: error.message
      };
    }
  }

  async downloadMedia(messageId: string): Promise<Buffer> {
    // Media download via getMessageById is not supported in whatsapp-web.js v1.19.5
    this.logger.warn('Media download via getMessageById is not supported in whatsapp-web.js v1.19.5');
    throw new Error('Media download not supported in this version');
  }

  async getUserInfo(userId: string): Promise<PlatformUser> {
    try {
      const contact = await this.client.getContactById(this.formatChatId(userId));
      const profilePic = await contact.getProfilePicUrl();
      
      return {
        id: contact.id._serialized,
        phone: contact.number,
        name: contact.pushname || contact.name,
        profilePicture: profilePic,
        isBusinessAccount: contact.isBusiness,
        metadata: {
          isMyContact: contact.isMyContact,
          isBlocked: contact.isBlocked
        }
      };
    } catch (error) {
      this.logger.error('Error getting user info:', error);
      throw error;
    }
  }

  async getProfilePicture(userId: string): Promise<Buffer | null> {
    try {
      const contact = await this.client.getContactById(this.formatChatId(userId));
      const url = await contact.getProfilePicUrl();
      
      if (url) {
        // Fetch the image (you might need to implement actual downloading)
        // For now, returning null as this requires additional HTTP client
        return null;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async blockUser(userId: string): Promise<boolean> {
    try {
      const contact = await this.client.getContactById(this.formatChatId(userId));
      await contact.block();
      return true;
    } catch (error) {
      this.logger.error('Error blocking user:', error);
      return false;
    }
  }

  async unblockUser(userId: string): Promise<boolean> {
    try {
      const contact = await this.client.getContactById(this.formatChatId(userId));
      await contact.unblock();
      return true;
    } catch (error) {
      this.logger.error('Error unblocking user:', error);
      return false;
    }
  }

  async getGroupInfo(groupId: string): Promise<GroupInfo> {
    try {
      const chat = await this.client.getChatById(this.formatChatId(groupId));
      
      if (chat.isGroup) {
        const groupChat = chat as any; // Type assertion for group-specific properties
        
        return {
          id: chat.id._serialized,
          name: chat.name,
          description: groupChat.description,
          participants: groupChat.participants.map((p: any) => p.id._serialized),
          admins: groupChat.participants
            .filter((p: any) => p.isAdmin)
            .map((p: any) => p.id._serialized),
          created: new Date(groupChat.createdAt * 1000),
          profilePicture: undefined // await chat.getProfilePicUrl() - method not available
        };
      }
      
      throw new Error('Not a group chat');
    } catch (error) {
      this.logger.error('Error getting group info:', error);
      throw error;
    }
  }

  async createGroup(name: string, participants: string[]): Promise<string> {
    try {
      const formattedParticipants = participants.map(p => this.formatChatId(p));
      const result = await this.client.createGroup(name, formattedParticipants);
      return typeof result === 'string' ? result : (result as any).gid._serialized;
    } catch (error) {
      this.logger.error('Error creating group:', error);
      throw error;
    }
  }

  async addToGroup(groupId: string, participants: string[]): Promise<boolean> {
    try {
      const chat = await this.client.getChatById(this.formatChatId(groupId));
      if (chat.isGroup) {
        const formattedParticipants = participants.map(p => this.formatChatId(p));
        await (chat as any).addParticipants(formattedParticipants);
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error('Error adding to group:', error);
      return false;
    }
  }

  async removeFromGroup(groupId: string, participants: string[]): Promise<boolean> {
    try {
      const chat = await this.client.getChatById(this.formatChatId(groupId));
      if (chat.isGroup) {
        const formattedParticipants = participants.map(p => this.formatChatId(p));
        await (chat as any).removeParticipants(formattedParticipants);
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error('Error removing from group:', error);
      return false;
    }
  }

  async leaveGroup(groupId: string): Promise<boolean> {
    try {
      const chat = await this.client.getChatById(this.formatChatId(groupId));
      if (chat.isGroup) {
        await (chat as any).leave();
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error('Error leaving group:', error);
      return false;
    }
  }

  async setStatus(status: string): Promise<boolean> {
    try {
      await this.client.setStatus(status);
      return true;
    } catch (error) {
      this.logger.error('Error setting status:', error);
      return false;
    }
  }

  async setProfilePicture(image: Buffer): Promise<boolean> {
    // setProfilePicture is not available in whatsapp-web.js v1.19.5
    this.logger.warn('setProfilePicture is not available in whatsapp-web.js v1.19.5');
    return false;
  }

  onMessage(handler: (message: IncomingMessage) => Promise<void>): void {
    this.messageHandlers.push(handler);
  }

  onMessageStatus(handler: (receipt: MessageReceipt) => Promise<void>): void {
    this.statusHandlers.push(handler);
  }

  onConnectionStatus(handler: (status: PlatformStatus) => Promise<void>): void {
    this.connectionHandlers.push(handler);
  }

  async getQRCode(): Promise<string> {
    return new Promise((resolve) => {
      this.client.once('qr', (qr) => {
        resolve(qr);
      });
    });
  }

  isRegistered(phoneNumber: string): Promise<boolean> {
    return this.client.isRegisteredUser(this.formatChatId(phoneNumber));
  }

  formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-digits
    const digits = phoneNumber.replace(/\D/g, '');
    
    // Add country code if not present (assuming US for example)
    if (!digits.startsWith('1') && digits.length === 10) {
      return `1${digits}`;
    }
    
    return digits;
  }

  // Private helper methods
  private formatChatId(id: string): string {
    if (id.includes('@')) {
      return id;
    }
    // Format as WhatsApp ID
    const cleaned = id.replace(/\D/g, '');
    return `${cleaned}@c.us`;
  }

  private async convertToIncomingMessage(msg: Message): Promise<IncomingMessage> {
    const chat = await msg.getChat();
    const contact = await msg.getContact();
    
    let messageType = MessageType.TEXT;
    const content: MessageContent = {};

    if (msg.hasMedia) {
      const media = await msg.downloadMedia();
      
      if (msg.type === 'audio' || msg.type === 'ptt') {
        messageType = MessageType.VOICE;
        content.voice = Buffer.from(media.data, 'base64');
      } else if (msg.type === 'image') {
        messageType = MessageType.IMAGE;
        content.image = Buffer.from(media.data, 'base64');
      } else if (msg.type === 'document') {
        messageType = MessageType.DOCUMENT;
        content.document = Buffer.from(media.data, 'base64');
      }
    } else if (msg.type === 'location') {
      messageType = MessageType.LOCATION;
      content.location = {
        latitude: (msg as any).location.latitude,
        longitude: (msg as any).location.longitude
      };
    } else if (msg.type === 'vcard') {
      messageType = MessageType.CONTACT;
      content.contacts = [{
        name: (msg as any).vCards[0]?.displayName || '',
        phone: (msg as any).vCards[0]?.number || ''
      }];
    }

    if (msg.body) {
      content.text = msg.body;
    }

    return {
      id: msg.id._serialized,
      from: contact.id._serialized,
      to: chat.id._serialized,
      timestamp: new Date(msg.timestamp * 1000),
      type: messageType,
      content,
      isGroup: chat.isGroup,
      groupId: chat.isGroup ? chat.id._serialized : undefined,
      replyTo: msg.hasQuotedMsg ? (await msg.getQuotedMessage())?.id._serialized : undefined,
      metadata: {
        isForwarded: msg.isForwarded,
        isStatus: msg.isStatus,
        fromMe: msg.fromMe
      }
    };
  }

  private convertAckToStatus(ack: number): 'sent' | 'delivered' | 'read' | 'failed' {
    switch (ack) {
      case 0: return 'failed';
      case 1: return 'sent';
      case 2: return 'delivered';
      case 3: return 'read';
      default: return 'sent';
    }
  }

  private async notifyMessageHandlers(message: IncomingMessage): Promise<void> {
    for (const handler of this.messageHandlers) {
      try {
        await handler(message);
      } catch (error) {
        this.logger.error('Error in message handler:', error);
      }
    }
  }

  private async notifyStatusHandlers(receipt: MessageReceipt): Promise<void> {
    for (const handler of this.statusHandlers) {
      try {
        await handler(receipt);
      } catch (error) {
        this.logger.error('Error in status handler:', error);
      }
    }
  }

  private async notifyConnectionStatus(status: PlatformStatus): Promise<void> {
    for (const handler of this.connectionHandlers) {
      try {
        await handler(status);
      } catch (error) {
        this.logger.error('Error in connection handler:', error);
      }
    }
  }
}