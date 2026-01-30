import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../../core/types';
import { CommandContext } from '../../../bot-core/types/command-context';
import { HandlerResult } from '../../../bot-core/types/handler-result';
import { WalletPort } from '../../../../core/ports/wallet.port';

@Injectable()
@IntentHandler(Intent.PayInvoice)
export class PayInvoiceHandler extends CommandHandler {
  constructor(@Inject('WalletPort') private readonly wallet: WalletPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    const { action, invoice, requestId } = ctx.slots;

    if (action === 'list') {
      return this.listPendingPayments(ctx);
    }

    if (action === 'cancel') {
      return this.cancelPayment(ctx, requestId);
    }

    if (invoice) {
      return this.payInvoice(ctx, invoice);
    }

    if (requestId) {
      return this.payRequest(ctx, requestId);
    }

    return this.listPendingPayments(ctx);
  }

  private async payInvoice(ctx: CommandContext, invoice: string): Promise<HandlerResult> {
    if (!this.isValidLightningInvoice(invoice)) {
      return {
        messages: [this.reply('❌ Invalid Lightning invoice. Must start with lnbc.', ctx)],
      };
    }

    const decoded = await this.wallet.decodeInvoice(ctx.userId, invoice);

    if (decoded.isExpired) {
      return {
        messages: [this.reply('❌ This invoice has expired. Request a new one.', ctx)],
      };
    }

    const result = await this.wallet.payInvoice(ctx.userId, invoice);

    if (!result.success) {
      return {
        messages: [this.reply(`❌ Payment failed: ${result.message}`, ctx)],
      };
    }

    const fee = result.feeSats ? `\nFee: ${result.feeSats} sats` : '';
    return {
      messages: [
        this.reply(
          `✅ Payment sent!\n\nAmount: ${decoded.amount} ${decoded.currency}${decoded.memo ? `\nMemo: ${decoded.memo}` : ''}${fee}`,
          ctx,
        ),
      ],
    };
  }

  private async payRequest(ctx: CommandContext, requestId: string): Promise<HandlerResult> {
    const result = await this.wallet.confirmPendingPayment(ctx.userId, requestId, 'confirm');

    if (!result.success) {
      return {
        messages: [this.reply(`❌ Payment failed: ${result.message}`, ctx)],
      };
    }

    return {
      messages: [this.reply(`✅ Payment confirmed!\n\n${result.message}`, ctx)],
    };
  }

  private async cancelPayment(ctx: CommandContext, requestId?: string): Promise<HandlerResult> {
    if (!requestId) {
      return {
        messages: [this.reply('❌ Please specify which payment to cancel.', ctx)],
      };
    }

    const result = await this.wallet.confirmPendingPayment(ctx.userId, requestId, 'cancel');
    return {
      messages: [
        this.reply(result.success ? '✅ Payment cancelled.' : `❌ ${result.message}`, ctx),
      ],
    };
  }

  private async listPendingPayments(ctx: CommandContext): Promise<HandlerResult> {
    const payments = await this.wallet.getPendingPayments(ctx.userId, 'received');

    if (payments.length === 0) {
      return {
        messages: [
          this.reply(
            'No pending payments to pay.\n\nPaste a Lightning invoice (lnbc...) to pay it.',
            ctx,
          ),
        ],
      };
    }

    const list = payments
      .map((p, i) => `${i + 1}. ${p.amount} ${p.currency}${p.sender ? ` from ${p.sender}` : ''}`)
      .join('\n');

    return {
      messages: [
        this.reply(
          `⚡ Pending Payments\n\n${list}\n\nReply with "pay [number]" to pay, or "pay cancel [number]" to decline.`,
          ctx,
        ),
      ],
    };
  }

  private isValidLightningInvoice(invoice: string): boolean {
    return /^lnbc[a-z0-9]+$/i.test(invoice);
  }
}
