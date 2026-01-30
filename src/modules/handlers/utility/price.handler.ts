import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../core/types';
import { CommandContext } from '../../bot-core/types/command-context';
import { HandlerResult } from '../../bot-core/types/handler-result';
import { WalletPort } from '../../../core/ports/wallet.port';
import { WALLET_PORT } from '../../../core/ports/tokens';
import { FormattedText } from '../../../core/types/messages';

interface PriceData {
  price: number;
  currency: string;
  change24h?: number;
}

@Injectable()
@IntentHandler(Intent.CheckPrice)
export class PriceHandler extends CommandHandler {
  constructor(@Inject(WALLET_PORT) private readonly wallet: WalletPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    let currency = 'USD';

    if (ctx.session.flashAuthToken) {
      const userInfo = await this.wallet.getUserInfo(ctx.userId);
      currency = userInfo.displayCurrency ?? 'USD';
    }

    const priceData = (await this.wallet.getPrice(currency)) as PriceData;

    const formattedPrice = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(priceData.price);

    const body: FormattedText = [
      { type: 'bold', value: '₿ Bitcoin Price' },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'text', value: `💰 ${formattedPrice} ${currency}` },
      { type: 'newline' },
    ];

    if (priceData.change24h !== undefined) {
      const direction = priceData.change24h >= 0 ? '📈' : '📉';
      const sign = priceData.change24h >= 0 ? '+' : '';
      body.push({
        type: 'text',
        value: `${direction} 24h: ${sign}${priceData.change24h.toFixed(2)}%`,
      });
      body.push({ type: 'newline' });
    }

    if (!ctx.session.flashAuthToken) {
      body.push({ type: 'newline' });
      body.push({
        type: 'text',
        value: '💡 Link your account to see price in your currency',
      });
      body.push({ type: 'newline' });
      body.push({ type: 'text', value: '→ ' });
      body.push({ type: 'code', value: 'link' });
    }

    return {
      messages: [{ to: ctx.chat, content: { type: 'text', body } }],
    };
  }
}
