import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { PluginRegistryService } from './services/plugin-registry.service';
import { TriviaPlugin } from './trivia/trivia.plugin';
import { DailyChallengePlugin } from './daily-challenge/daily-challenge.plugin';
import { GroupGamesPlugin } from './group-games/group-games.plugin';
import { AnonymousPlugin } from './anonymous/anonymous.plugin';
import { DecisionPlugin } from './decision/decision.plugin';
import { TranslationPlugin } from './translation/translation.plugin';
import { EntertainmentPlugin } from './entertainment/entertainment.plugin';

const SESSION_PORT_PROVIDER = {
  provide: 'SessionPort',
  useFactory: () => ({
    getSession: async () => null,
    getOrCreateSession: async (userId: string) => ({ userId, lastActivity: new Date() }),
    updateSession: async () => {},
    deleteSession: async () => {},
  }),
};

@Module({
  imports: [DiscoveryModule],
  providers: [
    SESSION_PORT_PROVIDER,
    PluginRegistryService,
    TriviaPlugin,
    DailyChallengePlugin,
    GroupGamesPlugin,
    AnonymousPlugin,
    DecisionPlugin,
    TranslationPlugin,
    EntertainmentPlugin,
  ],
  exports: [PluginRegistryService],
})
export class PluginsModule {}
