import { Injectable } from '@nestjs/common';
import { CommandHandler } from '../../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../../core/types';
import { CommandContext } from '../../../bot-core/types/command-context';
import { HandlerResult } from '../../../bot-core/types/handler-result';

@Injectable()
@IntentHandler(Intent.LinkAccount)
export class LinkHandler extends CommandHandler {
  async execute(ctx: CommandContext): Promise<HandlerResult> {
    const message = this.reply('Link handler - implementation deferred', ctx);
    return { messages: [message] };
  }
}
