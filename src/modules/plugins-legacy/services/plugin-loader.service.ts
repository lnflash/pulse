import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PulsePlugin,
  CommandDefinition,
  ParsedCommand,
  CommandContext,
  PluginResponse,
} from '../interfaces/plugin.interface';

/**
 * Service responsible for loading and managing plugins
 */
@Injectable()
export class PluginLoaderService {
  private readonly logger = new Logger(PluginLoaderService.name);
  private plugins = new Map<string, PulsePlugin>();
  private commandRegistry = new Map<string, { plugin: PulsePlugin; command: CommandDefinition }>();
  private patternRegistry: Array<{
    pattern: RegExp;
    plugin: PulsePlugin;
    command: CommandDefinition;
  }> = [];

  constructor(private eventEmitter: EventEmitter2) {}

  /**
   * Load a plugin into the system
   */
  async loadPlugin(plugin: PulsePlugin): Promise<void> {
    try {
      // Check if plugin already loaded
      if (this.plugins.has(plugin.id)) {
        this.logger.warn(`Plugin ${plugin.id} is already loaded`);
        return;
      }

      // Initialize plugin
      await plugin.onLoad();

      // Register plugin
      this.plugins.set(plugin.id, plugin);

      // Register commands
      for (const command of plugin.commands) {
        // Register primary trigger
        this.registerCommand(plugin, command, command.trigger);

        // Register aliases
        if (command.aliases) {
          for (const alias of command.aliases) {
            this.registerCommand(plugin, command, alias);
          }
        }

        // Register patterns
        if (command.patterns) {
          for (const pattern of command.patterns) {
            this.patternRegistry.push({ pattern, plugin, command });
          }
        }
      }

      this.logger.log(`Successfully loaded plugin: ${plugin.name} v${plugin.version}`);
      this.eventEmitter.emit('plugin.loaded', { pluginId: plugin.id });
    } catch (error) {
      this.logger.error(`Failed to load plugin ${plugin.id}:`, error);
      throw error;
    }
  }

  /**
   * Unload a plugin from the system
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      this.logger.warn(`Plugin ${pluginId} not found`);
      return;
    }

    try {
      // Call plugin cleanup
      await plugin.onUnload();

      // Remove from registries
      this.plugins.delete(pluginId);

      // Remove commands
      for (const [trigger, registration] of this.commandRegistry.entries()) {
        if (registration.plugin.id === pluginId) {
          this.commandRegistry.delete(trigger);
        }
      }

      // Remove patterns
      this.patternRegistry = this.patternRegistry.filter(
        (registration) => registration.plugin.id !== pluginId,
      );

      this.logger.log(`Successfully unloaded plugin: ${plugin.name}`);
      this.eventEmitter.emit('plugin.unloaded', { pluginId });
    } catch (error) {
      this.logger.error(`Failed to unload plugin ${pluginId}:`, error);
      throw error;
    }
  }

  /**
   * Get all loaded plugins
   */
  getLoadedPlugins(): PulsePlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get a specific plugin by ID
   */
  getPlugin(pluginId: string): PulsePlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Find and execute a command
   */
  async executeCommand(input: string, context: CommandContext): Promise<PluginResponse | null> {
    // Parse the input
    const parsedCommand = this.parseInput(input);
    if (!parsedCommand) {
      return null;
    }

    // Try exact command match first
    const registration = this.commandRegistry.get(parsedCommand.trigger.toLowerCase());
    if (registration) {
      return this.executePluginCommand(registration.plugin, parsedCommand, context);
    }

    // Try pattern matching
    for (const { pattern, plugin, command } of this.patternRegistry) {
      const match = input.match(pattern);
      if (match) {
        const nlCommand: ParsedCommand = {
          trigger: command.trigger,
          args: match.slice(1).filter(Boolean),
          rawText: input,
          isNaturalLanguage: true,
        };
        return this.executePluginCommand(plugin, nlCommand, context);
      }
    }

    return null;
  }

  /**
   * Get all available commands for help text
   */
  getAllCommands(): Array<{ plugin: string; command: CommandDefinition }> {
    const commands: Array<{ plugin: string; command: CommandDefinition }> = [];
    const seen = new Set<string>();

    for (const [, { plugin, command }] of this.commandRegistry) {
      const key = `${plugin.id}:${command.trigger}`;
      if (!seen.has(key)) {
        seen.add(key);
        commands.push({ plugin: plugin.name, command });
      }
    }

    return commands;
  }

  /**
   * Check if a plugin supports a specific permission
   */
  pluginHasPermission(pluginId: string, permission: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.requiredPermissions) {
      return true;
    }
    return plugin.requiredPermissions.includes(permission);
  }

  /**
   * Register a command trigger
   */
  private registerCommand(plugin: PulsePlugin, command: CommandDefinition, trigger: string): void {
    const normalizedTrigger = trigger.toLowerCase();
    if (this.commandRegistry.has(normalizedTrigger)) {
      this.logger.warn(
        `Command trigger "${trigger}" already registered, overwriting with plugin ${plugin.id}`,
      );
    }
    this.commandRegistry.set(normalizedTrigger, { plugin, command });
  }

  /**
   * Parse user input into a command
   */
  private parseInput(input: string): ParsedCommand | null {
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }

    const parts = trimmed.split(/\s+/);
    const trigger = parts[0].toLowerCase();
    const args = parts.slice(1);

    return {
      trigger,
      args,
      rawText: input,
      isNaturalLanguage: false,
    };
  }

  /**
   * Execute a command on a plugin
   */
  private async executePluginCommand(
    plugin: PulsePlugin,
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    try {
      // Check authentication requirement
      const commandDef = plugin.commands.find((cmd) => cmd.trigger === command.trigger);
      if (commandDef?.requiresAuth && !context.isAuthenticated) {
        return {
          text: '🔒 Please link your Flash account first with the `link` command.',
          error: {
            message: 'Authentication required',
            code: 'AUTH_REQUIRED',
            showToUser: true,
          },
        };
      }

      // Check group support
      if (context.isGroup && commandDef && !commandDef.groupSupported) {
        return {
          text: '🚫 This command is not available in groups. Please use it in a direct message.',
          error: {
            message: 'Command not supported in groups',
            code: 'GROUP_NOT_SUPPORTED',
            showToUser: true,
          },
        };
      }

      // Execute the command
      const response = await plugin.handleCommand(command, context);

      // Emit analytics event if specified
      if (response.analytics) {
        this.eventEmitter.emit('plugin.analytics', {
          pluginId: plugin.id,
          ...response.analytics,
        });
      }

      return response;
    } catch (error) {
      this.logger.error(
        `Error executing command "${command.trigger}" on plugin ${plugin.id}:`,
        error,
      );
      return {
        text: '❌ Sorry, something went wrong. Please try again later.',
        error: {
          message: error.message || 'Unknown error',
          code: 'PLUGIN_ERROR',
          showToUser: false,
        },
      };
    }
  }
}
