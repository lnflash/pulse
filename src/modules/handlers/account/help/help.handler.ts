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
    const message = this.reply('Help handler - implementation deferred', ctx);
    return { messages: [message] };
  }
}
