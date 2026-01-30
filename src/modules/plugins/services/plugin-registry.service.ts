import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import {
  PluginPort,
  PluginRecognizer,
  CommandContext,
  HandlerResult,
} from '../../../core/ports/plugin.port';
import { FormattedText } from '../../../core/types/messages';

export const PLUGIN_METADATA_KEY = 'PULSE_PLUGIN';

@Injectable()
export class PluginRegistryService implements OnModuleInit {
  private readonly logger = new Logger(PluginRegistryService.name);
  private plugins = new Map<string, PluginPort>();
  private recognizers: PluginRecognizer[] = [];

  constructor(private readonly discovery: DiscoveryService) {}

  async onModuleInit(): Promise<void> {
    const providers = this.discovery.getProviders();

    for (const wrapper of providers) {
      const instance = wrapper.instance;
      if (!instance || !this.isPlugin(instance)) continue;

      await this.register(instance as PluginPort);
    }

    this.logger.log(
      `Registered ${this.plugins.size} plugins with ${this.recognizers.length} recognizers`,
    );
  }

  async register(plugin: PluginPort): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      this.logger.warn(`Plugin ${plugin.id} already registered, skipping`);
      return;
    }

    await plugin.onLoad();
    this.plugins.set(plugin.id, plugin);

    const recognizers = plugin.getRecognizers();
    this.recognizers.push(...recognizers);

    this.logger.log(`Registered plugin: ${plugin.name} (${recognizers.length} recognizers)`);
  }

  async unregister(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    await plugin.onUnload();
    this.plugins.delete(pluginId);
    this.recognizers = this.recognizers.filter((r) => r.pluginId !== pluginId);
  }

  getPlugin(pluginId: string): PluginPort | undefined {
    return this.plugins.get(pluginId);
  }

  getAllPlugins(): PluginPort[] {
    return Array.from(this.plugins.values());
  }

  getAllRecognizers(): PluginRecognizer[] {
    return [...this.recognizers];
  }

  async execute(pluginId: string, action: string, ctx: CommandContext): Promise<HandlerResult> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      const errText: FormattedText = [{ type: 'text', value: 'Plugin not found.' }];
      return { text: errText, error: true };
    }

    return plugin.execute(action, ctx);
  }

  matchRecognizer(text: string): { recognizer: PluginRecognizer; confidence: number } | null {
    const normalized = text.toLowerCase().trim();

    for (const recognizer of this.recognizers) {
      for (const pattern of recognizer.patterns) {
        if (pattern.test(normalized)) {
          return { recognizer, confidence: 0.9 };
        }
      }
    }

    for (const recognizer of this.recognizers) {
      for (const keyword of recognizer.keywords) {
        if (normalized.includes(keyword.toLowerCase())) {
          return { recognizer, confidence: 0.7 };
        }
      }
    }

    return null;
  }

  private isPlugin(instance: unknown): boolean {
    if (!instance || typeof instance !== 'object') return false;
    const obj = instance as Record<string, unknown>;
    return (
      typeof obj.id === 'string' &&
      typeof obj.name === 'string' &&
      typeof obj.getRecognizers === 'function' &&
      typeof obj.execute === 'function' &&
      typeof obj.onLoad === 'function' &&
      typeof obj.onUnload === 'function'
    );
  }
}
