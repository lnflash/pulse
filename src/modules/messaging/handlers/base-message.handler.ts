import { Injectable } from '@nestjs/common';
import { IMessageHandler, IMessagePlatform, IncomingMessage } from '../abstractions/message-platform.interface';

/**
 * Base abstract class for message handlers
 * Provides common functionality for all message handlers
 */
@Injectable()
export abstract class BaseMessageHandler implements IMessageHandler {
  abstract priority: number;
  
  /**
   * Determines if this handler can process the given message
   */
  abstract canHandle(message: IncomingMessage): boolean;
  
  /**
   * Processes the message
   */
  abstract handle(message: IncomingMessage, platform: IMessagePlatform): Promise<void>;
  
  /**
   * Helper method to extract phone number from various ID formats
   */
  protected extractPhoneNumber(id: string): string {
    // Remove WhatsApp suffixes
    let phone = id.replace('@c.us', '').replace('@s.whatsapp.net', '');
    
    // Remove any non-digit characters except +
    phone = phone.replace(/[^\d+]/g, '');
    
    return phone;
  }
  
  /**
   * Helper method to check if message is from a group
   */
  protected isGroupMessage(message: IncomingMessage): boolean {
    return message.isGroup || false;
  }
  
  /**
   * Helper method to check if message is a reply
   */
  protected isReply(message: IncomingMessage): boolean {
    return !!message.replyTo;
  }
  
  /**
   * Helper method to format a user-friendly ID
   */
  protected formatUserId(id: string): string {
    const phone = this.extractPhoneNumber(id);
    
    // Format as international number if possible
    if (phone.startsWith('1') && phone.length === 11) {
      // US/Canada format: +1 (XXX) XXX-XXXX
      return `+${phone.slice(0, 1)} (${phone.slice(1, 4)}) ${phone.slice(4, 7)}-${phone.slice(7)}`;
    } else if (phone.length >= 10) {
      // Generic international format
      return `+${phone}`;
    }
    
    return phone;
  }
  
  /**
   * Helper to check if message contains a command
   */
  protected extractCommand(text: string): { command: string; args: string[] } | null {
    if (!text) return null;
    
    // Check for command prefix (!, /, or .)
    const commandMatch = text.match(/^[!/.](\\w+)\\s*(.*)/);
    if (!commandMatch) return null;
    
    const command = commandMatch[1].toLowerCase();
    const args = commandMatch[2] ? commandMatch[2].split(/\\s+/).filter(arg => arg.length > 0) : [];
    
    return { command, args };
  }
  
  /**
   * Helper to send a reply to a message
   */
  protected async reply(
    message: IncomingMessage,
    platform: IMessagePlatform,
    content: string | { text?: string; voice?: Buffer; image?: Buffer }
  ): Promise<void> {
    const replyContent = typeof content === 'string' 
      ? { text: content }
      : content;
    
    await platform.sendMessage({
      to: message.isGroup ? message.groupId! : message.from,
      content: replyContent,
      replyTo: message.id
    });
  }
  
  /**
   * Helper to send a typing indicator (if supported)
   */
  protected async sendTyping(to: string, platform: IMessagePlatform): Promise<void> {
    // This would be implemented if the platform supports typing indicators
    // For now, it's a no-op
  }
  
  /**
   * Helper to react to a message (if supported)
   */
  protected async react(messageId: string, emoji: string, platform: IMessagePlatform): Promise<void> {
    // This would be implemented if the platform supports reactions
    // For now, it's a no-op
  }
}