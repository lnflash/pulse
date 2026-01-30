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

interface Poll {
  id: string;
  groupId: string;
  createdBy: string;
  createdByUsername?: string;
  question: string;
  options: string[];
  votes: Record<string, number>; // option index -> vote count
  voters: Set<string>; // user IDs who voted
  allowMultiple: boolean;
  anonymous: boolean;
  endsAt?: number;
  totalPot?: number; // sats in the pot
  winnerTakesAll?: boolean;
}

interface GroupGame {
  id: string;
  groupId: string;
  type: 'quickdraw' | 'wordchain' | 'numberguess' | 'emoji';
  status: 'waiting' | 'active' | 'completed';
  players: Set<string>;
  currentPlayer?: string;
  data: any; // game-specific data
  pot: number; // sats pot
  createdAt: number;
  endsAt: number;
}

/**
 * Group games and polls plugin for interactive group activities
 */
@Injectable()
export class GroupGamesPlugin extends BasePlugin {
  id = 'group-games';
  name = 'Group Games & Polls';
  description = 'Interactive games and polls for groups';
  version = '1.0.0';

  commands: CommandDefinition[] = [
    // Poll commands
    {
      trigger: 'poll',
      aliases: ['vote'],
      patterns: [/create poll/i, /start poll/i, /make a poll/i, /poll: (.*)/i],
      description: 'Create a poll',
      examples: ['poll What should we eat? | Pizza | Sushi | Tacos', 'poll: Best crypto?'],
      groupSupported: true,
      requiresAuth: false,
    },
    {
      trigger: 'vote',
      patterns: [/vote\s+([1-9]|[a-z])/i, /^([1-9]|[a-z])$/i],
      description: 'Vote in active poll',
      examples: ['vote 1', 'vote a', '2'],
      groupSupported: true,
      requiresAuth: false,
    },
    {
      trigger: 'results',
      patterns: [/poll results/i, /show results/i],
      description: 'Show poll results',
      examples: ['results'],
      groupSupported: true,
    },
    // Game commands
    {
      trigger: 'game',
      patterns: [/start game/i, /play (.*)/i, /let'?s play/i],
      description: 'Start a group game',
      examples: ['game quickdraw', 'game wordchain', 'game guess'],
      groupSupported: true,
      requiresAuth: false,
    },
    {
      trigger: 'join',
      patterns: [/join game/i, /i'?m in/i, /count me in/i],
      description: 'Join an active game',
      examples: ['join'],
      groupSupported: true,
      requiresAuth: false,
    },
    {
      trigger: 'guess',
      patterns: [/guess\s+(\w+)/i],
      description: 'Make a guess in games',
      examples: ['guess 42', 'guess bitcoin'],
      groupSupported: true,
    },
  ];

  constructor(private redisService: RedisService) {
    super();
  }

  async handleCommand(command: ParsedCommand, context: CommandContext): Promise<PluginResponse> {
    // Group-only features
    if (!context.isGroup) {
      return {
        text: '❌ This feature is only available in group chats!',
      };
    }

    switch (command.trigger.toLowerCase()) {
      case 'poll':
        return this.createPoll(command, context);
      case 'vote':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
      case 'a':
      case 'b':
      case 'c':
      case 'd':
      case 'e':
      case 'f':
        return this.handleVote(command, context);
      case 'results':
        return this.showResults(context);
      case 'game':
        return this.startGame(command, context);
      case 'join':
        return this.joinGame(context);
      case 'guess':
        return this.handleGuess(command, context);
      default:
        return {
          text: '❓ Unknown group command',
        };
    }
  }

  // Poll Management
  private async createPoll(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    const pollText = command.args.join(' ') || command.rawText.replace(/^poll:?\s*/i, '');

    if (!pollText) {
      return {
        text: "❌ Please provide a question and options!\n\nExample: poll What's for lunch? | Pizza | Sushi | Tacos",
      };
    }

    // Parse poll format: Question | Option1 | Option2 | ...
    const parts = pollText
      .split('|')
      .map((p) => p.trim())
      .filter((p) => p);

    if (parts.length < 3) {
      return {
        text: '❌ Please provide at least 2 options!\n\nFormat: poll Question | Option 1 | Option 2',
      };
    }

    const question = parts[0];
    const options = parts.slice(1);

    if (options.length > 9) {
      return {
        text: '❌ Maximum 9 options allowed!',
      };
    }

    // Check for existing active poll
    const activePollKey = `poll:active:${context.groupId}`;
    const existingPoll = await this.redisService.get(activePollKey);

    if (existingPoll) {
      return {
        text: "❌ There's already an active poll! Use 'results' to see it.",
      };
    }

    // Create poll
    const pollId = randomBytes(4).toString('hex');
    const poll: Poll = {
      id: pollId,
      groupId: context.groupId!,
      createdBy: context.userId,
      createdByUsername: context.username,
      question,
      options,
      votes: {},
      voters: new Set(),
      allowMultiple: false,
      anonymous: false,
      endsAt: Date.now() + 60 * 60 * 1000, // 1 hour
    };

    // Initialize vote counts
    options.forEach((_, index) => {
      poll.votes[index] = 0;
    });

    // Store poll
    await this.redisService.set(
      activePollKey,
      JSON.stringify({
        ...poll,
        voters: Array.from(poll.voters),
      }),
      3600,
    );

    // Format poll display
    let text = `📊 *New Poll*\n\n❓ ${question}\n\n`;
    options.forEach((option, index) => {
      const number = index + 1;
      text += `${number}️⃣ ${option}\n`;
    });
    text += `\n🗳️ Vote with numbers (1-${options.length}) or letters (a-${String.fromCharCode(97 + options.length - 1)})`;
    text += `\n⏰ Ends in 1 hour`;

    return {
      text,
      showTyping: true,
      delay: 300,
    };
  }

  private async handleVote(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    const activePollKey = `poll:active:${context.groupId}`;
    const pollData = await this.redisService.get(activePollKey);

    if (!pollData) {
      return {
        text: "❌ No active poll! Create one with 'poll Question | Option1 | Option2'",
      };
    }

    const poll = JSON.parse(pollData);
    poll.voters = new Set(poll.voters);

    // Check if already voted
    if (poll.voters.has(context.userId)) {
      return {
        text: "❌ You've already voted!",
      };
    }

    // Parse vote
    let voteIndex: number;
    const voteText = command.trigger === 'vote' ? command.args[0] : command.trigger;

    if (/^[1-9]$/.test(voteText)) {
      voteIndex = parseInt(voteText) - 1;
    } else if (/^[a-i]$/i.test(voteText)) {
      voteIndex = voteText.toLowerCase().charCodeAt(0) - 97;
    } else {
      return {
        text: '❌ Invalid vote! Use a number or letter.',
      };
    }

    if (voteIndex < 0 || voteIndex >= poll.options.length) {
      return {
        text: `❌ Invalid option! Choose 1-${poll.options.length}`,
      };
    }

    // Record vote
    poll.votes[voteIndex] = (poll.votes[voteIndex] || 0) + 1;
    poll.voters.add(context.userId);

    // Update poll
    await this.redisService.set(
      activePollKey,
      JSON.stringify({
        ...poll,
        voters: Array.from(poll.voters),
      }),
      3600,
    );

    // Show updated results
    const voteValues = Object.values(poll.votes) as number[];
    const totalVotes = voteValues.reduce((sum, count) => sum + count, 0);

    let text = `✅ Vote recorded!\n\n📊 *Current Results*\n❓ ${poll.question}\n\n`;
    poll.options.forEach((option: string, index: number) => {
      const votes = poll.votes[index] || 0;
      const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
      const bar = this.createProgressBar(percentage);
      text += `${option}\n${bar} ${votes} votes (${percentage}%)\n\n`;
    });
    text += `👥 Total votes: ${totalVotes}`;

    return {
      text,
      showTyping: true,
      delay: 200,
    };
  }

  private async showResults(context: CommandContext): Promise<PluginResponse> {
    const activePollKey = `poll:active:${context.groupId}`;
    const pollData = await this.redisService.get(activePollKey);

    if (!pollData) {
      return {
        text: '❌ No active poll!',
      };
    }

    const poll = JSON.parse(pollData);
    const voteValues = Object.values(poll.votes) as number[];
    const totalVotes = voteValues.reduce((sum, count) => sum + count, 0);

    let text = `📊 *Poll Results*\n❓ ${poll.question}\n\n`;

    // Find winner(s)
    let maxVotes = 0;
    let winners: number[] = [];

    poll.options.forEach((option: string, index: number) => {
      const votes = poll.votes[index] || 0;
      if (votes > maxVotes) {
        maxVotes = votes;
        winners = [index];
      } else if (votes === maxVotes && votes > 0) {
        winners.push(index);
      }

      const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
      const bar = this.createProgressBar(percentage);
      const isWinner = winners.includes(index) && votes > 0;

      text += `${isWinner ? '🏆 ' : ''}${option}\n${bar} ${votes} votes (${percentage}%)\n\n`;
    });

    text += `👥 Total votes: ${totalVotes}`;

    if (poll.createdByUsername) {
      text += `\n👤 Created by @${poll.createdByUsername}`;
    }

    return {
      text,
      showTyping: true,
      delay: 200,
    };
  }

  // Group Games
  private async startGame(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    const gameType = command.args[0]?.toLowerCase() || 'quickdraw';

    // Check for existing game
    const activeGameKey = `game:active:${context.groupId}`;
    const existingGame = await this.redisService.get(activeGameKey);

    if (existingGame) {
      return {
        text: "❌ There's already an active game! Type 'join' to participate.",
      };
    }

    let game: GroupGame;
    let introText = '';

    switch (gameType) {
      case 'quickdraw':
      case 'quick':
        game = this.createQuickDrawGame(context);
        introText = "🏃 *Quick Draw!*\n\nI'll say a word, first to type it wins!\n\n";
        break;

      case 'wordchain':
      case 'chain':
        game = this.createWordChainGame(context);
        introText =
          '🔗 *Word Chain!*\n\nCreate a chain where each word starts with the last letter of the previous word!\n\n';
        break;

      case 'guess':
      case 'number':
      case 'numberguess':
        game = this.createNumberGuessGame(context);
        introText =
          "🔢 *Number Guess!*\n\nI'm thinking of a number between 1 and 100. Try to guess it!\n\n";
        break;

      default:
        return {
          text: '❌ Unknown game type!\n\nAvailable games:\n• quickdraw - Type fastest\n• wordchain - Word connections\n• guess - Number guessing',
        };
    }

    // Store game
    await this.redisService.set(
      activeGameKey,
      JSON.stringify({
        ...game,
        players: Array.from(game.players),
      }),
      600,
    ); // 10 minute expiry

    return {
      text: `${introText}💰 Pot: ${game.pot} sats\n👥 Type 'join' to play!\n⏰ Starting in 30 seconds...`,
      showTyping: true,
      delay: 500,
    };
  }

  private createQuickDrawGame(context: CommandContext): GroupGame {
    const words = [
      'bitcoin',
      'lightning',
      'satoshi',
      'wallet',
      'blockchain',
      'mining',
      'hodl',
      'moon',
      'lambo',
      'whale',
    ];

    return {
      id: randomBytes(4).toString('hex'),
      groupId: context.groupId!,
      type: 'quickdraw',
      status: 'waiting',
      players: new Set([context.userId]),
      data: {
        words: words.sort(() => 0.5 - Math.random()).slice(0, 5),
        currentWordIndex: 0,
        scores: {},
      },
      pot: 10, // Starting pot
      createdAt: Date.now(),
      endsAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    };
  }

  private createWordChainGame(context: CommandContext): GroupGame {
    const startWords = ['bitcoin', 'flash', 'pulse', 'lightning', 'crypto'];
    const startWord = startWords[Math.floor(Math.random() * startWords.length)];

    return {
      id: randomBytes(4).toString('hex'),
      groupId: context.groupId!,
      type: 'wordchain',
      status: 'waiting',
      players: new Set([context.userId]),
      currentPlayer: context.userId,
      data: {
        chain: [startWord],
        usedWords: new Set([startWord]),
        lastLetter: startWord[startWord.length - 1],
        turnOrder: [context.userId],
        currentTurnIndex: 0,
      },
      pot: 10,
      createdAt: Date.now(),
      endsAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    };
  }

  private createNumberGuessGame(context: CommandContext): GroupGame {
    const target = Math.floor(Math.random() * 100) + 1;

    return {
      id: randomBytes(4).toString('hex'),
      groupId: context.groupId!,
      type: 'numberguess',
      status: 'waiting',
      players: new Set([context.userId]),
      data: {
        target,
        guesses: [],
        hints: [],
      },
      pot: 20,
      createdAt: Date.now(),
      endsAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    };
  }

  private async joinGame(context: CommandContext): Promise<PluginResponse> {
    const activeGameKey = `game:active:${context.groupId}`;
    const gameData = await this.redisService.get(activeGameKey);

    if (!gameData) {
      return {
        text: '❌ No active game to join!',
      };
    }

    const game = JSON.parse(gameData);
    game.players = new Set(game.players);

    if (game.players.has(context.userId)) {
      return {
        text: "✅ You're already in the game!",
      };
    }

    if (game.status !== 'waiting') {
      return {
        text: '❌ Game already started!',
      };
    }

    // Add player
    game.players.add(context.userId);
    game.pot += 5; // Entry fee

    // Update turn order for word chain
    if (game.type === 'wordchain') {
      game.data.turnOrder.push(context.userId);
    }

    await this.redisService.set(
      activeGameKey,
      JSON.stringify({
        ...game,
        players: Array.from(game.players),
      }),
      600,
    );

    const playerCount = game.players.size;
    return {
      text: `✅ @${context.username || 'Player'} joined the game!\n\n👥 ${playerCount} players\n💰 Pot: ${game.pot} sats`,
    };
  }

  private async handleGuess(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    const activeGameKey = `game:active:${context.groupId}`;
    const gameData = await this.redisService.get(activeGameKey);

    if (!gameData) {
      return {
        text: '❌ No active game!',
      };
    }

    const game = JSON.parse(gameData);

    if (game.type !== 'numberguess') {
      return {
        text: '❌ This command is only for number guessing games!',
      };
    }

    const guess = parseInt(command.args[0]);
    if (isNaN(guess) || guess < 1 || guess > 100) {
      return {
        text: '❌ Please guess a number between 1 and 100!',
      };
    }

    game.data.guesses.push({ player: context.userId, guess, timestamp: Date.now() });

    if (guess === game.data.target) {
      // Winner!
      await this.redisService.del(activeGameKey);

      return {
        text: `🎉 *WINNER!* @${context.username || 'Player'} guessed ${guess} correctly!\n\n💰 You win ${game.pot} sats!\n\nThe number was ${game.data.target}.`,
        voiceText: `Winner! The number was ${game.data.target}`,
      };
    } else {
      // Give hint
      const hint = guess < game.data.target ? 'higher' : 'lower';
      game.data.hints.push(hint);

      await this.redisService.set(activeGameKey, JSON.stringify(game), 600);

      return {
        text: `❌ ${guess} is not correct. Try ${hint}! 🔍`,
      };
    }
  }

  private createProgressBar(percentage: number): string {
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
  }
}
