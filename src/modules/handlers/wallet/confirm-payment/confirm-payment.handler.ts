import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../../core/types';
import { CommandContext } from '../../../bot-core/types/command-context';
import { HandlerResult } from '../../../bot-core/types/handler-result';
import { WalletPort } from '../../../../core/ports/wallet.port';

@Injectable()
@IntentHandler(Intent.ConfirmPayment)
export class ConfirmPaymentHandler extends CommandHandler {
  constructor(@Inject('WalletPort') private readonly wallet: WalletPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    const { confirmation, paymentId, amount } = ctx.slots;

    if (!paymentId) {
      return {
        messages: [
          this.reply('❌ No pending payment to confirm. Use "pay" to see pending payments.', ctx),
        ],
      };
    }

    if (confirmation === 'no' || confirmation === 'cancel') {
      const result = await this.wallet.confirmPendingPayment(ctx.userId, paymentId, 'cancel');
      return {
        messages: [
          this.reply(result.success ? '✅ Payment cancelled.' : `❌ ${result.message}`, ctx),
        ],
      };
    }

    if (confirmation === 'yes' || confirmation === 'confirm') {
      const result = await this.wallet.confirmPendingPayment(ctx.userId, paymentId, 'confirm');

      if (!result.success) {
        return {
          messages: [this.reply(`❌ Payment failed: ${result.message}`, ctx)],
        };
      }

      return {
        messages: [this.reply(`✅ Payment confirmed!\n\n${result.message}`, ctx)],
      };
    }

    if (amount) {
      return this.confirmWithAmount(ctx, paymentId, amount);
    }

    return {
      messages: [
        this.reply(
          '❓ Please confirm this payment.\n\nReply "yes" to confirm or "no" to cancel.',
          ctx,
        ),
      ],
    };
  }

  private async confirmWithAmount(
    ctx: CommandContext,
    paymentId: string,
    _amount: string,
  ): Promise<HandlerResult> {
    const result = await this.wallet.confirmPendingPayment(ctx.userId, paymentId, 'confirm');

    if (!result.success) {
      return {
        messages: [this.reply(`❌ Payment failed: ${result.message}`, ctx)],
      };
    }

    return {
      messages: [this.reply(`✅ Payment confirmed!\n\n${result.message}`, ctx)],
    };
  }
}
