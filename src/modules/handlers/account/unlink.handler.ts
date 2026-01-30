import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../core/types';
import { CommandContext } from '../../bot-core/types/command-context';
import { HandlerResult } from '../../bot-core/types/handler-result';
import { SessionPort } from '../../../core/ports/session.port';
import { SESSION_PORT } from '../../../core/ports/tokens';
import { FormattedText } from '../../../core/types/messages';

@Injectable()
@IntentHandler(Intent.UnlinkAccount)
export class UnlinkAccountHandler extends CommandHandler {
  constructor(@Inject(SESSION_PORT) private readonly session: SessionPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    const confirmed = ctx.slots.confirm === 'true' || ctx.slots.confirm === 'confirm';

    if (!confirmed) {
      const body: FormattedText = [
        { type: 'text', value: '⚠️ ' },
        { type: 'bold', value: 'Disconnect Flash Account' },
        { type: 'newline' },
        { type: 'newline' },
        {
          type: 'text',
          value:
            'This will unlink your Flash account from WhatsApp. You will need to re-link to use wallet features.',
        },
        { type: 'newline' },
        { type: 'newline' },
        { type: 'text', value: 'To confirm, type ' },
        { type: 'code', value: 'unlink confirm' },
      ];

      return {
        messages: [{ to: ctx.chat, content: { type: 'text', body } }],
      };
    }

    await this.session.deleteSession(ctx.userId);

    const body: FormattedText = [
      { type: 'text', value: '✅ Your Flash account has been ' },
      { type: 'bold', value: 'disconnected' },
      { type: 'text', value: '.' },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'text', value: 'Type ' },
      { type: 'code', value: 'link' },
      { type: 'text', value: ' to reconnect anytime.' },
    ];

    return {
      messages: [{ to: ctx.chat, content: { type: 'text', body } }],
    };
  }
}
