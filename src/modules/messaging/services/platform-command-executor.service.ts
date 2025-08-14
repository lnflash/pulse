import { Injectable, Logger } from '@nestjs/common';
import { IMessagePlatform, IncomingMessage } from '../abstractions/message-platform.interface';
import { CommandRegistry } from '../../whatsapp/commands/command-registry.service';
import { CommandResult } from '../../whatsapp/commands/base/command-result.interface';
import { UserSession } from '../../auth/interfaces/user-session.interface';

export interface PlatformCommandContext {
  command: string;
  args: string[];
  userId: string;
  session: UserSession | null;
  platform: IMessagePlatform;
  originalMessage: IncomingMessage;
}

export interface PlatformCommandResult extends CommandResult {
  voice?: Buffer;
  image?: Buffer;
  document?: Buffer;
}

/**
 * Platform-agnostic command executor
 * Executes commands regardless of the messaging platform
 */
@Injectable()
export class PlatformCommandExecutorService {
  private readonly logger = new Logger(PlatformCommandExecutorService.name);

  constructor(
    private readonly commandRegistry: CommandRegistry
  ) {}

  /**
   * Execute a command in a platform-agnostic way
   */
  async execute(context: PlatformCommandContext): Promise<PlatformCommandResult> {
    const { command, args, userId, session, platform, originalMessage } = context;
    
    this.logger.debug(`Executing command: ${command} for user: ${userId}`);

    try {
      // Get the command handler from registry
      const handler = this.commandRegistry.getHandler(command);
      
      if (!handler) {
        return {
          success: false,
          message: `Unknown command: ${command}. Try 'help' for available commands.`
        };
      }

      // Check if user has permission to run this command
      if (!session && this.requiresAuth(command)) {
        return {
          success: false,
          message: "You need to link your account first. Use the 'link' command to get started."
        };
      }

      // Build command context for the handler
      const commandContext = {
        userId,
        session,
        args,
        platform,
        originalMessage,
        isVoiceCommand: originalMessage.type === 'voice',
        isGroupMessage: originalMessage.isGroup,
        groupId: originalMessage.groupId
      };

      // Execute the command
      const result = await handler.execute(commandContext);

      // Log successful execution
      this.logger.log(`Command ${command} executed successfully for ${userId}`);

      return {
        success: true,
        message: result.message,
        data: result.data,
        voice: result.voice,
        image: result.image
      };

    } catch (error) {
      this.logger.error(`Error executing command ${command}:`, error);
      
      return {
        success: false,
        message: "An error occurred while processing your command. Please try again."
      };
    }
  }

  /**
   * Check if a command requires authentication
   */
  private requiresAuth(command: string): boolean {
    const publicCommands = ['help', 'link', 'status', 'info'];
    return !publicCommands.includes(command.toLowerCase());
  }

  /**
   * Get available commands for a user
   */
  getAvailableCommands(session: UserSession | null): string[] {
    const commands = this.commandRegistry.getAllCommands();
    
    if (!session) {
      // Return only public commands
      return commands.filter(cmd => !this.requiresAuth(cmd));
    }
    
    return commands;
  }

  /**
   * Get command help text
   */
  getCommandHelp(command: string): string {
    const handler = this.commandRegistry.getHandler(command);
    
    if (!handler) {
      return `Unknown command: ${command}`;
    }
    
    return handler.getHelp ? handler.getHelp() : `Command: ${command}`;
  }

  /**
   * Generate help message for all available commands
   */
  generateHelpMessage(session: UserSession | null): string {
    const commands = this.getAvailableCommands(session);
    
    let helpMessage = "📱 *Available Commands*\n\n";
    
    const commandDescriptions: Record<string, string> = {
      help: "Show this help message",
      balance: "Check your wallet balance",
      send: "Send money (e.g., 'send 50 to John')",
      request: "Request payment (e.g., 'request 20 from Sarah')",
      link: "Link your Flash account",
      status: "Check connection status",
      invoice: "Create a Lightning invoice",
      pay: "Pay a Lightning invoice",
      history: "View recent transactions",
      settings: "Manage your settings"
    };
    
    commands.forEach(cmd => {
      const description = commandDescriptions[cmd] || this.getCommandHelp(cmd);
      helpMessage += `• *${cmd}* - ${description}\n`;
    });
    
    if (!session) {
      helpMessage += "\n🔗 Link your account with 'link' to access all features!";
    }
    
    return helpMessage;
  }
}