import { Injectable } from '@nestjs/common';
import {
  BasePlugin,
  CommandDefinition,
  ParsedCommand,
  CommandContext,
  PluginResponse,
} from '../interfaces/plugin.interface';
import { RedisService } from '../../redis/redis.service';
import { randomBytes } from 'crypto';

interface AnonymousMessage {
  id: string;
  fromUserId: string;
  toUserId?: string;
  toGroupId?: string;
  message: string;
  timestamp: number;
  replyToId?: string;
}

interface AnonymousConversation {
  id: string;
  participantA: string;
  participantB: string;
  aliasA: string;
  aliasB: string;
  messages: string[]; // message IDs
  active: boolean;
  createdAt: number;
}

/**
 * Anonymous messaging plugin for private and group communication
 */
@Injectable()
export class AnonymousMessagingPlugin extends BasePlugin {
  id = 'anonymous-messaging';
  name = 'Anonymous Messaging';
  description = 'Send anonymous messages and confessions';
  version = '1.0.0';

  private animalAliases = [
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

  private colorAliases = [
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

  commands: CommandDefinition[] = [
    {
      trigger: 'anon',
      aliases: ['anonymous'],
      patterns: [/anon(?:ymous)?\s+(.+)/i, /send anon(?:ymous)?\s+(.+)/i, /confess\s+(.+)/i],
      description: 'Send an anonymous message',
      examples: ['anon I think you are amazing', 'confess I ate the last cookie'],
      groupSupported: true,
      requiresAuth: false,
    },
    {
      trigger: 'anonreply',
      patterns: [/reply anon(?:ymous)?\s+(.+)/i, /anon reply\s+(.+)/i],
      description: 'Reply anonymously to the last anonymous message',
      examples: ['anonreply Thank you!', 'reply anon I know it was you'],
      groupSupported: true,
      requiresAuth: false,
    },
    {
      trigger: 'anonpoll',
      patterns: [/anon poll:?\s+(.+)/i, /anonymous poll:?\s+(.+)/i],
      description: 'Create an anonymous poll',
      examples: ['anonpoll Who is the best developer? | Alice | Bob | Charlie'],
      groupSupported: true,
      requiresAuth: false,
    },
    {
      trigger: 'anondm',
      patterns: [/anon dm\s+@(\w+)\s+(.+)/i, /dm anon\s+@(\w+)\s+(.+)/i],
      description: 'Send anonymous DM to a user',
      examples: ['anondm @john I admire your work', 'dm anon @alice you rock!'],
      groupSupported: false,
      requiresAuth: true,
    },
    {
      trigger: 'anonconvo',
      patterns: [/start anon convo/i, /anon conversation/i],
      description: 'Start an anonymous conversation',
      examples: ['anonconvo', 'start anon convo'],
      groupSupported: false,
      requiresAuth: true,
    },
  ];

  constructor(private redisService: RedisService) {
    super();
  }

  async handleCommand(command: ParsedCommand, context: CommandContext): Promise<PluginResponse> {
    switch (command.trigger.toLowerCase()) {
      case 'anon':
      case 'anonymous':
        return this.handleAnonymousMessage(command, context);
      case 'anonreply':
        return this.handleAnonymousReply(command, context);
      case 'anonpoll':
        return this.handleAnonymousPoll(command, context);
      case 'anondm':
        return this.handleAnonymousDM(command, context);
      case 'anonconvo':
        return this.handleAnonymousConversation(command, context);
      default:
        return {
          text: '❓ Unknown anonymous command',
        };
    }
  }

  private async handleAnonymousMessage(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    const messageText =
      command.args.join(' ') || command.rawText.replace(/^(anon|anonymous|confess)\s+/i, '');

    if (!messageText) {
      return {
        text: '❌ Please provide a message to send anonymously!',
      };
    }

    // Generate anonymous alias for this session
    const aliasKey = `anon:alias:${context.isGroup ? context.groupId : 'global'}:${context.userId}`;
    let alias = await this.redisService.get(aliasKey);

    if (!alias) {
      alias = this.generateAlias();
      // Keep alias for 24 hours
      await this.redisService.set(aliasKey, alias, 86400);
    }

    // Create anonymous message
    const message: AnonymousMessage = {
      id: randomBytes(4).toString('hex'),
      fromUserId: context.userId,
      message: messageText,
      timestamp: Date.now(),
    };

    if (context.isGroup) {
      message.toGroupId = context.groupId;
    }

    // Store message for potential replies
    const messageKey = `anon:message:${message.id}`;
    await this.redisService.set(messageKey, JSON.stringify(message), 3600); // 1 hour

    // Store as last message in context
    const lastMessageKey = `anon:last:${context.isGroup ? context.groupId : context.userId}`;
    await this.redisService.set(lastMessageKey, message.id, 3600);

    // Format response
    let response = `🎭 *Anonymous ${alias}*\n\n${messageText}`;

    if (messageText.toLowerCase().includes('confess')) {
      response = `🤐 *Confession from ${alias}*\n\n${messageText}`;
    }

    response += '\n\n_Reply with "anonreply" to respond anonymously_';

    // Track analytics
    await this.trackEvent('anon_message_sent', {
      isGroup: context.isGroup,
      messageLength: messageText.length,
    });

    return {
      text: response,
      showTyping: true,
      delay: 500,
    };
  }

  private async handleAnonymousReply(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    const replyText =
      command.args.join(' ') || command.rawText.replace(/^(reply anon|anon reply)\s+/i, '');

    if (!replyText) {
      return {
        text: '❌ Please provide a reply message!',
      };
    }

    // Get last anonymous message
    const lastMessageKey = `anon:last:${context.isGroup ? context.groupId : context.userId}`;
    const lastMessageId = await this.redisService.get(lastMessageKey);

    if (!lastMessageId) {
      return {
        text: '❌ No recent anonymous message to reply to!',
      };
    }

    // Get original message
    const messageKey = `anon:message:${lastMessageId}`;
    const originalMessageData = await this.redisService.get(messageKey);

    if (!originalMessageData) {
      return {
        text: '❌ Original message expired. Anonymous messages can only be replied to within 1 hour.',
      };
    }

    const originalMessage: AnonymousMessage = JSON.parse(originalMessageData);

    // Generate alias for replier
    const aliasKey = `anon:alias:${context.isGroup ? context.groupId : 'global'}:${context.userId}`;
    let alias = await this.redisService.get(aliasKey);

    if (!alias) {
      alias = this.generateAlias();
      await this.redisService.set(aliasKey, alias, 86400);
    }

    // Create reply
    const reply: AnonymousMessage = {
      id: randomBytes(4).toString('hex'),
      fromUserId: context.userId,
      message: replyText,
      timestamp: Date.now(),
      replyToId: lastMessageId,
    };

    if (context.isGroup) {
      reply.toGroupId = context.groupId;
    }

    // Store reply
    await this.redisService.set(`anon:message:${reply.id}`, JSON.stringify(reply), 3600);
    await this.redisService.set(lastMessageKey, reply.id, 3600);

    // Format response
    const response = `🎭 *Anonymous ${alias}* (replying)\n\n${replyText}`;

    return {
      text: response,
      showTyping: true,
      delay: 300,
    };
  }

  private async handleAnonymousPoll(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    if (!context.isGroup) {
      return {
        text: '❌ Anonymous polls can only be created in groups!',
      };
    }

    const pollText =
      command.args.join(' ') || command.rawText.replace(/^anon(?:ymous)? poll:?\s*/i, '');

    if (!pollText) {
      return {
        text: '❌ Please provide poll question and options!\n\nFormat: anonpoll Question | Option1 | Option2',
      };
    }

    // Parse poll
    const parts = pollText
      .split('|')
      .map((p) => p.trim())
      .filter((p) => p);

    if (parts.length < 3) {
      return {
        text: '❌ Please provide at least 2 options!\n\nFormat: anonpoll Question | Option 1 | Option 2',
      };
    }

    const question = parts[0];
    const options = parts.slice(1).slice(0, 9); // Max 9 options

    // Generate anonymous alias
    const alias = this.generateAlias();

    // Format poll display
    let text = `🎭 *Anonymous Poll by ${alias}*\n\n❓ ${question}\n\n`;
    options.forEach((option, index) => {
      const number = index + 1;
      text += `${number}️⃣ ${option}\n`;
    });
    text += `\n🗳️ Vote with numbers (1-${options.length})`;
    text += `\n\n_This poll was created anonymously_`;

    return {
      text,
      showTyping: true,
      delay: 500,
    };
  }

  private async handleAnonymousDM(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    // Parse DM command: anondm @username message
    const match =
      command.rawText.match(/anon(?:ymous)? dm\s+@(\w+)\s+(.+)/i) ||
      command.rawText.match(/dm anon(?:ymous)?\s+@(\w+)\s+(.+)/i);

    if (!match) {
      return {
        text: '❌ Invalid format!\n\nUse: anondm @username your message',
      };
    }

    const targetUsername = match[1];
    const messageText = match[2];

    // In a real implementation, you'd look up the user by username
    // For now, we'll just format the message

    const alias = this.generateAlias();

    const response =
      `🎭 *Anonymous DM sent to @${targetUsername}*\n\n` +
      `They will receive:\n` +
      `"💌 Anonymous ${alias}: ${messageText}"\n\n` +
      `_Your identity will remain secret_`;

    // Track event
    await this.trackEvent('anon_dm_sent', {
      messageLength: messageText.length,
    });

    return {
      text: response,
      showTyping: true,
      delay: 500,
    };
  }

  private async handleAnonymousConversation(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    // Check for active conversation
    const activeConvoKey = `anon:convo:active:${context.userId}`;
    const activeConvoId = await this.redisService.get(activeConvoKey);

    if (activeConvoId) {
      const convoData = await this.redisService.get(`anon:convo:${activeConvoId}`);
      if (convoData) {
        const convo: AnonymousConversation = JSON.parse(convoData);
        const userAlias = context.userId === convo.participantA ? convo.aliasA : convo.aliasB;

        return {
          text:
            `🎭 You already have an active anonymous conversation as *${userAlias}*!\n\n` +
            `Share this code with someone to let them join: \`${convo.id}\`\n\n` +
            `Or type "join ${convo.id}" to rejoin the conversation.`,
        };
      }
    }

    // Create new conversation
    const convoId = randomBytes(3).toString('hex').toUpperCase();
    const conversation: AnonymousConversation = {
      id: convoId,
      participantA: context.userId,
      participantB: '',
      aliasA: this.generateAlias(),
      aliasB: '',
      messages: [],
      active: false,
      createdAt: Date.now(),
    };

    // Store conversation
    await this.redisService.set(
      `anon:convo:${convoId}`,
      JSON.stringify(conversation),
      86400, // 24 hours
    );

    // Mark as user's active conversation
    await this.redisService.set(activeConvoKey, convoId, 86400);

    return {
      text:
        `🎭 *Anonymous Conversation Started*\n\n` +
        `Your alias: *${conversation.aliasA}*\n` +
        `Conversation code: \`${convoId}\`\n\n` +
        `Share this code with someone to start chatting anonymously!\n` +
        `They should type: \`join ${convoId}\`\n\n` +
        `_Both identities will remain hidden_`,
      showTyping: true,
      delay: 500,
    };
  }

  private generateAlias(): string {
    const color = this.colorAliases[Math.floor(Math.random() * this.colorAliases.length)];
    const animal = this.animalAliases[Math.floor(Math.random() * this.animalAliases.length)];
    return `${color} ${animal}`;
  }

  private async trackEvent(event: string, properties: any): Promise<void> {
    // Analytics tracking
    console.log('Anonymous messaging event:', event, properties);
  }
}
