import { Module, Global } from '@nestjs/common';
import { LoggerService } from './services/logger.service';
import { HealthService } from './services/health.service';

@Global()
@Module({
  providers: [LoggerService, HealthService],
  exports: [LoggerService, HealthService],
})
export class ObservabilityModule {}
