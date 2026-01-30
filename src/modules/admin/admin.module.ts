import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from '../../common/redis/redis.module';
import { QueueModule } from '../queue/queue.module';
import { AdminAuthService } from './services/admin-auth.service';
import { FeatureFlagsService } from './services/feature-flags.service';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminAuthController } from './controllers/admin-auth.controller';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminJwtGuard } from './guards/admin-jwt.guard';

@Module({
  imports: [
    RedisModule,
    QueueModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('security.jwtSecret'),
        signOptions: {
          expiresIn: '24h',
        },
      }),
    }),
  ],
  providers: [AdminAuthService, FeatureFlagsService, AdminDashboardService, AdminJwtGuard],
  controllers: [AdminAuthController, AdminDashboardController],
  exports: [AdminAuthService, FeatureFlagsService, AdminDashboardService],
})
export class AdminModule {}
