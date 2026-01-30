import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../core/types';
import { CommandContext } from '../../bot-core/types/command-context';
import { HandlerResult } from '../../bot-core/types/handler-result';
import { WalletPort } from '../../../core/ports/wallet.port';
import { WALLET_PORT } from '../../../core/ports/tokens';
import { FormattedText } from '../../../core/types/messages';

@Injectable()
@IntentHandler(Intent.UndoTransaction)
export class UndoHandler extends CommandHandler {
  constructor(@Inject(WALLET_PORT) private readonly wallet: WalletPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    const result = await this.wallet.undoLastTransaction(ctx.userId);

    if (result.success) {
      const body: FormattedText = [
        { type: 'text', value: '✅ ' },
        { type: 'bold', value: 'Transaction reversed!' },
        { type: 'newline' },
        { type: 'newline' },
        { type: 'text', value: result.message },
      ];

      if (result.transactionId) {
        body.push({ type: 'newline' });
        body.push({ type: 'text', value: '🔖 Ref: ' });
        body.push({ type: 'code', value: result.transactionId });
      }

      return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
    }

    const body: FormattedText = [
      { type: 'text', value: '❌ ' },
      { type: 'bold', value: 'Cannot undo' },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'text', value: result.message },
    ];
    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }
}
