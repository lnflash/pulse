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

interface DecisionOption {
  id: string;
  text: string;
  pros: string[];
  cons: string[];
}

interface Decision {
  id: string;
  groupId: string;
  createdBy: string;
  title: string;
  options: DecisionOption[];
  votingMethod: 'simple' | 'consensus';
  status: 'open' | 'decided';
  voters: Set<string>;
  votes: Record<string, string>;
  quorum: number;
  threshold: number;
  result?: string;
}

interface ConsensusDiscussion {
  decisionId: string;
  messages: Array<{
    userId: string;
    message: string;
    type: 'comment' | 'concern' | 'support' | 'block';
  }>;
  blockers: string[];
}

@Injectable()
export class DecisionPlugin implements PluginPort {
  readonly id = PluginId.Decision;
  readonly name = 'Group Decision Making';
  readonly description = 'Democratic decision making tools for groups';

  private decisions = new Map<string, Decision>();
  private discussions = new Map<string, ConsensusDiscussion>();

  constructor(@Inject(SESSION_PORT) private readonly session: SessionPort) {}

  getRecognizers(): PluginRecognizer[] {
    return [
      {
        pluginId: this.id,
        action: 'decide',
        patterns: [/^decide\s+.+/i, /^decision\s+.+/i, /make decision\s+.+/i],
        keywords: ['decide', 'decision'],
      },
      { pluginId: this.id, action: 'vote', patterns: [/^vote\s+.+/i], keywords: [] },
      {
        pluginId: this.id,
        action: 'consensus',
        patterns: [/^consensus\s+.+/i, /reach consensus/i],
        keywords: ['consensus'],
      },
      {
        pluginId: this.id,
        action: 'discuss',
        patterns: [/^discuss\s+.+/i, /^comment\s+.+/i],
        keywords: [],
      },
      {
        pluginId: this.id,
        action: 'pros',
        patterns: [/^pros?\s+\w+:?\s+.+/i, /add pro\s+.+/i],
        keywords: [],
      },
      {
        pluginId: this.id,
        action: 'cons',
        patterns: [/^cons?\s+\w+:?\s+.+/i, /add con\s+.+/i],
        keywords: [],
      },
      {
        pluginId: this.id,
        action: 'status',
        patterns: [/^decision-status$/i, /^dstatus$/i, /decision status/i, /show decision/i],
        keywords: [],
      },
    ];
  }

  async execute(action: string, ctx: CommandContext): Promise<HandlerResult> {
    if (!ctx.isGroup)
      return this.txt('Decision making features are only available in group chats!');

    switch (action) {
      case 'decide':
        return this.startDecision(ctx);
      case 'vote':
        return this.handleVote(ctx);
      case 'consensus':
        return this.startConsensus(ctx);
      case 'discuss':
        return this.addDiscussion(ctx);
      case 'pros':
        return this.addProCon(ctx, 'pro');
      case 'cons':
        return this.addProCon(ctx, 'con');
      case 'status':
        return this.showStatus(ctx);
      default:
        return this.txt('Unknown decision command.');
    }
  }

  async onLoad(): Promise<void> {
    /* no-op */
  }
  async onUnload(): Promise<void> {
    this.decisions.clear();
    this.discussions.clear();
  }

  private startDecision(ctx: CommandContext): HandlerResult {
    if (this.decisions.has(ctx.groupId!)) {
      return this.txt('There\'s already an active decision! Use "decision-status" to see it.');
    }

    const decisionText = ctx.rawText.replace(/^(decide|decision)\s+/i, '');
    if (!decisionText) return this.txt('Please provide a decision to make!');

    const parts = decisionText
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean);
    const title = parts[0];
    const options: DecisionOption[] =
      parts.length === 1
        ? [
            { id: 'yes', text: 'Yes', pros: [], cons: [] },
            { id: 'no', text: 'No', pros: [], cons: [] },
          ]
        : parts.slice(1).map((text, i) => ({ id: `option${i + 1}`, text, pros: [], cons: [] }));

    const decision: Decision = {
      id: randomBytes(4).toString('hex'),
      groupId: ctx.groupId!,
      createdBy: ctx.userId,
      title,
      options,
      votingMethod: 'simple',
      status: 'open',
      voters: new Set(),
      votes: {},
      quorum: 5,
      threshold: 50,
    };

    this.decisions.set(ctx.groupId!, decision);

    const optionList = options.map((o, i) => `${i + 1}. ${o.text}`).join('\n');
    return this.txt(
      `New Decision\n\n${title}\n\nOptions:\n${optionList}\n\nVoting method: Simple majority\nQuorum: ${decision.quorum} votes\n\nCommands:\n- vote [option] - Cast your vote\n- pros [option]: [reason]\n- cons [option]: [reason]\n- discuss [comment]`,
    );
  }

  private handleVote(ctx: CommandContext): HandlerResult {
    const decision = this.decisions.get(ctx.groupId!);
    if (!decision) return this.txt('No active decision to vote on!');

    const voteText = ctx.rawText.replace(/^vote\s+/i, '').toLowerCase();
    let selected: DecisionOption | undefined;

    if (voteText === 'yes' || voteText === '1')
      selected = decision.options.find((o) => o.id === 'yes') ?? decision.options[0];
    else if (voteText === 'no' || voteText === '2')
      selected = decision.options.find((o) => o.id === 'no') ?? decision.options[1];
    else {
      const num = parseInt(voteText);
      if (!isNaN(num) && num > 0 && num <= decision.options.length)
        selected = decision.options[num - 1];
      else selected = decision.options.find((o) => o.text.toLowerCase().includes(voteText));
    }

    if (!selected) return this.txt('Invalid vote! Please specify a valid option.');

    decision.votes[ctx.userId] = selected.id;
    decision.voters.add(ctx.userId);

    const voteCount = this.countVotes(decision);
    const totalVotes = decision.voters.size;

    let text = `Vote recorded: ${selected.text}\n\nCurrent Results\n`;
    decision.options.forEach((o) => {
      const count = voteCount[o.id] ?? 0;
      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      text += `${o.text}: ${count} votes (${pct}%)\n`;
    });
    text += `\nTotal votes: ${totalVotes}/${decision.quorum}`;

    if (totalVotes >= decision.quorum) {
      const leading = Object.entries(voteCount).sort((a, b) => b[1] - a[1])[0];
      const pct = (leading[1] / totalVotes) * 100;
      if (pct > decision.threshold) {
        decision.status = 'decided';
        decision.result = leading[0];
        const winner = decision.options.find((o) => o.id === leading[0]);
        text += `\n\nDecision Made!\n${winner?.text} wins with ${Math.round(pct)}% of votes!`;
      }
    }

    return this.txt(text);
  }

  private startConsensus(ctx: CommandContext): HandlerResult {
    const title = ctx.rawText.replace(/^consensus\s+/i, '');
    if (!title) return this.txt('Please provide a topic for consensus!');

    const decision: Decision = {
      id: randomBytes(4).toString('hex'),
      groupId: ctx.groupId!,
      createdBy: ctx.userId,
      title,
      options: [{ id: 'consensus', text: 'Reach Consensus', pros: [], cons: [] }],
      votingMethod: 'consensus',
      status: 'open',
      voters: new Set(),
      votes: {},
      quorum: 3,
      threshold: 100,
    };

    this.decisions.set(ctx.groupId!, decision);
    this.discussions.set(decision.id, { decisionId: decision.id, messages: [], blockers: [] });

    return this.txt(
      `Consensus Decision Process\n\n${title}\n\nThis decision requires consensus.\n\nHow it works:\n- Use "discuss" to share thoughts\n- Use "discuss support" to agree\n- Use "discuss block" to prevent consensus\n- Consensus when no one blocks`,
    );
  }

  private addDiscussion(ctx: CommandContext): HandlerResult {
    const decision = this.decisions.get(ctx.groupId!);
    if (!decision) return this.txt('No active decision to discuss!');

    const message = ctx.rawText.replace(/^(discuss|comment)\s+/i, '');
    if (!message) return this.txt('Please provide a comment!');

    const lower = message.toLowerCase();
    let msgType: 'comment' | 'concern' | 'support' | 'block' = 'comment';
    if (lower.includes('block') || lower.includes('oppose')) msgType = 'block';
    else if (lower.includes('support') || lower.includes('agree')) msgType = 'support';
    else if (lower.includes('concern')) msgType = 'concern';

    if (decision.votingMethod === 'consensus') {
      const discussion = this.discussions.get(decision.id);
      if (discussion) {
        discussion.messages.push({ userId: ctx.userId, message, type: msgType });

        if (msgType === 'block' && !discussion.blockers.includes(ctx.userId)) {
          discussion.blockers.push(ctx.userId);
        } else if (msgType === 'support') {
          discussion.blockers = discussion.blockers.filter((id) => id !== ctx.userId);
        }

        if (msgType === 'block')
          return this.txt(
            `Comment added: ${message}\n\nBlocking consensus. Please explain your concerns.`,
          );
        if (msgType === 'support' && discussion.blockers.length === 0) {
          decision.status = 'decided';
          decision.result = 'consensus';
          return this.txt(
            `Comment added: ${message}\n\nConsensus reached! All participants agree.`,
          );
        }
        if (discussion.blockers.length > 0) {
          return this.txt(
            `Comment added: ${message}\n\n${discussion.blockers.length} participant(s) still have concerns.`,
          );
        }
      }
    }

    return this.txt(`Comment added: ${message}\n\nThe discussion helps inform everyone's vote!`);
  }

  private addProCon(ctx: CommandContext, type: 'pro' | 'con'): HandlerResult {
    const decision = this.decisions.get(ctx.groupId!);
    if (!decision) return this.txt('No active decision!');

    const input = ctx.rawText.replace(/^(pros?|cons?|add\s+(?:pro|con))\s*/i, '');
    const match = input.match(/^([\w\d]+):?\s*(.+)$/);
    if (!match) return this.txt(`Invalid format! Use: ${type} [option]: [reason]`);

    const optionRef = match[1].toLowerCase();
    const reason = match[2];

    const num = parseInt(optionRef);
    let option =
      !isNaN(num) && num > 0 && num <= decision.options.length
        ? decision.options[num - 1]
        : decision.options.find(
            (o) => o.id.toLowerCase() === optionRef || o.text.toLowerCase().includes(optionRef),
          );

    if (!option) return this.txt('Option not found!');

    if (type === 'pro') option.pros.push(reason);
    else option.cons.push(reason);

    return this.txt(`${type.toUpperCase()} added to "${option.text}": ${reason}`);
  }

  private showStatus(ctx: CommandContext): HandlerResult {
    const decision = this.decisions.get(ctx.groupId!);
    if (!decision) return this.txt('No active decision in this group!');

    const voteCount = this.countVotes(decision);
    const totalVotes = decision.voters.size;

    let text = `Decision Status\n\n${decision.title}\n\nOptions:\n`;
    decision.options.forEach((o, i) => {
      const count = voteCount[o.id] ?? 0;
      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      text += `\n${i + 1}. ${o.text} - ${count} votes (${pct}%)`;
      if (o.pros.length) text += `\n   Pros: ${o.pros.join('; ')}`;
      if (o.cons.length) text += `\n   Cons: ${o.cons.join('; ')}`;
    });
    text += `\n\nParticipation: ${totalVotes}/${decision.quorum} votes`;

    if (decision.status === 'decided') {
      const winner = decision.options.find((o) => o.id === decision.result);
      text += `\n\nDecision Made: ${winner?.text}`;
    }

    return this.txt(text);
  }

  private countVotes(decision: Decision): Record<string, number> {
    const count: Record<string, number> = {};
    Object.values(decision.votes).forEach((optId) => {
      count[optId] = (count[optId] ?? 0) + 1;
    });
    return count;
  }

  private txt(value: string): HandlerResult {
    const text: FormattedText = [{ type: 'text', value }];
    return { text };
  }
}
