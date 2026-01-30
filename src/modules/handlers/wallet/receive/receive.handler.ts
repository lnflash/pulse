import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../../core/types';
import { CommandContext } from '../../../bot-core/types/command-context';
import { HandlerResult } from '../../../bot-core/types/handler-result';
import { WalletPort } from '../../../../core/ports/wallet.port';
import { WALLET_PORT } from '../../../../core/ports/tokens';

@Injectable()
@IntentHandler(Intent.CreateInvoice)
export class ReceiveHandler extends CommandHandler {
  constructor(@Inject(WALLET_PORT) private readonly wallet: WalletPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    const amount = ctx.slots.amount;
    const memo = ctx.slots.memo;

    const invoice = await this.wallet.createInvoice(ctx.userId, { amount, memo });
    const message = this.reply(
      `📥 Invoice Created\n\nAmount: ${amount || 'any'} sats\nInvoice: ${invoice}`,
      ctx,
    );

    return { messages: [message] };
  }
}
