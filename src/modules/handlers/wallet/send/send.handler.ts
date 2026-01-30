import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../../core/types';
import { CommandContext } from '../../../bot-core/types/command-context';
import { HandlerResult } from '../../../bot-core/types/handler-result';
import { WalletPort } from '../../../../core/ports/wallet.port';
import { WALLET_PORT } from '../../../../core/ports/tokens';

@Injectable()
@IntentHandler(Intent.SendPayment)
export class SendHandler extends CommandHandler {
  constructor(@Inject(WALLET_PORT) private readonly wallet: WalletPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    const amount = ctx.slots.amount;
    const destination = ctx.slots.destination;

    if (!amount || !destination) {
      const message = this.reply(
        'Please specify amount and destination.\nExample: send 5000 to @alice',
        ctx,
      );
      return { messages: [message] };
    }

    const result = await this.wallet.sendPayment(ctx.userId, { amount, destination });
    const message = this.reply(
      `✅ Payment sent!\n\nAmount: ${amount} sats\nTo: ${destination}\nTx: ${result}`,
      ctx,
    );

    return { messages: [message] };
  }
}
