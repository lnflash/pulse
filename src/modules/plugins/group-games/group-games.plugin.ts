import { Injectable, Inject } from '@nestjs/common';
import {
  PluginPort,
  PluginRecognizer,
  CommandContext,
  HandlerResult,
} from '../../../core/ports/plugin.port';
import { SessionPort } from '../../../core/ports/session.port';
import { FormattedText } from '../../../core/types/messages';
import { PluginId } from '../../../core/types/intents';
import { randomBytes } from 'crypto';

interface Poll {
  id: string;
  groupId: string;
  question: string;
  options: string[];
  votes: Record<number, number>;
  voters: Set<string>;
}

interface GroupGame {
  id: string;
  groupId: string;
  type: 'quickdraw' | 'wordchain' | 'numberguess';
  status: 'waiting' | 'active';
  players: Set<string>;
  data: Record<string, unknown>;
  pot: number;
}

@Injectable()
export class GroupGamesPlugin implements PluginPort {
  readonly id = PluginId.GroupGames;
  readonly name = 'Group Games & Polls';
  readonly description = 'Interactive games and polls for groups';

  private activePolls = new Map<string, Poll>();
  private activeGames = new Map<string, GroupGame>();

  constructor(@Inject('SessionPort') private readonly session: SessionPort) {}

  getRecognizers(): PluginRecognizer[] {
    return [
      {
        pluginId: this.id,
        action: 'poll',
        patterns: [/^poll\s+/i, /create poll/i, /start poll/i],
        keywords: ['poll'],
      },
      { pluginId: this.id, action: 'vote', patterns: [/^vote\s+[1-9a-f]/i], keywords: [] },
      {
        pluginId: this.id,
        action: 'results',
        patterns: [/^results$/i, /poll results/i, /show results/i],
        keywords: [],
      },
      {
        pluginId: this.id,
        action: 'game',
        patterns: [/^game\s+\w+/i, /start game/i, /let'?s play/i],
        keywords: [],
      },
      {
        pluginId: this.id,
        action: 'join',
        patterns: [/^join$/i, /join game/i, /i'?m in/i, /count me in/i],
        keywords: [],
      },
      { pluginId: this.id, action: 'guess', patterns: [/^guess\s+\w+/i], keywords: [] },
    ];
  }

  async execute(action: string, ctx: CommandContext): Promise<HandlerResult> {
    if (!ctx.isGroup) return this.txt('This feature is only available in group chats!');

    switch (action) {
      case 'poll':
        return this.createPoll(ctx);
      case 'vote':
        return this.handleVote(ctx);
      case 'results':
        return this.showResults(ctx);
      case 'game':
        return this.startGame(ctx);
      case 'join':
        return this.joinGame(ctx);
      case 'guess':
        return this.handleGuess(ctx);
      default:
        return this.txt('Unknown group command.');
    }
  }

  async onLoad(): Promise<void> {
    /* no-op */
  }
  async onUnload(): Promise<void> {
    this.activePolls.clear();
    this.activeGames.clear();
  }

  private createPoll(ctx: CommandContext): HandlerResult {
    const pollText = ctx.rawText.replace(/^poll:?\s*/i, '');
    const parts = pollText
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length < 3) {
      return this.txt(
        'Please provide a question and at least 2 options!\n\nFormat: poll Question | Option 1 | Option 2',
      );
    }

    if (this.activePolls.has(ctx.groupId!)) {
      return this.txt("There's already an active poll! Use 'results' to see it.");
    }

    const question = parts[0];
    const options = parts.slice(1, 10);
    const votes: Record<number, number> = {};
    options.forEach((_, i) => {
      votes[i] = 0;
    });

    this.activePolls.set(ctx.groupId!, {
      id: randomBytes(4).toString('hex'),
      groupId: ctx.groupId!,
      question,
      options,
      votes,
      voters: new Set(),
    });

    const optionList = options.map((o, i) => `${i + 1}. ${o}`).join('\n');
    return this.txt(
      `New Poll\n\n${question}\n\n${optionList}\n\nVote with numbers (1-${options.length})`,
    );
  }

  private handleVote(ctx: CommandContext): HandlerResult {
    const poll = this.activePolls.get(ctx.groupId!);
    if (!poll) return this.txt('No active poll!');
    if (poll.voters.has(ctx.userId)) return this.txt("You've already voted!");

    const voteText = ctx.rawText.replace(/^vote\s*/i, '').trim();
    let voteIndex: number;

    if (/^[1-9]$/.test(voteText)) voteIndex = parseInt(voteText) - 1;
    else if (/^[a-i]$/i.test(voteText)) voteIndex = voteText.toLowerCase().charCodeAt(0) - 97;
    else return this.txt('Invalid vote! Use a number or letter.');

    if (voteIndex < 0 || voteIndex >= poll.options.length) {
      return this.txt(`Invalid option! Choose 1-${poll.options.length}`);
    }

    poll.votes[voteIndex] = (poll.votes[voteIndex] || 0) + 1;
    poll.voters.add(ctx.userId);

    const totalVotes = Object.values(poll.votes).reduce((s, c) => s + c, 0);
    const results = poll.options
      .map((o, i) => {
        const v = poll.votes[i] || 0;
        const pct = totalVotes > 0 ? Math.round((v / totalVotes) * 100) : 0;
        return `${o}: ${v} votes (${pct}%)`;
      })
      .join('\n');

    return this.txt(
      `Vote recorded!\n\nCurrent Results\n${poll.question}\n\n${results}\n\nTotal votes: ${totalVotes}`,
    );
  }

  private showResults(ctx: CommandContext): HandlerResult {
    const poll = this.activePolls.get(ctx.groupId!);
    if (!poll) return this.txt('No active poll!');

    const totalVotes = Object.values(poll.votes).reduce((s, c) => s + c, 0);
    const results = poll.options
      .map((o, i) => {
        const v = poll.votes[i] || 0;
        const pct = totalVotes > 0 ? Math.round((v / totalVotes) * 100) : 0;
        const bar =
          '\u2593'.repeat(Math.round(pct / 10)) + '\u2591'.repeat(10 - Math.round(pct / 10));
        return `${o}\n${bar} ${v} votes (${pct}%)`;
      })
      .join('\n\n');

    return this.txt(`Poll Results\n${poll.question}\n\n${results}\n\nTotal votes: ${totalVotes}`);
  }

  private startGame(ctx: CommandContext): HandlerResult {
    if (this.activeGames.has(ctx.groupId!)) {
      return this.txt("There's already an active game! Type 'join' to participate.");
    }

    const gameType =
      ctx.rawText
        .replace(/^game\s*/i, '')
        .trim()
        .toLowerCase() || 'quickdraw';
    let data: Record<string, unknown> = {};
    let intro = '';

    switch (gameType) {
      case 'quickdraw':
      case 'quick':
        data = {
          words: ['bitcoin', 'lightning', 'satoshi', 'wallet', 'blockchain'].sort(
            () => 0.5 - Math.random(),
          ),
          currentWordIndex: 0,
        };
        intro = "Quick Draw!\n\nI'll say a word, first to type it wins!";
        break;
      case 'wordchain':
      case 'chain':
        data = { chain: ['bitcoin'], lastLetter: 'n', usedWords: ['bitcoin'] };
        intro =
          'Word Chain!\n\nCreate a chain where each word starts with the last letter of the previous word!';
        break;
      case 'guess':
      case 'number':
      case 'numberguess':
        data = { target: Math.floor(Math.random() * 100) + 1, guesses: [] };
        intro = "Number Guess!\n\nI'm thinking of a number between 1 and 100. Try to guess it!";
        break;
      default:
        return this.txt('Unknown game type!\n\nAvailable: quickdraw, wordchain, guess');
    }

    this.activeGames.set(ctx.groupId!, {
      id: randomBytes(4).toString('hex'),
      groupId: ctx.groupId!,
      type: (gameType.startsWith('quick')
        ? 'quickdraw'
        : gameType.startsWith('word') || gameType === 'chain'
          ? 'wordchain'
          : 'numberguess') as GroupGame['type'],
      status: 'waiting',
      players: new Set([ctx.userId]),
      data,
      pot: 10,
    });

    return this.txt(`${intro}\n\nPot: 10 sats\nType 'join' to play!`);
  }

  private joinGame(ctx: CommandContext): HandlerResult {
    const game = this.activeGames.get(ctx.groupId!);
    if (!game) return this.txt('No active game to join!');
    if (game.players.has(ctx.userId)) return this.txt("You're already in the game!");
    if (game.status !== 'waiting') return this.txt('Game already started!');

    game.players.add(ctx.userId);
    game.pot += 5;
    return this.txt(`Player joined!\n\n${game.players.size} players\nPot: ${game.pot} sats`);
  }

  private handleGuess(ctx: CommandContext): HandlerResult {
    const game = this.activeGames.get(ctx.groupId!);
    if (!game) return this.txt('No active game!');
    if (game.type !== 'numberguess')
      return this.txt('This command is only for number guessing games!');

    const guess = parseInt(ctx.rawText.replace(/^guess\s*/i, '').trim());
    if (isNaN(guess) || guess < 1 || guess > 100) {
      return this.txt('Please guess a number between 1 and 100!');
    }

    const target = game.data.target as number;
    if (guess === target) {
      this.activeGames.delete(ctx.groupId!);
      return this.txt(`WINNER! The number was ${target}!\n\nYou win ${game.pot} sats!`);
    }

    const hint = guess < target ? 'higher' : 'lower';
    return this.txt(`${guess} is not correct. Try ${hint}!`);
  }

  private txt(value: string): HandlerResult {
    const text: FormattedText = [{ type: 'text', value }];
    return { text };
  }
}
