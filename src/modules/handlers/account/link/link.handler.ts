import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../../core/types';
import { CommandContext } from '../../../bot-core/types/command-context';
import { HandlerResult } from '../../../bot-core/types/handler-result';
import { SessionPort } from '../../../../core/ports/session.port';

@Injectable()
@IntentHandler(Intent.LinkAccount)
export class LinkHandler extends CommandHandler {
  constructor(@Inject('SessionPort') private readonly sessionPort: SessionPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    if (ctx.session.flashAuthToken) {
      const message = this.reply('✅ Already linked! Use "balance" to check your wallet.', ctx);
      return { messages: [message] };
    }

    const message = this.reply(
      '🔗 Link Your Flash Account\n\n' +
        'Please enter the 6-digit verification code sent to your Flash app.\n\n' +
        "Don't have Flash? Download at flash.app",
      ctx,
    );
    return { messages: [message] };
  }
}
