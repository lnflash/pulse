import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../core/types';
import { CommandContext } from '../../bot-core/types/command-context';
import { HandlerResult } from '../../bot-core/types/handler-result';
import { WalletPort, PendingPayment } from '../../../core/ports/wallet.port';
import { FormattedText } from '../../../core/types/messages';

@Injectable()
@IntentHandler(Intent.ViewPending)
export class PendingHandler extends CommandHandler {
  constructor(@Inject('WalletPort') private readonly wallet: WalletPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    const action = ctx.slots.action;
    const claimCode = ctx.slots.claimCode;

    if (claimCode) {
      return this.claimPayment(ctx, claimCode);
    }

    const direction = action === 'sent' ? 'sent' : 'received';
    return this.listPending(ctx, direction);
  }

  private async listPending(
    ctx: CommandContext,
    direction: 'sent' | 'received',
  ): Promise<HandlerResult> {
    const payments = await this.wallet.getPendingPayments(ctx.userId, direction);

    if (!payments || payments.length === 0) {
      const label = direction === 'sent' ? 'sent' : 'received';
      const body: FormattedText = [{ type: 'text', value: `📭 No pending ${label} payments.` }];
      return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
    }

    const label = direction === 'sent' ? 'Sent' : 'Received';
    const body: FormattedText = [
      { type: 'bold', value: `⏳ Pending ${label} Payments` },
      { type: 'newline' },
      { type: 'newline' },
    ];

    for (const payment of payments) {
      body.push({ type: 'text', value: `💰 ${payment.amount} ${payment.currency}` });
      if (payment.claimCode) {
        body.push({ type: 'text', value: ' | Code: ' });
        body.push({ type: 'code', value: payment.claimCode });
      }
      if (payment.expiresAt) {
        body.push({ type: 'text', value: ` | Expires: ${payment.expiresAt.toISOString()}` });
      }
      body.push({ type: 'newline' });
    }

    body.push({ type: 'newline' });
    body.push({ type: 'text', value: 'Claim a payment: ' });
    body.push({ type: 'code', value: 'pending claim <code>' });

    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }

  private async claimPayment(ctx: CommandContext, claimCode: string): Promise<HandlerResult> {
    const result = await this.wallet.claimPendingPayment(ctx.userId, claimCode);

    if (result.success) {
      const body: FormattedText = [
        { type: 'text', value: '✅ ' },
        { type: 'bold', value: 'Payment claimed!' },
        { type: 'newline' },
        { type: 'text', value: result.message },
      ];
      return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
    }

    const body: FormattedText = [
      { type: 'text', value: '❌ ' },
      { type: 'text', value: result.message },
    ];
    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }
}
