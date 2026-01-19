import { Injectable } from '@nestjs/common';
import { Markup } from 'telegraf';

@Injectable()
export class TelegramKeyboardService {
  confirmPayment(amount: string, recipient: string, callbackId: string) {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Confirm', `confirm_pay:${callbackId}`),
        Markup.button.callback('❌ Cancel', `cancel_pay:${callbackId}`),
      ],
    ]);
  }

  mainMenu() {
    return Markup.keyboard([
      ['💰 Balance', '📤 Send'],
      ['📥 Receive', '💵 Price'],
      ['📜 History', '❓ Help'],
    ]).resize();
  }

  afterBalance() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('📤 Send', 'quick_send'),
        Markup.button.callback('📥 Receive', 'quick_receive'),
      ],
      [Markup.button.callback('🔄 Refresh', 'refresh_balance')],
    ]);
  }

  paymentOptions(invoiceId: string) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('⚡ Pay Now', `pay_invoice:${invoiceId}`)],
      [Markup.button.callback('❌ Cancel', `cancel_invoice:${invoiceId}`)],
    ]);
  }

  shareContact() {
    return Markup.keyboard([
      [Markup.button.contactRequest('📱 Share Phone Number')],
      [Markup.button.text('❌ Cancel')],
    ])
      .oneTime()
      .resize();
  }

  removeKeyboard() {
    return Markup.removeKeyboard();
  }

  helpCategories() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('💰 Wallet', 'help_wallet'),
        Markup.button.callback('📤 Sending', 'help_send'),
      ],
      [
        Markup.button.callback('📥 Receiving', 'help_receive'),
        Markup.button.callback('👥 Contacts', 'help_contacts'),
      ],
      [Markup.button.callback('🔙 Main Menu', 'main_menu')],
    ]);
  }
}
