import { Module } from '@nestjs/common';
import { WhatsAppWebhookController } from './controllers/webhook.controller';
import { WhatsAppCloudAdapter } from './adapters/whatsapp-cloud.adapter';

@Module({
  controllers: [WhatsAppWebhookController],
  providers: [WhatsAppCloudAdapter],
  exports: [WhatsAppCloudAdapter],
})
export class WhatsAppCloudModule {}
