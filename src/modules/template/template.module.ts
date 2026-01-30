import { Module } from '@nestjs/common';
import { TEMPLATE_PORT } from '../../core/ports/tokens';
import { TemplateAdapter } from './adapters/template.adapter';
import { PaymentTemplatesService } from '../whatsapp/services/payment-templates.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [
    PaymentTemplatesService,
    TemplateAdapter,
    {
      provide: TEMPLATE_PORT,
      useExisting: TemplateAdapter,
    },
  ],
  exports: [TEMPLATE_PORT],
})
export class TemplateModule {}
