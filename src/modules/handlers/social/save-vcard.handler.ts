import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../core/types';
import { CommandContext } from '../../bot-core/types/command-context';
import { HandlerResult } from '../../bot-core/types/handler-result';
import { WalletPort } from '../../../core/ports/wallet.port';
import { FormattedText } from '../../../core/types/messages';

@Injectable()
@IntentHandler(Intent.SaveContactVCard)
export class SaveContactVCardHandler extends CommandHandler {
  constructor(@Inject('WalletPort') private readonly wallet: WalletPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    const name = ctx.slots.name;
    const phone = ctx.slots.phone;

    if (!name || !phone) {
      return {
        messages: [this.reply('❌ Could not extract contact information from vCard.', ctx)],
      };
    }

    await this.wallet.addContact(ctx.userId, name, phone);

    const body: FormattedText = [
      { type: 'text', value: '📲 Contact saved: ' },
      { type: 'bold', value: name },
      { type: 'newline' },
      { type: 'text', value: `Phone: ${phone}` },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'text', value: 'You can now send payments using ' },
      { type: 'code', value: `send [amount] to ${name}` },
    ];

    return {
      messages: [{ to: ctx.chat, content: { type: 'text', body } }],
    };
  }
}
