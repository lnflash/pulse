import { Injectable } from '@nestjs/common';
import { CommandHandler } from '../../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../../core/types';
import { CommandContext } from '../../../bot-core/types/command-context';
import { HandlerResult } from '../../../bot-core/types/handler-result';

@Injectable()
@IntentHandler(Intent.Help)
export class HelpHandler extends CommandHandler {
  async execute(ctx: CommandContext): Promise<HandlerResult> {
    const isLinked = !!ctx.session.flashAuthToken;
    let helpText = 'Flash Bot Help\n\n';

    if (!isLinked) {
      helpText += 'link - Connect your account\n';
    } else {
      helpText += 'balance - Check balance\nsend - Send Bitcoin\nreceive - Create invoice\n';
    }

    const message = this.reply(helpText, ctx);
    return { messages: [message] };
  }
}
