import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../core/types';
import { CommandContext } from '../../bot-core/types/command-context';
import { HandlerResult } from '../../bot-core/types/handler-result';
import { WalletPort } from '../../../core/ports/wallet.port';
import { FormattedText } from '../../../core/types/messages';

@Injectable()
@IntentHandler(Intent.RequestPayment)
export class RequestHandler extends CommandHandler {
  constructor(@Inject('WalletPort') private readonly wallet: WalletPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    const target = ctx.slots.target;
    const amountStr = ctx.slots.amount;

    if (!target) {
      return this.missingTarget(ctx);
    }

    if (!amountStr) {
      return this.missingAmount(ctx);
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      const body: FormattedText = [
        { type: 'text', value: '❌ Invalid amount: ' },
        { type: 'code', value: amountStr },
      ];
      return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
    }

    const memo = ctx.slots.memo;
    const currency = ctx.slots.currency || 'USD';

    const request = await this.wallet.requestPayment(ctx.userId, target, amount, currency, memo);

    const body: FormattedText = [
      { type: 'text', value: '📨 Payment request sent!' },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'text', value: '💰 Amount: ' },
      { type: 'bold', value: `${request.amount} ${request.currency}` },
      { type: 'newline' },
      { type: 'text', value: '👤 To: ' },
      { type: 'bold', value: request.toTarget },
      { type: 'newline' },
    ];

    if (memo) {
      body.push({ type: 'text', value: '📝 Memo: ' });
      body.push({ type: 'italic', value: memo });
      body.push({ type: 'newline' });
    }

    body.push({ type: 'newline' });
    body.push({ type: 'text', value: 'They can pay with: ' });
    body.push({ type: 'code', value: 'pay' });

    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }

  private missingTarget(ctx: CommandContext): HandlerResult {
    const body: FormattedText = [
      { type: 'text', value: '❌ Please specify who to request from.' },
      { type: 'newline' },
      { type: 'text', value: 'Usage: ' },
      { type: 'code', value: 'request <amount> from <username|phone>' },
    ];
    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }

  private missingAmount(ctx: CommandContext): HandlerResult {
    const body: FormattedText = [
      { type: 'text', value: '❌ Please specify an amount.' },
      { type: 'newline' },
      { type: 'text', value: 'Usage: ' },
      { type: 'code', value: 'request <amount> from <username|phone>' },
    ];
    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }
}
