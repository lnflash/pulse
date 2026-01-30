import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../core/types';
import { CommandContext } from '../../bot-core/types/command-context';
import { HandlerResult } from '../../bot-core/types/handler-result';
import { WalletPort } from '../../../core/ports/wallet.port';
import { FormattedText } from '../../../core/types/messages';

@Injectable()
@IntentHandler(Intent.ManageConsent)
export class ConsentHandler extends CommandHandler {
  constructor(@Inject('WalletPort') private readonly wallet: WalletPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    const choice = ctx.slots.choice;

    if (choice === 'yes') {
      await this.wallet.setConsent(ctx.userId, true);

      const body: FormattedText = [
        { type: 'text', value: '✅ AI assistance has been ' },
        { type: 'bold', value: 'enabled' },
        { type: 'text', value: '.' },
        { type: 'newline' },
        { type: 'newline' },
        { type: 'text', value: 'You can now use all Flash services through WhatsApp.' },
      ];

      return {
        messages: [{ to: ctx.chat, content: { type: 'text', body } }],
      };
    }

    if (choice === 'no') {
      await this.wallet.setConsent(ctx.userId, false);

      const body: FormattedText = [
        { type: 'text', value: '❌ AI assistance has been ' },
        { type: 'bold', value: 'disabled' },
        { type: 'text', value: '.' },
        { type: 'newline' },
        { type: 'newline' },
        { type: 'text', value: 'Some services will be limited. Type ' },
        { type: 'code', value: 'consent yes' },
        { type: 'text', value: ' to re-enable.' },
      ];

      return {
        messages: [{ to: ctx.chat, content: { type: 'text', body } }],
      };
    }

    const body: FormattedText = [
      { type: 'text', value: 'Please specify your consent choice:' },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'text', value: '• ' },
      { type: 'code', value: 'consent yes' },
      { type: 'text', value: ' — Enable AI assistance' },
      { type: 'newline' },
      { type: 'text', value: '• ' },
      { type: 'code', value: 'consent no' },
      { type: 'text', value: ' — Disable AI assistance' },
    ];

    return {
      messages: [{ to: ctx.chat, content: { type: 'text', body } }],
    };
  }
}
