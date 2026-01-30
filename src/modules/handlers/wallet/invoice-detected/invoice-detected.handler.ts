import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../../core/types';
import { CommandContext } from '../../../bot-core/types/command-context';
import { HandlerResult } from '../../../bot-core/types/handler-result';
import { WalletPort } from '../../../../core/ports/wallet.port';

const LIGHTNING_INVOICE_PATTERN = /\b(lnbc[a-z0-9]+)\b/i;

@Injectable()
@IntentHandler(Intent.InvoiceDetected)
export class InvoiceDetectedHandler extends CommandHandler {
  constructor(@Inject('WalletPort') private readonly wallet: WalletPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    const invoice = this.extractInvoice(ctx);

    if (!invoice) {
      return {
        messages: [this.reply('❌ No valid Lightning invoice found in your message.', ctx)],
      };
    }

    try {
      const decoded = await this.wallet.decodeInvoice(ctx.userId, invoice);

      if (decoded.isExpired) {
        return {
          messages: [
            this.reply('❌ This invoice has expired. Request a new one from the recipient.', ctx),
          ],
        };
      }

      const details = [
        '⚡ Lightning Invoice Detected',
        '',
        `Amount: ${decoded.amount} ${decoded.currency}`,
        decoded.memo ? `Memo: ${decoded.memo}` : null,
        `Expires: ${decoded.expiresAt.toLocaleString()}`,
        '',
        'Reply "pay confirm" to pay this invoice, or "pay cancel" to dismiss.',
      ]
        .filter(Boolean)
        .join('\n');

      return {
        messages: [this.reply(details, ctx)],
      };
    } catch {
      return {
        messages: [this.reply('❌ Could not decode this invoice. It may be malformed.', ctx)],
      };
    }
  }

  private extractInvoice(ctx: CommandContext): string | null {
    if (ctx.slots.invoice) {
      return ctx.slots.invoice;
    }

    const rawText = ctx.intent.kind === 'core' ? ctx.intent.rawText : '';
    const match = rawText.match(LIGHTNING_INVOICE_PATTERN);
    return match ? match[1] : null;
  }
}
