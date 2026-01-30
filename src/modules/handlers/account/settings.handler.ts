import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../core/types';
import { CommandContext } from '../../bot-core/types/command-context';
import { HandlerResult } from '../../bot-core/types/handler-result';
import { WalletPort } from '../../../core/ports/wallet.port';
import { FormattedText } from '../../../core/types/messages';

@Injectable()
@IntentHandler(Intent.ViewSettings)
export class SettingsHandler extends CommandHandler {
  constructor(@Inject('WalletPort') private readonly wallet: WalletPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    const userInfo = await this.wallet.getUserInfo(ctx.userId);

    const body: FormattedText = [
      { type: 'bold', value: '⚙️ Your Settings' },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'bold', value: '👤 Account' },
      { type: 'newline' },
      {
        type: 'text',
        value: `📛 Username: ${userInfo.username ? `@${userInfo.username}` : 'Not set'}`,
      },
      { type: 'newline' },
      { type: 'text', value: `🌐 Language: ${userInfo.language ?? 'English'}` },
      { type: 'newline' },
      { type: 'text', value: `💱 Display currency: ${userInfo.displayCurrency ?? 'USD'}` },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'bold', value: '🤖 AI Support' },
      { type: 'newline' },
      {
        type: 'text',
        value: userInfo.consentGiven ? '✅ AI assistance enabled' : '❌ AI assistance disabled',
      },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'bold', value: '⚡ Quick Actions' },
      { type: 'newline' },
      { type: 'text', value: '• ' },
      { type: 'code', value: 'username [name]' },
      { type: 'text', value: ' — Set username' },
      { type: 'newline' },
      { type: 'text', value: '• ' },
      { type: 'code', value: 'consent yes/no' },
      { type: 'text', value: ' — Toggle AI support' },
      { type: 'newline' },
      { type: 'text', value: '• ' },
      { type: 'code', value: 'voice help' },
      { type: 'text', value: ' — Voice settings' },
    ];

    return {
      messages: [{ to: ctx.chat, content: { type: 'text', body } }],
    };
  }
}
