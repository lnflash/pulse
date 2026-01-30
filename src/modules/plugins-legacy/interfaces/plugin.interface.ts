import { Injectable } from '@nestjs/common';

/**
 * Base interface for all Pulse plugins
 * Allows modular extension of functionality beyond payments
 */
export interface PulsePlugin {
  /**
   * Unique identifier for the plugin
   */
  id: string;

  /**
   * Display name for the plugin
   */
  name: string;

  /**
   * Brief description of what the plugin does
   */
  description: string;

  /**
   * Plugin version following semver
   */
  version: string;

  /**
   * Whether the plugin is enabled by default
   */
  enabledByDefault?: boolean;

  /**
   * Required permissions for the plugin
   */
  requiredPermissions?: string[];

  /**
   * Lifecycle hooks
   */
  onLoad(): Promise<void>;
  onUnload(): Promise<void>;

  /**
   * Command definitions this plugin provides
   */
  commands: CommandDefinition[];

  /**
   * Handle a command if it matches this plugin
   */
  handleCommand(command: ParsedCommand, context: CommandContext): Promise<PluginResponse>;

  /**
   * Get AI context for enhanced responses
   */
  getAIContext?(userId: string): Promise<AIContext>;

  /**
   * Enhance AI prompts with plugin-specific context
   */
  enhancePrompt?(prompt: string, userId: string): Promise<string>;

  /**
   * Event handlers
   */
  onMessage?(message: IncomingMessage, context: MessageContext): Promise<void>;
  onPayment?(payment: PaymentEvent, context: PaymentContext): Promise<void>;
  onGroupJoin?(groupId: string, userId: string): Promise<void>;
  onGroupLeave?(groupId: string, userId: string): Promise<void>;
}

/**
 * Command definition for plugin commands
 */
export interface CommandDefinition {
  /**
   * Primary command trigger
   */
  trigger: string;

  /**
   * Alternative triggers/aliases
   */
  aliases?: string[];

  /**
   * Natural language patterns that match this command
   */
  patterns?: RegExp[];

  /**
   * Command description for help text
   */
  description: string;

  /**
   * Usage examples
   */
  examples?: string[];

  /**
   * Whether this command requires authentication
   */
  requiresAuth?: boolean;

  /**
   * Whether this command works in groups
   */
  groupSupported?: boolean;

  /**
   * Rate limit configuration
   */
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
}

/**
 * Parsed command from user input
 */
export interface ParsedCommand {
  /**
   * The command trigger that was matched
   */
  trigger: string;

  /**
   * Arguments passed to the command
   */
  args: string[];

  /**
   * Raw message text
   */
  rawText: string;

  /**
   * Whether this came from natural language parsing
   */
  isNaturalLanguage?: boolean;
}

/**
 * Context provided with commands
 */
export interface CommandContext {
  /**
   * User's WhatsApp ID
   */
  userId: string;

  /**
   * User's phone number
   */
  phoneNumber: string;

  /**
   * Whether the user is authenticated with Flash
   */
  isAuthenticated: boolean;

  /**
   * User's Flash username if authenticated
   */
  username?: string;

  /**
   * Whether this is a group message
   */
  isGroup: boolean;

  /**
   * Group ID if applicable
   */
  groupId?: string;

  /**
   * User's current voice mode setting
   */
  voiceMode?: 'on' | 'off' | 'only';

  /**
   * User's selected voice
   */
  selectedVoice?: string;

  /**
   * User's language preference
   */
  language?: string;
}

/**
 * Response from plugin command handling
 */
export interface PluginResponse {
  /**
   * Text response to send
   */
  text?: string;

  /**
   * Voice response to generate
   */
  voiceText?: string;

  /**
   * Media to send
   */
  media?: {
    type: 'image' | 'video' | 'audio' | 'document';
    url?: string;
    data?: Buffer;
    caption?: string;
  };

  /**
   * Interactive elements
   */
  buttons?: Array<{
    id: string;
    text: string;
  }>;

  /**
   * Whether to show typing indicator
   */
  showTyping?: boolean;

  /**
   * Delay before sending response (ms)
   */
  delay?: number;

  /**
   * Follow-up actions
   */
  followUp?: {
    action: string;
    delay: number;
    data?: any;
  };

  /**
   * Analytics event to track
   */
  analytics?: {
    event: string;
    properties?: Record<string, any>;
  };

  /**
   * Whether this response should be stored in memory
   */
  storeInMemory?: boolean;

  /**
   * Error information if command failed
   */
  error?: {
    message: string;
    code?: string;
    showToUser?: boolean;
  };
}

/**
 * AI context for enhanced responses
 */
export interface AIContext {
  /**
   * Plugin-specific context
   */
  pluginContext: string;

  /**
   * Relevant user data
   */
  userData?: Record<string, any>;

  /**
   * Recent interactions
   */
  recentInteractions?: Array<{
    timestamp: Date;
    type: string;
    data: any;
  }>;

  /**
   * Suggested responses
   */
  suggestedResponses?: string[];
}

/**
 * Incoming message structure
 */
export interface IncomingMessage {
  id: string;
  from: string;
  text?: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document';
  timestamp: Date;
  isGroup: boolean;
  groupId?: string;
  quotedMessage?: any;
  media?: any;
}

/**
 * Message context
 */
export interface MessageContext extends CommandContext {
  message: IncomingMessage;
}

/**
 * Payment event structure
 */
export interface PaymentEvent {
  id: string;
  type: 'sent' | 'received';
  amount: number;
  currency: 'USD' | 'BTC';
  from?: string;
  to?: string;
  memo?: string;
  timestamp: Date;
}

/**
 * Payment context
 */
export interface PaymentContext extends CommandContext {
  payment: PaymentEvent;
}

/**
 * Base class for plugins to extend
 */
@Injectable()
export abstract class BasePlugin implements PulsePlugin {
  abstract id: string;
  abstract name: string;
  abstract description: string;
  abstract version: string;
  abstract commands: CommandDefinition[];

  async onLoad(): Promise<void> {
    console.log(`Loading plugin: ${this.name} v${this.version}`);
  }

  async onUnload(): Promise<void> {
    console.log(`Unloading plugin: ${this.name}`);
  }

  abstract handleCommand(command: ParsedCommand, context: CommandContext): Promise<PluginResponse>;
}
