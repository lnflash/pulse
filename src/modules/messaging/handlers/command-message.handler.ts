import { Injectable, Logger } from '@nestjs/common';
import { BaseMessageHandler } from './base-message.handler';
import { IMessagePlatform, IncomingMessage, MessageType } from '../abstractions/message-platform.interface';
import { CommandExecutorService } from '../../whatsapp/commands/command-executor.service';
import { SessionService } from '../../auth/services/session.service';

/**
 * Handles command messages in a platform-agnostic way
 */
@Injectable()
export class CommandMessageHandler extends BaseMessageHandler {
  private readonly logger = new Logger(CommandMessageHandler.name);
  priority = 10; // High priority for commands

  constructor(
    private readonly commandExecutor: CommandExecutorService,
    private readonly sessionService: SessionService
  ) {
    super();
  }

  canHandle(message: IncomingMessage): boolean {
    // Handle text messages that might contain commands
    if (message.type !== MessageType.TEXT || !message.content.text) {
      return false;
    }

    // Check if it starts with a command pattern or known commands
    const text = message.content.text.toLowerCase().trim();
    
    // Common command patterns
    const commandPatterns = [
      /^(help|balance|send|request|link|status)/i,
      /^[!/.]/,  // Command prefixes
      /^(check|pay|transfer|invoice)/i
    ];

    return commandPatterns.some(pattern => pattern.test(text));
  }

  async handle(message: IncomingMessage, platform: IMessagePlatform): Promise<void> {
    try {
      const userId = this.extractPhoneNumber(message.from);
      const text = message.content.text!;
      
      // Get or create session
      const session = await this.sessionService.getSession(userId);
      
      // Parse the command
      const parsedCommand = this.parseCommand(text);
      
      if (!parsedCommand) {
        await this.reply(message, platform, "I couldn't understand that command. Try 'help' for available commands.");
        return;
      }

      // Execute command through the command executor
      const result = await this.commandExecutor.execute({
        command: parsedCommand.command,
        args: parsedCommand.args,
        userId,
        session,
        platform,
        originalMessage: message
      });

      // Send the response
      if (result.success) {
        if (result.voice) {
          await this.reply(message, platform, {
            text: result.message,
            voice: result.voice
          });
        } else if (result.image) {
          await this.reply(message, platform, {
            text: result.message,
            image: result.image
          });
        } else {
          await this.reply(message, platform, result.message);
        }
      } else {
        await this.reply(message, platform, `❌ ${result.message}`);
      }

      // Log command execution
      this.logger.log(`Command executed: ${parsedCommand.command} by ${userId}`);
      
    } catch (error) {
      this.logger.error('Error handling command:', error);
      await this.reply(
        message, 
        platform, 
        "Sorry, there was an error processing your command. Please try again."
      );
    }
  }

  private parseCommand(text: string): { command: string; args: string[] } | null {
    const trimmed = text.trim();
    
    // Check for command prefix
    if (trimmed.startsWith('!') || trimmed.startsWith('/') || trimmed.startsWith('.')) {
      const parts = trimmed.slice(1).split(/\s+/);
      return {
        command: parts[0].toLowerCase(),
        args: parts.slice(1)
      };
    }
    
    // Check for natural language commands
    const lowerText = trimmed.toLowerCase();
    
    // Balance command
    if (lowerText.includes('balance') || lowerText.includes('how much')) {
      return { command: 'balance', args: [] };
    }
    
    // Send command
    const sendMatch = lowerText.match(/send\s+(\S+)\s+to\s+(\S+)/);
    if (sendMatch) {
      return { command: 'send', args: [sendMatch[1], 'to', sendMatch[2]] };
    }
    
    // Help command
    if (lowerText === 'help' || lowerText.includes('what can you do')) {
      return { command: 'help', args: [] };
    }
    
    // Link command
    if (lowerText.includes('link') || lowerText.includes('connect')) {
      return { command: 'link', args: [] };
    }
    
    // Status command
    if (lowerText === 'status') {
      return { command: 'status', args: [] };
    }
    
    // If it's a single word that matches a command
    const singleWord = trimmed.split(/\s+/)[0].toLowerCase();
    const knownCommands = ['help', 'balance', 'send', 'request', 'link', 'status', 'invoice', 'pay'];
    
    if (knownCommands.includes(singleWord)) {
      return {
        command: singleWord,
        args: trimmed.split(/\s+/).slice(1)
      };
    }
    
    return null;
  }
}