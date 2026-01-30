import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Intent } from '../../../core/types';
import { CommandHandler } from '../handlers/command-handler.base';
import { INTENT_HANDLER_METADATA } from '../decorators/intent-handler.decorator';

@Injectable()
export class CommandRouterService implements OnModuleInit {
  private handlers = new Map<Intent, CommandHandler>();

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit() {
    const providers = this.discoveryService.getProviders();
    providers.forEach((wrapper) => {
      const { instance } = wrapper;
      if (!instance || typeof instance !== 'object') return;

      const intent = this.reflector.get<Intent>(INTENT_HANDLER_METADATA, instance.constructor);

      if (intent && instance instanceof CommandHandler) {
        this.handlers.set(intent, instance);
      }
    });
  }

  getHandler(intent: Intent): CommandHandler | null {
    return this.handlers.get(intent) || null;
  }
}
