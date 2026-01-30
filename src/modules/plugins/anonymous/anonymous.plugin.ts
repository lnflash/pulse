import { Injectable, Inject } from '@nestjs/common';
import {
  PluginPort,
  PluginRecognizer,
  CommandContext,
  HandlerResult,
} from '../../../core/ports/plugin.port';
import { SessionPort } from '../../../core/ports/session.port';
import { SESSION_PORT } from '../../../core/ports/tokens';
import { FormattedText } from '../../../core/types/messages';
import { PluginId } from '../../../core/types/intents';
import { randomBytes } from 'crypto';

const ANIMALS = [
  'Panda',
  'Tiger',
  'Eagle',
  'Dolphin',
  'Wolf',
  'Fox',
  'Owl',
  'Bear',
  'Lion',
  'Hawk',
  'Raven',
  'Phoenix',
  'Dragon',
  'Unicorn',
  'Koala',
  'Penguin',
  'Octopus',
  'Mantis',
  'Butterfly',
  'Cheetah',
];
const COLORS = [
  'Red',
  'Blue',
  'Green',
  'Purple',
  'Orange',
  'Yellow',
  'Pink',
  'Cyan',
  'Magenta',
  'Teal',
  'Indigo',
  'Violet',
  'Crimson',
  'Azure',
  'Emerald',
];

@Injectable()
export class AnonymousPlugin implements PluginPort {
  readonly id = PluginId.Anonymous;
  readonly name = 'Anonymous Messaging';
  readonly description = 'Send anonymous messages and confessions';

  private aliases = new Map<string, string>();
  private lastMessages = new Map<string, { id: string; fromUserId: string }>();
  private conversations = new Map<
    string,
    { participantA: string; participantB: string; aliasA: string; aliasB: string }
  >();
  private userConversations = new Map<string, string>();

  constructor(@Inject(SESSION_PORT) private readonly session: SessionPort) {}

  getRecognizers(): PluginRecognizer[] {
    return [
      {
        pluginId: this.id,
        action: 'anon',
        patterns: [/^anon\s+.+/i, /^anonymous\s+.+/i, /^confess\s+.+/i, /send anon\s+.+/i],
        keywords: ['anon', 'anonymous', 'confess'],
      },
      {
        pluginId: this.id,
        action: 'anonreply',
        patterns: [/^anonreply\s+.+/i, /^reply anon\s+.+/i, /^anon reply\s+.+/i],
        keywords: [],
      },
      {
        pluginId: this.id,
        action: 'anonpoll',
        patterns: [/^anonpoll\s+.+/i, /^anon poll:?\s+.+/i, /^anonymous poll:?\s+.+/i],
        keywords: [],
      },
      {
        pluginId: this.id,
        action: 'anondm',
        patterns: [/^anondm\s+@\w+\s+.+/i, /^anon dm\s+@\w+\s+.+/i, /^dm anon\s+@\w+\s+.+/i],
        keywords: [],
      },
      {
        pluginId: this.id,
        action: 'anonconvo',
        patterns: [/^anonconvo$/i, /start anon convo/i, /anon conversation/i],
        keywords: [],
      },
    ];
  }

  async execute(action: string, ctx: CommandContext): Promise<HandlerResult> {
    switch (action) {
      case 'anon':
        return this.handleAnon(ctx);
      case 'anonreply':
        return this.handleReply(ctx);
      case 'anonpoll':
        return this.handleAnonPoll(ctx);
      case 'anondm':
        return this.handleAnonDM(ctx);
      case 'anonconvo':
        return this.handleConvo(ctx);
      default:
        return this.txt('Unknown anonymous command.');
    }
  }

  async onLoad(): Promise<void> {
    /* no-op */
  }
  async onUnload(): Promise<void> {
    this.aliases.clear();
    this.lastMessages.clear();
  }

  private handleAnon(ctx: CommandContext): HandlerResult {
    const messageText = ctx.rawText
      .replace(/^(send\s+anon(?:ymous)?|anon(?:ymous)?|confess)\s*/i, '')
      .trim();
    if (!messageText) return this.txt('Please provide a message to send anonymously!');

    const alias = this.getAlias(ctx);
    const msgId = randomBytes(4).toString('hex');
    const contextKey = ctx.isGroup ? ctx.groupId! : ctx.userId;
    this.lastMessages.set(contextKey, { id: msgId, fromUserId: ctx.userId });

    const label = messageText.toLowerCase().includes('confess') ? 'Confession' : 'Anonymous';
    return this.txt(
      `${label} ${alias}\n\n${messageText}\n\nReply with "anonreply" to respond anonymously`,
    );
  }

  private handleReply(ctx: CommandContext): HandlerResult {
    const replyText = ctx.rawText.replace(/^(anonreply|reply anon|anon reply)\s+/i, '');
    if (!replyText) return this.txt('Please provide a reply message!');

    const contextKey = ctx.isGroup ? ctx.groupId! : ctx.userId;
    const lastMsg = this.lastMessages.get(contextKey);
    if (!lastMsg) return this.txt('No recent anonymous message to reply to!');

    const alias = this.getAlias(ctx);
    return this.txt(`Anonymous ${alias} (replying)\n\n${replyText}`);
  }

  private handleAnonPoll(ctx: CommandContext): HandlerResult {
    if (!ctx.isGroup) return this.txt('Anonymous polls can only be created in groups!');

    const pollText = ctx.rawText.replace(/^(anonpoll|anon poll:?|anonymous poll:?)\s*/i, '');
    const parts = pollText
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length < 3)
      return this.txt(
        'Please provide at least 2 options!\n\nFormat: anonpoll Question | Option 1 | Option 2',
      );

    const question = parts[0];
    const options = parts.slice(1, 10);
    const alias = this.generateAlias();

    const optionList = options.map((o, i) => `${i + 1}. ${o}`).join('\n');
    return this.txt(
      `Anonymous Poll by ${alias}\n\n${question}\n\n${optionList}\n\nVote with numbers (1-${options.length})\n\nThis poll was created anonymously`,
    );
  }

  private handleAnonDM(ctx: CommandContext): HandlerResult {
    const match = ctx.rawText.match(/(?:anon(?:ymous)?\s*dm|dm\s*anon(?:ymous)?)\s+@(\w+)\s+(.+)/i);
    if (!match) return this.txt('Invalid format!\n\nUse: anondm @username your message');

    const alias = this.generateAlias();
    return this.txt(
      `Anonymous DM sent to @${match[1]}\n\nThey will receive:\nAnonymous ${alias}: ${match[2]}\n\nYour identity will remain secret`,
    );
  }

  private handleConvo(ctx: CommandContext): HandlerResult {
    const existingConvoId = this.userConversations.get(ctx.userId);
    if (existingConvoId && this.conversations.has(existingConvoId)) {
      const convo = this.conversations.get(existingConvoId)!;
      const alias = ctx.userId === convo.participantA ? convo.aliasA : convo.aliasB;
      return this.txt(
        `You already have an active anonymous conversation as ${alias}!\n\nShare this code: ${existingConvoId}`,
      );
    }

    const convoId = randomBytes(3).toString('hex').toUpperCase();
    const alias = this.generateAlias();
    this.conversations.set(convoId, {
      participantA: ctx.userId,
      participantB: '',
      aliasA: alias,
      aliasB: '',
    });
    this.userConversations.set(ctx.userId, convoId);

    return this.txt(
      `Anonymous Conversation Started\n\nYour alias: ${alias}\nConversation code: ${convoId}\n\nShare this code with someone to start chatting anonymously!`,
    );
  }

  private getAlias(ctx: CommandContext): string {
    const key = `${ctx.isGroup ? ctx.groupId : 'global'}:${ctx.userId}`;
    if (!this.aliases.has(key)) {
      this.aliases.set(key, this.generateAlias());
    }
    return this.aliases.get(key)!;
  }

  private generateAlias(): string {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    return `${color} ${animal}`;
  }

  private txt(value: string): HandlerResult {
    const text: FormattedText = [{ type: 'text', value }];
    return { text };
  }
}
