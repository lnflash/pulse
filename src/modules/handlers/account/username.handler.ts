import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../core/types';
import { CommandContext } from '../../bot-core/types/command-context';
import { HandlerResult } from '../../bot-core/types/handler-result';
import { WalletPort } from '../../../core/ports/wallet.port';
import { WALLET_PORT } from '../../../core/ports/tokens';
import { FormattedText } from '../../../core/types/messages';

@Injectable()
@IntentHandler(Intent.ManageUsername)
export class UsernameHandler extends CommandHandler {
  constructor(@Inject(WALLET_PORT) private readonly wallet: WalletPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    const newUsername = ctx.slots.username;

    if (!newUsername) {
      return this.viewUsername(ctx);
    }

    return this.setUsername(ctx, newUsername);
  }

  private async viewUsername(ctx: CommandContext): Promise<HandlerResult> {
    const userInfo = await this.wallet.getUserInfo(ctx.userId);

    if (userInfo.username) {
      const body: FormattedText = [
        { type: 'text', value: '📛 Your username: ' },
        { type: 'bold', value: `@${userInfo.username}` },
        { type: 'newline' },
        { type: 'newline' },
        { type: 'text', value: '⚡ Lightning address: ' },
        { type: 'bold', value: `${userInfo.username}@flashapp.me` },
      ];

      return {
        messages: [
          {
            to: ctx.chat,
            content: { type: 'text', body },
          },
        ],
      };
    }

    const body: FormattedText = [
      { type: 'text', value: "You haven't set a username yet." },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'text', value: 'To set one, type ' },
      { type: 'code', value: 'username yourname' },
    ];

    return {
      messages: [{ to: ctx.chat, content: { type: 'text', body } }],
    };
  }

  private async setUsername(ctx: CommandContext, username: string): Promise<HandlerResult> {
    const userInfo = await this.wallet.getUserInfo(ctx.userId);

    if (userInfo.username) {
      const body: FormattedText = [
        { type: 'text', value: 'You already have a username: ' },
        { type: 'bold', value: `@${userInfo.username}` },
        { type: 'newline' },
        { type: 'newline' },
        { type: 'text', value: '⚠️ Usernames cannot be changed once set.' },
      ];

      return {
        messages: [{ to: ctx.chat, content: { type: 'text', body } }],
      };
    }

    await this.wallet.setUsername(ctx.userId, username);

    const body: FormattedText = [
      { type: 'text', value: '✅ Username set to: ' },
      { type: 'bold', value: `@${username}` },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'text', value: '⚡ Your Lightning address: ' },
      { type: 'bold', value: `${username}@flashapp.me` },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'text', value: '⚠️ Usernames cannot be changed once set.' },
    ];

    return {
      messages: [{ to: ctx.chat, content: { type: 'text', body } }],
    };
  }
}
