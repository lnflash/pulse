import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { Message, Update } from 'telegraf/types';
import { RedisService } from '../../redis/redis.service';
import { AuthService } from '../../auth/services/auth.service';
import { SessionService } from '../../auth/services/session.service';
import { FlashApiService } from '../../flash-api/flash-api.service';
import { BalanceService } from '../../flash-api/services/balance.service';
import { UsernameService } from '../../flash-api/services/username.service';
import { PriceService } from '../../flash-api/services/price.service';
import { InvoiceService } from '../../flash-api/services/invoice.service';
import { PaymentService } from '../../flash-api/services/payment.service';
import { TransactionService } from '../../flash-api/services/transaction.service';
import { CommandParserService, CommandType, ParsedCommand } from '../../whatsapp/services/command-parser.service';
import { TelegramKeyboardService } from './telegram-keyboard.service';
import { UserSession } from '../../auth/interfaces/user-session.interface';
import { AccountLinkRequestDto } from '../../auth/dto/account-link-request.dto';
import { VerifyOtpDto } from '../../auth/dto/verify-otp.dto';
import * as QRCode from 'qrcode';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly flashApiService: FlashApiService,
    private readonly balanceService: BalanceService,
    private readonly usernameService: UsernameService,
    private readonly priceService: PriceService,
    private readonly invoiceService: InvoiceService,
    private readonly paymentService: PaymentService,
    private readonly transactionService: TransactionService,
    private readonly commandParserService: CommandParserService,
    private readonly keyboardService: TelegramKeyboardService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    this.enabled = !!token;
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn('Telegram bot disabled - TELEGRAM_BOT_TOKEN not configured');
      return;
    }

    try {
      const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
      this.bot = new Telegraf(token!);
      
      this.setupHandlers();
      
      await this.bot.launch();
      this.logger.log('🤖 Telegram bot started successfully');
    } catch (error) {
      this.logger.error('Failed to start Telegram bot:', error);
    }
  }

  async onModuleDestroy() {
    if (this.bot) {
      this.bot.stop('SIGTERM');
      this.logger.log('Telegram bot stopped');
    }
  }

  private setupHandlers() {
    if (!this.bot) return;

    this.bot.command('start', (ctx) => this.handleStart(ctx));
    this.bot.command('help', (ctx) => this.handleHelp(ctx));
    this.bot.command('balance', (ctx) => this.handleBalance(ctx));
    this.bot.command('bal', (ctx) => this.handleBalance(ctx));
    this.bot.command('send', (ctx) => this.handleSendCommand(ctx));
    this.bot.command('receive', (ctx) => this.handleReceive(ctx));
    this.bot.command('price', (ctx) => this.handlePrice(ctx));
    this.bot.command('history', (ctx) => this.handleHistory(ctx));
    this.bot.command('link', (ctx) => this.handleLink(ctx));

    this.bot.on(message('contact'), (ctx) => this.handleContact(ctx));
    
    this.bot.on(message('text'), (ctx) => this.handleTextMessage(ctx));

    this.bot.on('callback_query', (ctx) => this.handleCallbackQuery(ctx));

    this.bot.catch((err, ctx) => {
      this.logger.error(`Error for ${ctx.updateType}:`, err);
    });
  }

  private getTelegramId(ctx: Context): string {
    return `tg:${ctx.from?.id}`;
  }

  private async getSession(telegramId: string): Promise<UserSession | null> {
    return this.sessionService.getSessionByWhatsappId(telegramId);
  }

  private async handleStart(ctx: Context) {
    const telegramId = this.getTelegramId(ctx);
    const session = await this.getSession(telegramId);

    if (session?.isVerified) {
      await ctx.reply(
        `👋 Welcome back to *Pulse*!\n\nYour Flash account is connected.\n\nQuick actions:`,
        { 
          parse_mode: 'Markdown',
          ...this.keyboardService.mainMenu() 
        }
      );
    } else {
      await ctx.reply(
        `👋 *Welcome to Pulse!*\n\n` +
        `Pulse is your Bitcoin wallet assistant powered by Flash.\n\n` +
        `To get started, I need to verify your phone number.\n\n` +
        `Please share your phone number using the button below:`,
        { 
          parse_mode: 'Markdown',
          ...this.keyboardService.shareContact() 
        }
      );
    }
  }

  private async handleHelp(ctx: Context) {
    const helpText = `*Pulse Commands*\n\n` +
      `💰 *Wallet*\n` +
      `/balance - Check your balance\n` +
      `/price - Bitcoin price\n\n` +
      `📤 *Sending*\n` +
      `/send <amount> to <@username> - Send sats\n\n` +
      `📥 *Receiving*\n` +
      `/receive <amount> - Create invoice\n\n` +
      `📜 *History*\n` +
      `/history - View transactions\n\n` +
      `🔗 *Account*\n` +
      `/link - Connect Flash account`;

    await ctx.reply(helpText, { 
      parse_mode: 'Markdown',
      ...this.keyboardService.helpCategories() 
    });
  }

  private async handleBalance(ctx: Context) {
    const telegramId = this.getTelegramId(ctx);
    const session = await this.getSession(telegramId);

    if (!session?.isVerified || !session.flashAuthToken) {
      await ctx.reply('Please link your Flash account first using /link');
      return;
    }

    try {
      const balanceInfo = await this.balanceService.getUserBalance(
        session.flashUserId!,
        session.flashAuthToken,
      );

      const message = `💰 *Your Balance*\n\n` +
        `*${balanceInfo.fiatBalance.toFixed(2)} ${balanceInfo.fiatCurrency}*\n` +
        `₿ ${balanceInfo.btcBalance.toFixed(8)} BTC\n\n` +
        `_Updated just now_`;

      await ctx.reply(message, { 
        parse_mode: 'Markdown',
        ...this.keyboardService.afterBalance() 
      });
    } catch (error) {
      this.logger.error('Balance error:', error);
      await ctx.reply('❌ Failed to fetch balance. Please try again.');
    }
  }

  private async handlePrice(ctx: Context) {
    try {
      const priceInfo = await this.priceService.getBitcoinPrice('USD');
      const message = this.priceService.formatPriceMessage(priceInfo);
      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      this.logger.error('Price error:', error);
      await ctx.reply('❌ Failed to fetch price. Please try again.');
    }
  }

  private async handleReceive(ctx: Context) {
    const telegramId = this.getTelegramId(ctx);
    const session = await this.getSession(telegramId);

    if (!session?.isVerified || !session.flashAuthToken) {
      await ctx.reply('Please link your Flash account first using /link');
      return;
    }

    const text = (ctx.message as Message.TextMessage)?.text || '';
    const match = text.match(/\/receive\s+(\d+(?:\.\d+)?)/i);
    const amount = match ? parseFloat(match[1]) : 10;

    try {
      const invoice = await this.invoiceService.createInvoice(
        session.flashAuthToken,
        amount,
        `Telegram receive - ${ctx.from?.username || telegramId}`,
      );

      const qrBuffer = await QRCode.toBuffer(invoice.paymentRequest, {
        width: 300,
        margin: 2,
      });

      await ctx.replyWithPhoto(
        { source: qrBuffer },
        {
          caption: `⚡ *Lightning Invoice*\n\n` +
            `Amount: *$${amount.toFixed(2)}*\n\n` +
            `\`${invoice.paymentRequest.substring(0, 40)}...\`\n\n` +
            `_Scan QR or copy invoice_`,
          parse_mode: 'Markdown',
        }
      );
    } catch (error) {
      this.logger.error('Receive error:', error);
      await ctx.reply('❌ Failed to create invoice. Please try again.');
    }
  }

  private async handleSendCommand(ctx: Context) {
    const telegramId = this.getTelegramId(ctx);
    const session = await this.getSession(telegramId);

    if (!session?.isVerified || !session.flashAuthToken) {
      await ctx.reply('Please link your Flash account first using /link');
      return;
    }

    const text = (ctx.message as Message.TextMessage)?.text || '';
    const match = text.match(/\/send\s+(\d+(?:\.\d+)?)\s+to\s+@?(\w+)/i);

    if (!match) {
      await ctx.reply(
        '📤 *Send Money*\n\n' +
        'Usage: `/send <amount> to <@username>`\n\n' +
        'Example: `/send 5 to @john`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const amount = match[1];
    const recipient = match[2];
    const callbackId = `${Date.now()}`;

    await this.redisService.set(
      `tg_pending_send:${callbackId}`,
      JSON.stringify({ amount: amount.toString(), recipient, telegramId, sessionId: session.sessionId }),
      300
    );

    await ctx.reply(
      `💸 *Confirm Payment*\n\n` +
      `Amount: *$${amount}*\n` +
      `To: *@${recipient}*\n\n` +
      `Please confirm this payment:`,
      {
        parse_mode: 'Markdown',
        ...this.keyboardService.confirmPayment(amount, recipient, callbackId),
      }
    );
  }

  private async handleHistory(ctx: Context) {
    const telegramId = this.getTelegramId(ctx);
    const session = await this.getSession(telegramId);

    if (!session?.isVerified || !session.flashAuthToken) {
      await ctx.reply('Please link your Flash account first using /link');
      return;
    }

    try {
      const txConnection = await this.transactionService.getRecentTransactions(
        session.flashAuthToken,
        5
      );

      if (!txConnection || txConnection.edges.length === 0) {
        await ctx.reply('📜 No transactions found.');
        return;
      }

      let message = '📜 *Recent Transactions*\n\n';
      
      for (const edge of txConnection.edges) {
        const tx = edge.node;
        const direction = tx.direction === 'RECEIVE' ? '📥' : '📤';
        const sign = tx.direction === 'RECEIVE' ? '+' : '-';
        message += `${direction} ${sign}$${Math.abs(tx.settlementAmount / 100).toFixed(2)}\n`;
        message += `   _${tx.memo || 'No memo'}_\n\n`;
      }

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      this.logger.error('History error:', error);
      await ctx.reply('❌ Failed to fetch history. Please try again.');
    }
  }

  private async handleLink(ctx: Context) {
    const telegramId = this.getTelegramId(ctx);
    const session = await this.getSession(telegramId);

    if (session?.isVerified) {
      await ctx.reply('✅ Your Flash account is already linked!');
      return;
    }

    await ctx.reply(
      '🔗 *Link Your Flash Account*\n\n' +
      'To link your account, I need to verify your phone number.\n\n' +
      'Please share your phone number using the button below:',
      {
        parse_mode: 'Markdown',
        ...this.keyboardService.shareContact(),
      }
    );
  }

  private async handleContact(ctx: Context) {
    const contact = (ctx.message as Message.ContactMessage)?.contact;
    if (!contact?.phone_number) {
      await ctx.reply('❌ Could not read phone number. Please try again.');
      return;
    }

    const telegramId = this.getTelegramId(ctx);
    let phoneNumber = contact.phone_number.replace(/\D/g, '');
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = '+' + phoneNumber;
    }

    try {
      const linkRequest: AccountLinkRequestDto = {
        whatsappId: telegramId,
        phoneNumber: phoneNumber,
      };

      const result = await this.authService.initiateAccountLinking(linkRequest);

      if (result.otpSent) {
        await ctx.reply(
          '✅ *Verification Code Sent!*\n\n' +
          'A 6-digit code has been sent to your Flash app.\n\n' +
          'Please enter the code:',
          { 
            parse_mode: 'Markdown',
            ...this.keyboardService.removeKeyboard() 
          }
        );
      } else {
        await ctx.reply('✅ Your Flash account is already linked!');
      }
    } catch (error) {
      this.logger.error('Link error:', error);
      
      if (error.message?.includes('No Flash account found')) {
        await ctx.reply(
          '❌ No Flash account found with this phone number.\n\n' +
          'Please download the Flash app and create an account first.',
          { ...this.keyboardService.removeKeyboard() }
        );
      } else {
        await ctx.reply(
          '❌ Failed to link account. Please try again later.',
          { ...this.keyboardService.removeKeyboard() }
        );
      }
    }
  }

  private async handleTextMessage(ctx: Context) {
    const text = (ctx.message as Message.TextMessage)?.text;
    if (!text) return;

    if (text.startsWith('/')) return;

    const telegramId = this.getTelegramId(ctx);

    if (/^\d{6}$/.test(text.trim())) {
      await this.handleVerifyCode(ctx, text.trim());
      return;
    }

    const lowerText = text.toLowerCase().trim();
    
    if (['balance', 'bal', '💰 balance'].includes(lowerText)) {
      await this.handleBalance(ctx);
      return;
    }
    
    if (['price', '💵 price'].includes(lowerText)) {
      await this.handlePrice(ctx);
      return;
    }
    
    if (['help', '❓ help'].includes(lowerText)) {
      await this.handleHelp(ctx);
      return;
    }
    
    if (['history', '📜 history'].includes(lowerText)) {
      await this.handleHistory(ctx);
      return;
    }

    if (lowerText.startsWith('send ')) {
      const fakeCtx = { ...ctx, message: { ...ctx.message, text: '/' + text } };
      await this.handleSendCommand(fakeCtx as Context);
      return;
    }

    if (lowerText.startsWith('receive')) {
      const fakeCtx = { ...ctx, message: { ...ctx.message, text: '/' + text } };
      await this.handleReceive(fakeCtx as Context);
      return;
    }

    await ctx.reply(
      "I didn't understand that command.\n\nType /help to see available commands.",
      { ...this.keyboardService.mainMenu() }
    );
  }

  private async handleVerifyCode(ctx: Context, code: string) {
    const telegramId = this.getTelegramId(ctx);
    const session = await this.getSession(telegramId);

    if (!session) {
      await ctx.reply('Please start the linking process first with /link');
      return;
    }

    if (session.isVerified) {
      await ctx.reply('✅ Your account is already verified!');
      return;
    }

    try {
      const verifyDto: VerifyOtpDto = {
        sessionId: session.sessionId,
        otpCode: code,
      };

      await this.authService.verifyAccountLinking(verifyDto);

      await ctx.reply(
        '🎉 *Account Linked Successfully!*\n\n' +
        'Your Flash account is now connected to Telegram.\n\n' +
        'You can now:\n' +
        '• Check your balance with /balance\n' +
        '• Send money with /send\n' +
        '• Receive with /receive\n' +
        '• View history with /history',
        { 
          parse_mode: 'Markdown',
          ...this.keyboardService.mainMenu() 
        }
      );
    } catch (error) {
      this.logger.error('Verify error:', error);
      
      if (error.message?.includes('Invalid or expired OTP')) {
        await ctx.reply(
          '❌ Invalid or expired code.\n\n' +
          'Please try /link again to get a new code.'
        );
      } else {
        await ctx.reply('❌ Verification failed. Please try again.');
      }
    }
  }

  private async handleCallbackQuery(ctx: Context) {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) return;

    const data = callbackQuery.data;
    const telegramId = this.getTelegramId(ctx);

    try {
      if (data.startsWith('confirm_pay:')) {
        const callbackId = data.replace('confirm_pay:', '');
        await this.executePayment(ctx, callbackId);
      } else if (data.startsWith('cancel_pay:')) {
        const callbackId = data.replace('cancel_pay:', '');
        await this.redisService.del(`tg_pending_send:${callbackId}`);
        await ctx.answerCbQuery('Payment cancelled');
        await ctx.editMessageText('❌ Payment cancelled.');
      } else if (data === 'refresh_balance') {
        await ctx.answerCbQuery('Refreshing...');
        await this.handleBalance(ctx);
      } else if (data === 'quick_send') {
        await ctx.answerCbQuery();
        await ctx.reply(
          '📤 *Send Money*\n\n' +
          'Usage: `/send <amount> to <@username>`\n\n' +
          'Example: `/send 5 to @john`',
          { parse_mode: 'Markdown' }
        );
      } else if (data === 'quick_receive') {
        await ctx.answerCbQuery();
        await ctx.reply(
          '📥 *Receive Money*\n\n' +
          'Usage: `/receive <amount>`\n\n' +
          'Example: `/receive 10`',
          { parse_mode: 'Markdown' }
        );
      } else if (data === 'main_menu') {
        await ctx.answerCbQuery();
        await ctx.reply('What would you like to do?', this.keyboardService.mainMenu());
      } else if (data.startsWith('help_')) {
        await ctx.answerCbQuery();
        const category = data.replace('help_', '');
        await this.sendHelpCategory(ctx, category);
      }
    } catch (error) {
      this.logger.error('Callback error:', error);
      await ctx.answerCbQuery('An error occurred');
    }
  }

  private async executePayment(ctx: Context, callbackId: string) {
    const pendingData = await this.redisService.get(`tg_pending_send:${callbackId}`);
    
    if (!pendingData) {
      await ctx.answerCbQuery('Payment expired');
      await ctx.editMessageText('❌ Payment expired. Please try again.');
      return;
    }

    const { amount, recipient, telegramId } = JSON.parse(pendingData);
    const session = await this.getSession(telegramId);

    if (!session?.isVerified || !session.flashAuthToken) {
      await ctx.answerCbQuery('Session expired');
      await ctx.editMessageText('❌ Session expired. Please /link again.');
      return;
    }

    await ctx.answerCbQuery('Processing payment...');
    await ctx.editMessageText('⏳ Processing payment...');

    try {
      const walletCheck = await this.flashApiService.executeQuery<any>(
        `query accountDefaultWallet($username: Username!) {
          accountDefaultWallet(username: $username) { id }
        }`,
        { username: recipient },
        session.flashAuthToken,
      );

      if (!walletCheck?.accountDefaultWallet?.id) {
        await ctx.editMessageText(`❌ User @${recipient} not found.`);
        return;
      }

      const recipientWalletId = walletCheck.accountDefaultWallet.id;
      const userWallets = await this.paymentService.getUserWallets(session.flashAuthToken);
      
      const result = await this.paymentService.sendIntraLedgerUsdPayment(
        {
          walletId: userWallets.usdWallet?.id || userWallets.defaultWalletId,
          recipientWalletId: recipientWalletId,
          amount: Math.round(parseFloat(amount) * 100),
          memo: `Sent via Telegram`,
        },
        session.flashAuthToken,
      );

      await this.redisService.del(`tg_pending_send:${callbackId}`);

      if (result?.status === 'SUCCESS') {
        await ctx.editMessageText(
          `✅ *Payment Sent!*\n\n` +
          `Amount: *$${amount}*\n` +
          `To: *@${recipient}*\n\n` +
          `Transaction complete.`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.editMessageText(
          `❌ Payment failed: ${result?.errors?.[0]?.message || 'Unknown error'}`
        );
      }
    } catch (error) {
      this.logger.error('Payment error:', error);
      await ctx.editMessageText(
        `❌ Payment failed: ${error.message || 'Unknown error'}`
      );
    }
  }

  private async sendHelpCategory(ctx: Context, category: string) {
    let message = '';

    switch (category) {
      case 'wallet':
        message = '*💰 Wallet Commands*\n\n' +
          '/balance - Check your current balance\n' +
          '/price - View Bitcoin price\n' +
          '/history - View transaction history';
        break;
      case 'send':
        message = '*📤 Sending Money*\n\n' +
          '/send <amount> to <@username>\n\n' +
          'Examples:\n' +
          '• `/send 5 to @john`\n' +
          '• `/send 10.50 to @merchant`';
        break;
      case 'receive':
        message = '*📥 Receiving Money*\n\n' +
          '/receive <amount>\n\n' +
          'Creates a Lightning invoice with QR code.\n\n' +
          'Example: `/receive 25`';
        break;
      case 'contacts':
        message = '*👥 Contacts*\n\n' +
          'Send to Flash usernames using @mention.\n\n' +
          'Example: `/send 5 to @friend`';
        break;
      default:
        message = 'Unknown help category.';
    }

    await ctx.reply(message, { 
      parse_mode: 'Markdown',
      ...this.keyboardService.helpCategories() 
    });
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
