import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../core/types';
import { CommandContext } from '../../bot-core/types/command-context';
import { HandlerResult } from '../../bot-core/types/handler-result';
import { SessionPort } from '../../../core/ports/session.port';
import { FormattedText } from '../../../core/types/messages';

@Injectable()
@IntentHandler(Intent.SkipOnboarding)
export class SkipOnboardingHandler extends CommandHandler {
  constructor(@Inject('SessionPort') private readonly session: SessionPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    await this.session.updateSession(ctx.userId, { onboardingSkipped: true });

    const body: FormattedText = [
      { type: 'text', value: '👍 Onboarding skipped.' },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'text', value: 'Type ' },
      { type: 'code', value: 'help' },
      { type: 'text', value: ' anytime to see available commands.' },
    ];

    return {
      messages: [{ to: ctx.chat, content: { type: 'text', body } }],
    };
  }
}
