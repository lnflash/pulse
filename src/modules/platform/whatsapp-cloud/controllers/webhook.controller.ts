import { Controller, Post, Get, Body, Query, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { WhatsAppCloudAdapter } from '../adapters/whatsapp-cloud.adapter';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  constructor(
    private readonly adapter: WhatsAppCloudAdapter,
    private readonly config: ConfigService,
  ) {}

  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const verifyToken = this.config.get<string>('whatsapp.verifyToken');
    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    throw new Error('Verification failed');
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() body: any, @Headers('x-hub-signature-256') signature: string) {
    const appSecret = this.config.get<string>('whatsapp.appSecret');
    if (appSecret) {
      const bodyStr = JSON.stringify(body);
      const expectedSignature =
        'sha256=' + crypto.createHmac('sha256', appSecret).update(bodyStr).digest('hex');

      if (signature !== expectedSignature) {
        throw new Error('Invalid signature');
      }
    }

    await this.adapter.handleWebhook(body);
    return { status: 'ok' };
  }
}
