import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../core/types';
import { CommandContext } from '../../bot-core/types/command-context';
import { HandlerResult } from '../../bot-core/types/handler-result';
import { WalletPort, Contact, ContactHistoryEntry } from '../../../core/ports/wallet.port';
import { FormattedText } from '../../../core/types/messages';

@Injectable()
@IntentHandler(Intent.ManageContacts)
export class ContactsHandler extends CommandHandler {
  constructor(@Inject('WalletPort') private readonly wallet: WalletPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    const action = ctx.slots.action || 'list';
    switch (action) {
      case 'add':
        return this.addContact(ctx);
      case 'remove':
        return this.removeContact(ctx);
      case 'history':
        return this.viewContactHistory(ctx);
      case 'list':
      default:
        return this.listContacts(ctx);
    }
  }

  private async listContacts(ctx: CommandContext): Promise<HandlerResult> {
    const contacts = await this.wallet.getContacts(ctx.userId);

    if (!contacts || contacts.length === 0) {
      const body: FormattedText = [
        { type: 'text', value: '📇 No contacts saved yet.' },
        { type: 'newline' },
        { type: 'newline' },
        { type: 'text', value: 'Add one: ' },
        { type: 'code', value: 'contacts add <name> <phone>' },
      ];
      return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
    }

    const body: FormattedText = [
      { type: 'bold', value: '📇 Your Contacts' },
      { type: 'newline' },
      { type: 'newline' },
    ];

    for (const contact of contacts) {
      const icon = contact.source === 'vcard' ? '📲' : '📝';
      body.push({ type: 'text', value: `${icon} ` });
      body.push({ type: 'bold', value: contact.name });
      if (contact.phone) {
        body.push({ type: 'text', value: ` (${contact.phone})` });
      }
      if (contact.username) {
        body.push({ type: 'text', value: ` @${contact.username}` });
      }
      body.push({ type: 'newline' });
    }

    body.push({ type: 'newline' });
    body.push({ type: 'text', value: 'Manage: ' });
    body.push({ type: 'code', value: 'contacts add|remove|history <name>' });

    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }

  private async addContact(ctx: CommandContext): Promise<HandlerResult> {
    const name = ctx.slots.name;
    if (!name) {
      const body: FormattedText = [
        { type: 'text', value: '❌ Please provide a contact name.' },
        { type: 'newline' },
        { type: 'text', value: 'Usage: ' },
        { type: 'code', value: 'contacts add <name> <phone>' },
      ];
      return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
    }

    const phone = ctx.slots.phone;
    const contact = await this.wallet.addContact(ctx.userId, name, phone);

    const body: FormattedText = [
      { type: 'text', value: '✅ Contact added: ' },
      { type: 'bold', value: contact.name },
    ];
    if (contact.phone) {
      body.push({ type: 'text', value: ` (${contact.phone})` });
    }

    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }

  private async removeContact(ctx: CommandContext): Promise<HandlerResult> {
    const name = ctx.slots.name;
    if (!name) {
      const body: FormattedText = [
        { type: 'text', value: '❌ Please provide a contact name to remove.' },
      ];
      return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
    }

    const removed = await this.wallet.removeContact(ctx.userId, name);

    if (!removed) {
      const body: FormattedText = [
        { type: 'text', value: '❌ Contact not found: ' },
        { type: 'bold', value: name },
      ];
      return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
    }

    const body: FormattedText = [
      { type: 'text', value: '✅ Contact removed: ' },
      { type: 'bold', value: name },
    ];
    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }

  private async viewContactHistory(ctx: CommandContext): Promise<HandlerResult> {
    const name = ctx.slots.name;
    if (!name) {
      const body: FormattedText = [
        { type: 'text', value: '❌ Please provide a contact name.' },
        { type: 'newline' },
        { type: 'text', value: 'Usage: ' },
        { type: 'code', value: 'contacts history <name>' },
      ];
      return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
    }

    const history = await this.wallet.getContactHistory(ctx.userId, name);

    if (!history || history.length === 0) {
      const body: FormattedText = [
        { type: 'text', value: `📋 No payment history with ` },
        { type: 'bold', value: name },
        { type: 'text', value: '.' },
      ];
      return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
    }

    const body: FormattedText = [
      { type: 'bold', value: `📋 Payment History with ${name}` },
      { type: 'newline' },
      { type: 'newline' },
    ];

    for (const entry of history) {
      const icon = entry.type === 'send' ? '📤' : entry.type === 'receive' ? '📥' : '📨';
      const sign = entry.type === 'send' ? '-' : '+';
      body.push({ type: 'text', value: `${icon} ${sign}${entry.amount} ${entry.currency}` });
      if (entry.memo) {
        body.push({ type: 'text', value: ` — ${entry.memo}` });
      }
      body.push({ type: 'newline' });
    }

    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }
}
