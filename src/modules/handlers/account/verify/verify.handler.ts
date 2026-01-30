import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../../core/types';
import { CommandContext } from '../../../bot-core/types/command-context';
import { HandlerResult } from '../../../bot-core/types/handler-result';
import { SessionPort } from '../../../../core/ports/session.port';

@Injectable()
@IntentHandler(Intent.VerifyOTP)
export class VerifyHandler extends CommandHandler {
  constructor(@Inject('SessionPort') private readonly sessionPort: SessionPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    let otp = ctx.slots.otp;
    
    if (!otp && ctx.inboundMessage.content.type === 'text') {
      otp = ctx.inboundMessage.content.body.trim();
    }

    if (!otp || !/^\d{6}$/.test(otp)) {
      const message = this.reply('Invalid code. Please enter 6 digits.', ctx);
      return { messages: [message] };
    }

    await this.sessionPort.updateSession(ctx.userId, {
      flashAuthToken: 'verified_' + otp,
      linkedPhone: ctx.inboundMessage.from.platformUserId,
    });

    const message = this.reply('Account linked! Use "balance" to get started.', ctx);
    return { messages: [message] };
  }
}
