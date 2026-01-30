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

interface Decision {
  id: string;
  groupId: string;
  createdBy: string;
  createdByUsername?: string;
  title: string;
  description: string;
  options: DecisionOption[];
  votingMethod: 'simple' | 'ranked' | 'weighted' | 'consensus';
  status: 'open' | 'closed' | 'decided';
  voters: Set<string>;
  votes: Record<string, any>; // userId -> vote data
  deadline?: number;
  quorum?: number; // minimum voters needed
  threshold?: number; // percentage needed to pass
  result?: string;
  createdAt: number;
}

interface DecisionOption {
  id: string;
  text: string;
  pros: string[];
  cons: string[];
  addedBy?: string;
}

interface ConsensusDiscussion {
  decisionId: string;
  messages: DiscussionMessage[];
  consensusReached: boolean;
  blockers: string[]; // user IDs blocking consensus
}

interface DiscussionMessage {
  userId: string;
  username?: string;
  message: string;
  timestamp: number;
  type: 'comment' | 'concern' | 'support' | 'block';
}

/**
 * Group decision making plugin with various voting methods
 */
@Injectable()
export class DecisionMakingPlugin extends BasePlugin {
  id = 'decision-making';
  name = 'Group Decision Making';
  description = 'Democratic decision making tools for groups';
  version = '1.0.0';

  commands: CommandDefinition[] = [
    {
      trigger: 'decide',
      aliases: ['decision'],
      patterns: [/decide\s+(.+)/i, /make decision\s+(.+)/i, /group decision\s+(.+)/i],
      description: 'Start a group decision process',
      examples: ['decide Should we meet on Friday?', 'decision Project name: Alpha | Beta | Gamma'],
      groupSupported: true,
      requiresAuth: false,
    },
    {
      trigger: 'vote',
      patterns: [/vote\s+(.+)/i],
      description: 'Vote on active decision',
      examples: ['vote 1', 'vote yes', 'vote option1'],
      groupSupported: true,
      requiresAuth: false,
    },
    {
      trigger: 'consensus',
      patterns: [/consensus\s+(.+)/i, /reach consensus\s+(.+)/i],
      description: 'Start consensus-based decision',
      examples: ['consensus Should we change our meeting time?'],
      groupSupported: true,
      requiresAuth: false,
    },
    {
      trigger: 'discuss',
      patterns: [/discuss\s+(.+)/i, /comment\s+(.+)/i],
      description: 'Add to decision discussion',
      examples: [
        'discuss I think option 2 is better because...',
        'comment concerned about timeline',
      ],
      groupSupported: true,
      requiresAuth: false,
    },
    {
      trigger: 'pros',
      patterns: [/pros?\s+(.+)/i, /add pro\s+(.+)/i],
      description: 'Add pros to an option',
      examples: ['pro option1: More cost effective', 'pros 2: Better quality'],
      groupSupported: true,
      requiresAuth: false,
    },
    {
      trigger: 'cons',
      patterns: [/cons?\s+(.+)/i, /add con\s+(.+)/i],
      description: 'Add cons to an option',
      examples: ['con option1: Takes longer', 'cons 2: More expensive'],
      groupSupported: true,
      requiresAuth: false,
    },
    {
      trigger: 'decision-status',
      aliases: ['dstatus'],
      patterns: [/decision status/i, /show decision/i],
      description: 'Show current decision status',
      examples: ['decision-status', 'dstatus'],
      groupSupported: true,
      requiresAuth: false,
    },
  ];

  constructor(private redisService: RedisService) {
    super();
  }

  async handleCommand(command: ParsedCommand, context: CommandContext): Promise<PluginResponse> {
    if (!context.isGroup) {
      return {
        text: '❌ Decision making features are only available in group chats!',
      };
    }

    switch (command.trigger.toLowerCase()) {
      case 'decide':
      case 'decision':
        return this.startDecision(command, context);
      case 'vote':
        return this.handleVote(command, context);
      case 'consensus':
        return this.startConsensus(command, context);
      case 'discuss':
      case 'comment':
        return this.addDiscussion(command, context);
      case 'pros':
      case 'pro':
        return this.addProCon(command, context, 'pro');
      case 'cons':
      case 'con':
        return this.addProCon(command, context, 'con');
      case 'decision-status':
      case 'dstatus':
        return this.showDecisionStatus(context);
      default:
        return {
          text: '❓ Unknown decision command',
        };
    }
  }

  private async startDecision(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    const decisionText =
      command.args.join(' ') || command.rawText.replace(/^(decide|decision)\s+/i, '');

    if (!decisionText) {
      return {
        text: '❌ Please provide a decision to make!\n\nExample: decide Should we use TypeScript? | Yes | No',
      };
    }

    // Check for existing decision
    const activeKey = `decision:active:${context.groupId}`;
    const existing = await this.redisService.get(activeKey);

    if (existing) {
      return {
        text: '❌ There\'s already an active decision! Use "decision-status" to see it.',
      };
    }

    // Parse decision format
    const parts = decisionText
      .split('|')
      .map((p) => p.trim())
      .filter((p) => p);

    let title: string;
    let options: DecisionOption[];

    if (parts.length === 1) {
      // Simple yes/no decision
      title = parts[0];
      options = [
        { id: 'yes', text: 'Yes', pros: [], cons: [] },
        { id: 'no', text: 'No', pros: [], cons: [] },
      ];
    } else {
      // Multiple options
      title = parts[0];
      options = parts.slice(1).map((text, index) => ({
        id: `option${index + 1}`,
        text,
        pros: [],
        cons: [],
      }));
    }

    // Create decision
    const decision: Decision = {
      id: randomBytes(4).toString('hex'),
      groupId: context.groupId!,
      createdBy: context.userId,
      createdByUsername: context.username,
      title,
      description: '',
      options,
      votingMethod: 'simple',
      status: 'open',
      voters: new Set(),
      votes: {},
      deadline: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      quorum: Math.ceil((await this.estimateGroupSize(context.groupId!)) * 0.5),
      threshold: 50, // 50% to pass
      createdAt: Date.now(),
    };

    // Store decision
    await this.redisService.set(
      activeKey,
      JSON.stringify({
        ...decision,
        voters: Array.from(decision.voters),
      }),
      86400, // 24 hours
    );

    // Format response
    let text = `🗳️ *New Decision*\n\n`;
    text += `❓ ${title}\n\n`;
    text += `*Options:*\n`;
    options.forEach((option, index) => {
      text += `${index + 1}. ${option.text}\n`;
    });
    text += `\n📊 Voting method: Simple majority`;
    text += `\n👥 Quorum needed: ${decision.quorum} votes`;
    text += `\n⏰ Deadline: 24 hours`;
    text += `\n\n💡 Commands:`;
    text += `\n• vote [option] - Cast your vote`;
    text += `\n• pros [option]: [reason] - Add pros`;
    text += `\n• cons [option]: [reason] - Add cons`;
    text += `\n• discuss [comment] - Add to discussion`;

    return {
      text,
      showTyping: true,
      delay: 500,
    };
  }

  private async handleVote(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    const activeKey = `decision:active:${context.groupId}`;
    const decisionData = await this.redisService.get(activeKey);

    if (!decisionData) {
      return {
        text: '❌ No active decision to vote on!',
      };
    }

    const decision: Decision = JSON.parse(decisionData);
    decision.voters = new Set(decision.voters);

    const voteText = command.args.join(' ').toLowerCase();
    let selectedOption: DecisionOption | undefined;

    // Match vote to option
    if (voteText === 'yes' || voteText === '1') {
      selectedOption = decision.options.find((o) => o.id === 'yes') || decision.options[0];
    } else if (voteText === 'no' || voteText === '2') {
      selectedOption = decision.options.find((o) => o.id === 'no') || decision.options[1];
    } else {
      // Try to match by number or text
      const voteNum = parseInt(voteText);
      if (!isNaN(voteNum) && voteNum > 0 && voteNum <= decision.options.length) {
        selectedOption = decision.options[voteNum - 1];
      } else {
        // Try to match by option text
        selectedOption = decision.options.find(
          (o) => o.text.toLowerCase().includes(voteText) || o.id.toLowerCase() === voteText,
        );
      }
    }

    if (!selectedOption) {
      return {
        text: '❌ Invalid vote! Please specify a valid option.',
      };
    }

    // Record vote
    decision.votes[context.userId] = selectedOption.id;
    decision.voters.add(context.userId);

    // Check if decision is reached
    const voteCount = this.countVotes(decision);
    const totalVotes = decision.voters.size;
    const leadingOption = this.getLeadingOption(voteCount);

    let statusText = `✅ Vote recorded: ${selectedOption.text}\n\n`;
    statusText += `📊 *Current Results*\n`;

    decision.options.forEach((option) => {
      const count = voteCount[option.id] || 0;
      const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      statusText += `${option.text}: ${count} votes (${percentage}%)\n`;
    });

    statusText += `\n👥 Total votes: ${totalVotes}/${decision.quorum || 0}`;

    // Check if quorum reached and there's a clear winner
    if (decision.quorum && totalVotes >= decision.quorum) {
      const winnerPercentage = totalVotes > 0 ? (voteCount[leadingOption] / totalVotes) * 100 : 0;

      if (winnerPercentage > (decision.threshold || 50)) {
        decision.status = 'decided';
        decision.result = leadingOption;

        const winningOption = decision.options.find((o) => o.id === leadingOption);
        statusText += `\n\n🎉 *Decision Made!*\n`;
        statusText += `✅ ${winningOption?.text} has won with ${Math.round(winnerPercentage)}% of votes!`;
      }
    }

    // Update decision
    await this.redisService.set(
      activeKey,
      JSON.stringify({
        ...decision,
        voters: Array.from(decision.voters),
      }),
      86400,
    );

    return {
      text: statusText,
      showTyping: true,
      delay: 300,
    };
  }

  private async startConsensus(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    const title = command.args.join(' ') || command.rawText.replace(/^consensus\s+/i, '');

    if (!title) {
      return {
        text: '❌ Please provide a topic for consensus!\n\nExample: consensus Should we change our meeting schedule?',
      };
    }

    // Create consensus decision
    const decision: Decision = {
      id: randomBytes(4).toString('hex'),
      groupId: context.groupId!,
      createdBy: context.userId,
      createdByUsername: context.username,
      title,
      description: 'This decision requires consensus from all participants.',
      options: [{ id: 'consensus', text: 'Reach Consensus', pros: [], cons: [] }],
      votingMethod: 'consensus',
      status: 'open',
      voters: new Set(),
      votes: {},
      createdAt: Date.now(),
    };

    // Create discussion thread
    const discussion: ConsensusDiscussion = {
      decisionId: decision.id,
      messages: [],
      consensusReached: false,
      blockers: [],
    };

    // Store both
    const activeKey = `decision:active:${context.groupId}`;
    await this.redisService.set(
      activeKey,
      JSON.stringify({
        ...decision,
        voters: Array.from(decision.voters),
      }),
      86400,
    );

    await this.redisService.set(`consensus:${decision.id}`, JSON.stringify(discussion), 86400);

    const text =
      `🤝 *Consensus Decision Process*\n\n` +
      `❓ ${title}\n\n` +
      `This decision requires consensus from all participants.\n\n` +
      `*How it works:*\n` +
      `• Everyone discusses until agreement is reached\n` +
      `• Use "discuss" to share thoughts\n` +
      `• Use "support" to show agreement\n` +
      `• Use "block" to prevent consensus (with reason)\n` +
      `• Consensus is reached when no one blocks\n\n` +
      `💬 Start the discussion!`;

    return {
      text,
      showTyping: true,
      delay: 500,
    };
  }

  private async addDiscussion(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    const activeKey = `decision:active:${context.groupId}`;
    const decisionData = await this.redisService.get(activeKey);

    if (!decisionData) {
      return {
        text: '❌ No active decision to discuss!',
      };
    }

    const decision: Decision = JSON.parse(decisionData);
    const message = command.args.join(' ');

    if (!message) {
      return {
        text: '❌ Please provide a comment!',
      };
    }

    // Determine message type
    let messageType: 'comment' | 'concern' | 'support' | 'block' = 'comment';
    if (message.toLowerCase().includes('concern')) {
      messageType = 'concern';
    } else if (
      message.toLowerCase().includes('support') ||
      message.toLowerCase().includes('agree')
    ) {
      messageType = 'support';
    } else if (
      message.toLowerCase().includes('block') ||
      message.toLowerCase().includes('oppose')
    ) {
      messageType = 'block';
    }

    // For consensus decisions, update discussion
    if (decision.votingMethod === 'consensus') {
      const discussionKey = `consensus:${decision.id}`;
      const discussionData = await this.redisService.get(discussionKey);

      if (discussionData) {
        const discussion: ConsensusDiscussion = JSON.parse(discussionData);

        discussion.messages.push({
          userId: context.userId,
          username: context.username,
          message,
          timestamp: Date.now(),
          type: messageType,
        });

        // Update blockers
        if (messageType === 'block') {
          if (!discussion.blockers.includes(context.userId)) {
            discussion.blockers.push(context.userId);
          }
        } else if (messageType === 'support') {
          discussion.blockers = discussion.blockers.filter((id) => id !== context.userId);
        }

        await this.redisService.set(discussionKey, JSON.stringify(discussion), 86400);

        let response = `💬 @${context.username || 'User'}: ${message}\n\n`;

        if (messageType === 'block') {
          response += `🚫 Blocking consensus. Please explain your concerns.`;
        } else if (messageType === 'support' && discussion.blockers.length === 0) {
          response += `✅ Consensus reached! All participants agree.`;
          decision.status = 'decided';
          decision.result = 'consensus';

          await this.redisService.set(
            activeKey,
            JSON.stringify({
              ...decision,
              voters: Array.from(decision.voters),
            }),
            86400,
          );
        } else if (discussion.blockers.length > 0) {
          response += `⏳ ${discussion.blockers.length} participant(s) still have concerns.`;
        }

        return {
          text: response,
          showTyping: true,
          delay: 300,
        };
      }
    }

    // For regular decisions, just acknowledge
    return {
      text: `💬 Comment added by @${context.username || 'User'}:\n"${message}"\n\nThe discussion helps inform everyone's vote!`,
    };
  }

  private async addProCon(
    command: ParsedCommand,
    context: CommandContext,
    type: 'pro' | 'con',
  ): Promise<PluginResponse> {
    const activeKey = `decision:active:${context.groupId}`;
    const decisionData = await this.redisService.get(activeKey);

    if (!decisionData) {
      return {
        text: '❌ No active decision!',
      };
    }

    // Parse format: "pro option1: reason" or "con 2: reason"
    const input = command.args.join(' ');
    const match = input.match(/^([\w\d]+):?\s*(.+)$/);

    if (!match) {
      return {
        text: `❌ Invalid format!\n\nUse: ${type} [option]: [reason]`,
      };
    }

    const optionRef = match[1].toLowerCase();
    const reason = match[2];

    const decision: Decision = JSON.parse(decisionData);

    // Find the option
    let option: DecisionOption | undefined;
    const optionNum = parseInt(optionRef);

    if (!isNaN(optionNum) && optionNum > 0 && optionNum <= decision.options.length) {
      option = decision.options[optionNum - 1];
    } else {
      option = decision.options.find(
        (o) => o.id.toLowerCase() === optionRef || o.text.toLowerCase().includes(optionRef),
      );
    }

    if (!option) {
      return {
        text: '❌ Option not found! Please specify a valid option.',
      };
    }

    // Add pro or con
    if (type === 'pro') {
      option.pros.push(reason);
    } else {
      option.cons.push(reason);
    }

    // Update decision
    await this.redisService.set(
      activeKey,
      JSON.stringify({
        ...decision,
        voters: Array.from(decision.voters),
      }),
      86400,
    );

    const emoji = type === 'pro' ? '✅' : '❌';
    return {
      text: `${emoji} ${type.toUpperCase()} added to "${option.text}":\n"${reason}"\n\nThis will help others make an informed decision!`,
    };
  }

  private async showDecisionStatus(context: CommandContext): Promise<PluginResponse> {
    const activeKey = `decision:active:${context.groupId}`;
    const decisionData = await this.redisService.get(activeKey);

    if (!decisionData) {
      return {
        text: '❌ No active decision in this group!',
      };
    }

    const decision: Decision = JSON.parse(decisionData);
    decision.voters = new Set(decision.voters);

    let text = `🗳️ *Decision Status*\n\n`;
    text += `❓ ${decision.title}\n`;

    if (decision.createdByUsername) {
      text += `👤 Started by @${decision.createdByUsername}\n`;
    }

    const timeLeft = decision.deadline
      ? this.formatTimeRemaining(decision.deadline - Date.now())
      : 'No deadline';
    text += `⏰ Time left: ${timeLeft}\n\n`;

    // Show options with pros/cons
    text += `*Options:*\n`;
    const voteCount = this.countVotes(decision);
    const totalVotes = decision.voters.size;

    decision.options.forEach((option, index) => {
      const count = voteCount[option.id] || 0;
      const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;

      text += `\n${index + 1}. *${option.text}* - ${count} votes (${percentage}%)\n`;

      if (option.pros.length > 0) {
        text += `   ✅ Pros:\n`;
        option.pros.forEach((pro) => (text += `      • ${pro}\n`));
      }

      if (option.cons.length > 0) {
        text += `   ❌ Cons:\n`;
        option.cons.forEach((con) => (text += `      • ${con}\n`));
      }
    });

    text += `\n👥 Participation: ${totalVotes}${decision.quorum ? `/${decision.quorum}` : ''} votes`;

    if (decision.status === 'decided') {
      const winningOption = decision.options.find((o) => o.id === decision.result);
      text += `\n\n🎉 *Decision Made:* ${winningOption?.text}`;
    }

    return {
      text,
      showTyping: true,
      delay: 400,
    };
  }

  private countVotes(decision: Decision): Record<string, number> {
    const count: Record<string, number> = {};
    Object.values(decision.votes).forEach((optionId) => {
      count[optionId] = (count[optionId] || 0) + 1;
    });
    return count;
  }

  private getLeadingOption(voteCount: Record<string, number>): string {
    let maxVotes = 0;
    let leadingOption = '';

    Object.entries(voteCount).forEach(([optionId, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        leadingOption = optionId;
      }
    });

    return leadingOption;
  }

  private formatTimeRemaining(ms: number): string {
    if (ms <= 0) return 'Expired';

    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  private async estimateGroupSize(_groupId: string): Promise<number> {
    // In a real implementation, this would query the group member count
    return 10; // Default estimate
  }
}
