import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../core/types';
import { CommandContext } from '../../bot-core/types/command-context';
import { HandlerResult } from '../../bot-core/types/handler-result';
import { WalletPort, TransactionRecord } from '../../../core/ports/wallet.port';
import { FormattedText } from '../../../core/types/messages';

@Injectable()
@IntentHandler(Intent.ViewHistory)
export class HistoryHandler extends CommandHandler {
  constructor(@Inject('WalletPort') private readonly wallet: WalletPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    const txId = ctx.slots.transactionId;
    if (txId) {
      return this.showTransactionDetail(ctx, txId);
    }
    return this.showTransactionList(ctx);
  }

  private async showTransactionList(ctx: CommandContext): Promise<HandlerResult> {
    const transactions = await this.wallet.getTransactionHistory(ctx.userId, 10);

    if (!transactions || transactions.length === 0) {
      const body: FormattedText = [
        { type: 'text', value: '📋 No transactions found.' },
        { type: 'newline' },
        { type: 'newline' },
        { type: 'text', value: 'Send or receive a payment to see it here.' },
      ];
      return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
    }

    const body: FormattedText = [
      { type: 'bold', value: '📋 Recent Transactions' },
      { type: 'newline' },
      { type: 'newline' },
    ];

    for (const tx of transactions) {
      const icon = tx.type === 'send' ? '📤' : '📥';
      const sign = tx.type === 'send' ? '-' : '+';
      body.push({ type: 'text', value: `${icon} ${sign}${tx.amount} ${tx.currency}` });
      if (tx.counterparty) {
        body.push({ type: 'text', value: ` → ${tx.counterparty}` });
      }
      body.push({ type: 'newline' });
    }

    body.push({ type: 'newline' });
    body.push({ type: 'text', value: 'View details: ' });
    body.push({ type: 'code', value: 'history <transaction_id>' });

    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }

  private async showTransactionDetail(ctx: CommandContext, txId: string): Promise<HandlerResult> {
    const tx = await this.wallet.getTransaction(ctx.userId, txId);

    if (!tx) {
      const body: FormattedText = [
        { type: 'text', value: '❌ Transaction not found: ' },
        { type: 'code', value: txId },
      ];
      return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
    }

    const icon = tx.type === 'send' ? '📤 Sent' : '📥 Received';
    const body: FormattedText = [
      { type: 'bold', value: `${icon}` },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'text', value: '💰 Amount: ' },
      { type: 'bold', value: `${tx.amount} ${tx.currency}` },
      { type: 'newline' },
      { type: 'text', value: '📊 Status: ' },
      { type: 'text', value: tx.status },
      { type: 'newline' },
    ];

    if (tx.counterparty) {
      body.push({ type: 'text', value: '👤 ' });
      body.push({ type: 'text', value: tx.type === 'send' ? 'To: ' : 'From: ' });
      body.push({ type: 'bold', value: tx.counterparty });
      body.push({ type: 'newline' });
    }

    if (tx.memo) {
      body.push({ type: 'text', value: '📝 Memo: ' });
      body.push({ type: 'italic', value: tx.memo });
      body.push({ type: 'newline' });
    }

    body.push({ type: 'text', value: '🕐 Date: ' });
    body.push({ type: 'text', value: tx.createdAt.toISOString() });

    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }
}
