import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { RedisModule } from './common/redis/redis.module';
import { BotCoreModule } from './modules/bot-core/bot-core.module';
import { PlatformModule } from './modules/platform/platform.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { IdentityModule } from './modules/identity/identity.module';
import { SessionModule } from './modules/session/session.module';
import { NlpModule } from './modules/nlp/nlp.module';
import { AiModule } from './modules/ai/ai.module';
import { VoiceModule } from './modules/voice/voice.module';
import { AdminModule } from './modules/admin/admin.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { PluginsModule } from './modules/plugins/plugins.module';
import { QueueModule } from './modules/queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    RedisModule,
    BotCoreModule,
    PlatformModule,
    WalletModule,
    IdentityModule,
    SessionModule,
    NlpModule,
    AiModule,
    VoiceModule,
    AdminModule,
    ObservabilityModule,
    PluginsModule,
    QueueModule,
  ],
})
export class AppModule {}
