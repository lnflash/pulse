import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../../core/types';
import { CommandContext } from '../../../bot-core/types/command-context';
import { HandlerResult } from '../../../bot-core/types/handler-result';
import { WalletPort } from '../../../../core/ports/wallet.port';
import { FormattedText } from '../../../../core/types/messages';

@Injectable()
@IntentHandler(Intent.RefreshBalance)
export class RefreshBalanceHandler extends CommandHandler {
  constructor(@Inject('WalletPort') private readonly wallet: WalletPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    await this.wallet.clearBalanceCache(ctx.userId);
    const balance = await this.wallet.getBalance(ctx.userId);

    const body: FormattedText = [
      { type: 'text', value: '🔄 ' },
      { type: 'bold', value: 'Balance Refreshed' },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'text', value: `BTC: ${balance}` },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'text', value: "Use 'send' to make a payment" },
    ];

    return {
      messages: [{ to: ctx.chat, content: { type: 'text', body } }],
    };
  }
}
