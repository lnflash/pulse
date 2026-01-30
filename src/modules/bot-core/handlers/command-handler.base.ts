import { CommandContext } from '../types/command-context';
import { HandlerResult } from '../types/handler-result';
import { OutboundMessage, OutboundTextContent } from '../../../core/types';

export abstract class CommandHandler {
  abstract execute(ctx: CommandContext): Promise<HandlerResult>;

  protected reply(text: string, ctx: CommandContext): OutboundMessage {
    const content: OutboundTextContent = {
      type: 'text',
      body: [{ type: 'text', value: text }],
    };
    return {
      to: ctx.chat,
      content,
    };
  }

  protected requireAuth(ctx: CommandContext): void {
    if (!ctx.session.flashAuthToken) {
      throw new Error('Authentication required');
    }
  }
}
