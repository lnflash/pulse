import { Module, OnModuleInit } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PluginLoaderService } from './services/plugin-loader.service';
import { JokeMemePlugin } from './entertainment/joke-meme.plugin';
import { TriviaPlugin } from './games/trivia.plugin';
import { DailyChallengePlugin } from './games/daily-challenge.plugin';
import { GroupGamesPlugin } from './social/group-games.plugin';
import { AnonymousMessagingPlugin } from './social/anonymous-messaging.plugin';
import { DecisionMakingPlugin } from './social/decision-making.plugin';
import { TranslationPlugin } from './social/translation.plugin';
import { RedisModule } from '../redis/redis.module';
import { FlashApiModule } from '../flash-api/flash-api.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [EventEmitterModule.forRoot(), RedisModule, FlashApiModule, AuthModule],
  providers: [
    PluginLoaderService,
    JokeMemePlugin,
    TriviaPlugin,
    DailyChallengePlugin,
    GroupGamesPlugin,
    AnonymousMessagingPlugin,
    DecisionMakingPlugin,
    TranslationPlugin,
  ],
  exports: [PluginLoaderService],
})
export class PluginsModule implements OnModuleInit {
  constructor(
    private pluginLoader: PluginLoaderService,
    private jokeMemePlugin: JokeMemePlugin,
    private triviaPlugin: TriviaPlugin,
    private dailyChallengePlugin: DailyChallengePlugin,
    private groupGamesPlugin: GroupGamesPlugin,
    private anonymousMessagingPlugin: AnonymousMessagingPlugin,
    private decisionMakingPlugin: DecisionMakingPlugin,
    private translationPlugin: TranslationPlugin,
  ) {}

  async onModuleInit() {
    // Load default plugins
    await this.pluginLoader.loadPlugin(this.jokeMemePlugin);
    await this.pluginLoader.loadPlugin(this.triviaPlugin);
    await this.pluginLoader.loadPlugin(this.dailyChallengePlugin);
    await this.pluginLoader.loadPlugin(this.groupGamesPlugin);
    await this.pluginLoader.loadPlugin(this.anonymousMessagingPlugin);
    await this.pluginLoader.loadPlugin(this.decisionMakingPlugin);
    await this.pluginLoader.loadPlugin(this.translationPlugin);
  }
}
