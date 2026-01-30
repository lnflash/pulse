import { Injectable, Inject } from '@nestjs/common';
import { CommandHandler } from '../../bot-core/handlers/command-handler.base';
import { IntentHandler } from '../../bot-core/decorators/intent-handler.decorator';
import { Intent } from '../../../core/types';
import { CommandContext } from '../../bot-core/types/command-context';
import { HandlerResult } from '../../bot-core/types/handler-result';
import { TemplatePort, PaymentTemplate } from '../../../core/ports/template.port';
import { FormattedText } from '../../../core/types/messages';

@Injectable()
@IntentHandler(Intent.ManageTemplate)
export class TemplateHandler extends CommandHandler {
  constructor(@Inject('TemplatePort') private readonly templates: TemplatePort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);

    const action = ctx.slots.action ?? 'list';

    switch (action) {
      case 'add':
        return this.handleAdd(ctx);
      case 'remove':
        return this.handleRemove(ctx);
      case 'list':
      default:
        return this.handleList(ctx);
    }
  }

  private async handleList(ctx: CommandContext): Promise<HandlerResult> {
    const templates = await this.templates.listTemplates(ctx.userId);

    if (templates.length === 0) {
      const body: FormattedText = [
        { type: 'bold', value: '📋 Payment Templates' },
        { type: 'newline' },
        { type: 'newline' },
        { type: 'text', value: 'No templates saved yet.' },
        { type: 'newline' },
        { type: 'newline' },
        { type: 'text', value: '💡 Add one with:' },
        { type: 'newline' },
        { type: 'code', value: 'template add coffee 500 to @barista' },
      ];
      return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
    }

    const body: FormattedText = [
      { type: 'bold', value: '📋 Payment Templates' },
      { type: 'newline' },
    ];

    for (const tpl of templates) {
      body.push({ type: 'newline' });
      body.push({ type: 'text', value: `• ` });
      body.push({ type: 'bold', value: tpl.name });
      body.push({
        type: 'text',
        value: ` — ${tpl.amount} sats → ${tpl.recipient}`,
      });
      if (tpl.memo) {
        body.push({ type: 'text', value: ` (${tpl.memo})` });
      }
      body.push({ type: 'newline' });
    }

    body.push({ type: 'newline' });
    body.push({ type: 'text', value: '💡 Use: ' });
    body.push({ type: 'code', value: 'pay <template_name>' });

    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }

  private async handleAdd(ctx: CommandContext): Promise<HandlerResult> {
    const { name, amount, recipient, memo } = ctx.slots;

    if (!name || !amount || !recipient) {
      const body: FormattedText = [
        { type: 'bold', value: '❌ Missing fields' },
        { type: 'newline' },
        { type: 'newline' },
        { type: 'text', value: 'Usage:' },
        { type: 'newline' },
        { type: 'code', value: 'template add <name> <amount> to <recipient> "memo"' },
      ];
      return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
    }

    const template = await this.templates.addTemplate(ctx.userId, {
      name,
      amount: Number(amount),
      recipient,
      memo,
    });

    const body: FormattedText = [
      { type: 'bold', value: '✅ Template saved' },
      { type: 'newline' },
      { type: 'newline' },
      { type: 'text', value: `📝 ` },
      { type: 'bold', value: template.name },
      { type: 'newline' },
      { type: 'text', value: `💰 ${template.amount} sats → ${template.recipient}` },
      { type: 'newline' },
    ];

    if (template.memo) {
      body.push({ type: 'text', value: `📎 ${template.memo}` });
      body.push({ type: 'newline' });
    }

    body.push({ type: 'newline' });
    body.push({ type: 'text', value: 'Use it: ' });
    body.push({ type: 'code', value: `pay ${template.name}` });

    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }

  private async handleRemove(ctx: CommandContext): Promise<HandlerResult> {
    const { name } = ctx.slots;

    if (!name) {
      const body: FormattedText = [
        { type: 'bold', value: '❌ Missing template name' },
        { type: 'newline' },
        { type: 'newline' },
        { type: 'text', value: 'Usage: ' },
        { type: 'code', value: 'template remove <name>' },
      ];
      return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
    }

    const removed = await this.templates.removeTemplate(ctx.userId, name);

    if (!removed) {
      return {
        messages: [this.reply(`Template "${name}" not found.`, ctx)],
      };
    }

    const body: FormattedText = [
      { type: 'text', value: `🗑️ Template ` },
      { type: 'bold', value: name },
      { type: 'text', value: ` removed.` },
    ];

    return { messages: [{ to: ctx.chat, content: { type: 'text', body } }] };
  }
}
