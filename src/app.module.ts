import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import securityConfig from './config/security.config';
import { validationSchema } from './config/env.validation';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { RedisModule } from './modules/redis/redis.module';
import { FlashApiModule } from './modules/flash-api/flash-api.module';
import { GeminiAiModule } from './modules/gemini-ai/gemini-ai.module';
import { EventsModule } from './modules/events/events.module';
import { AuthModule } from './modules/auth/auth.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminDashboardModule } from './modules/admin-dashboard/admin-dashboard.module';
import { MetricsMiddleware } from './common/middleware/metrics.middleware';
import { SecurityMiddleware } from './common/middleware/security.middleware';
import { ApiRateLimitMiddleware } from './common/middleware/api-rate-limit.middleware';
import { CryptoModule } from './common/crypto/crypto.module';
import { HealthController } from './health.controller';
import { CommonModule } from './modules/common/common.module';
import { CatchAllModule } from './common/modules/catch-all.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration, securityConfig],
      envFilePath: ['.env', `.env.${process.env.NODE_ENV || 'development'}`],
      validationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),

    // Core modules
    CommonModule,
    CryptoModule,
    WhatsappModule,
    RedisModule,
    FlashApiModule,
    GeminiAiModule,
    EventsModule,
    AuthModule,
    NotificationsModule,
    AdminDashboardModule,
    
    // Catch-all module MUST be imported last
    CatchAllModule,
  ],
  controllers: [HealthController], // CatchAllController moved to separate module
  providers: [SecurityMiddleware, ApiRateLimitMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply security middleware first (to block malicious requests early)
    consumer.apply(SecurityMiddleware).forRoutes('*');

    // Apply rate limiting to API routes
    consumer.apply(ApiRateLimitMiddleware).forRoutes('/api/*');

    // Apply metrics middleware to all routes
    consumer.apply(MetricsMiddleware).forRoutes('*');
  }
}
