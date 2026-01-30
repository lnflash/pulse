import { FormattedText } from '../types/messages';

/**
 * Result returned from plugin execution
 */
export interface HandlerResult {
  text: FormattedText;
  voiceText?: string;
  error?: boolean;
}

/**
 * Platform-agnostic command context for plugins
 */
export interface CommandContext {
  userId: string;
  isAuthenticated: boolean;
  username?: string;
  isGroup: boolean;
  groupId?: string;
  language?: string;
  rawText: string;
}

/**
 * A recognizer pattern that the NLP pipeline uses to detect plugin intents
 */
export interface PluginRecognizer {
  pluginId: string;
  action: string;
  patterns: RegExp[];
  keywords: string[];
}

/**
 * Port interface all plugins must implement.
 * Hexagonal architecture boundary — no platform imports allowed.
 */
export interface PluginPort {
  /** Unique plugin identifier matching PluginId enum */
  id: string;
  /** Human-readable name */
  name: string;
  /** Brief description */
  description: string;

  /** Return recognizers for NLP pipeline registration */
  getRecognizers(): PluginRecognizer[];

  /** Execute a matched plugin action */
  execute(action: string, ctx: CommandContext): Promise<HandlerResult>;

  /** Called when plugin is loaded */
  onLoad(): Promise<void>;
  /** Called when plugin is unloaded */
  onUnload(): Promise<void>;
}
