import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../../core/types';
import { CommandContext } from '../../../bot-core/types/command-context';
import { HandlerResult } from '../../../bot-core/types/handler-result';
import { WalletPort } from '../../../../core/ports/wallet.port';
import { WALLET_PORT } from '../../../../core/ports/tokens';

@Injectable()
@IntentHandler(Intent.CheckBalance)
export class BalanceHandler extends CommandHandler {
  constructor(@Inject(WALLET_PORT) private readonly wallet: WalletPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    const balance = await this.wallet.getBalance(ctx.userId);
    const message = this.reply(
      `💰 Your Balance\n\nBTC: ${balance}\n\nUse 'send' to make a payment`,
      ctx,
    );

    return { messages: [message] };
  }
}
