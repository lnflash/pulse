import { Injectable } from '@nestjs/common';
import {
  BasePlugin,
  CommandDefinition,
  ParsedCommand,
  CommandContext,
  PluginResponse,
} from '../interfaces/plugin.interface';
import { RedisService } from '../../redis/redis.service';
import { PaymentService } from '../../flash-api/services/payment.service';
import { SessionService } from '../../auth/services/session.service';

interface TriviaQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number; // index of correct option
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  reward: number; // sats reward
}

interface ActiveTrivia {
  userId: string;
  questionId: string;
  question: TriviaQuestion;
  startTime: number;
  attempts: number;
  hintUsed: boolean;
}

/**
 * Trivia game plugin with sats rewards
 */
@Injectable()
export class TriviaPlugin extends BasePlugin {
  id = 'trivia';
  name = 'Trivia Games';
  description = 'Test your knowledge and earn sats!';
  version = '1.0.0';

  // Question bank - in production this would be in a database
  private questions: TriviaQuestion[] = [
    // Bitcoin/Crypto category
    {
      id: 'btc1',
      question: 'Who created Bitcoin?',
      options: ['Vitalik Buterin', 'Satoshi Nakamoto', 'Charlie Lee', 'Roger Ver'],
      correctAnswer: 1,
      difficulty: 'easy',
      category: 'crypto',
      reward: 10,
    },
    {
      id: 'btc2',
      question: 'What is the maximum supply of Bitcoin?',
      options: ['21 million', '100 million', '1 billion', 'Unlimited'],
      correctAnswer: 0,
      difficulty: 'easy',
      category: 'crypto',
      reward: 10,
    },
    {
      id: 'btc3',
      question: 'What year was the Bitcoin whitepaper published?',
      options: ['2007', '2008', '2009', '2010'],
      correctAnswer: 1,
      difficulty: 'medium',
      category: 'crypto',
      reward: 20,
    },
    {
      id: 'btc4',
      question: 'What is a "satoshi"?',
      options: [
        'A type of wallet',
        'The smallest unit of Bitcoin',
        'A mining algorithm',
        'A cryptocurrency exchange',
      ],
      correctAnswer: 1,
      difficulty: 'easy',
      category: 'crypto',
      reward: 10,
    },
    {
      id: 'btc5',
      question: 'What does "HODL" originally come from?',
      options: [
        'Hold On for Dear Life',
        'A typo of "hold"',
        'Heavy Order Distribution Level',
        'Hands Off Digital Ledger',
      ],
      correctAnswer: 1,
      difficulty: 'medium',
      category: 'crypto',
      reward: 20,
    },
    // Lightning Network category
    {
      id: 'ln1',
      question: 'What is the Lightning Network?',
      options: [
        'A new cryptocurrency',
        'A Bitcoin Layer 2 scaling solution',
        'A mining pool',
        'An exchange',
      ],
      correctAnswer: 1,
      difficulty: 'easy',
      category: 'lightning',
      reward: 15,
    },
    {
      id: 'ln2',
      question: 'Lightning payments are:',
      options: ['On-chain', 'Off-chain', 'Side-chain', 'Cross-chain'],
      correctAnswer: 1,
      difficulty: 'medium',
      category: 'lightning',
      reward: 20,
    },
    // General knowledge
    {
      id: 'gk1',
      question: 'What is the capital of El Salvador (first country to adopt Bitcoin)?',
      options: ['San José', 'San Salvador', 'San Pedro', 'Santa Ana'],
      correctAnswer: 1,
      difficulty: 'medium',
      category: 'general',
      reward: 15,
    },
    {
      id: 'gk2',
      question: 'Which planet is known as the Red Planet?',
      options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
      correctAnswer: 1,
      difficulty: 'easy',
      category: 'general',
      reward: 10,
    },
    {
      id: 'gk3',
      question: 'What year did World War II end?',
      options: ['1943', '1944', '1945', '1946'],
      correctAnswer: 2,
      difficulty: 'medium',
      category: 'general',
      reward: 15,
    },
  ];

  commands: CommandDefinition[] = [
    {
      trigger: 'trivia',
      aliases: ['quiz'],
      patterns: [/(?:play\s+)?trivia/i, /(?:start\s+)?quiz/i, /test my knowledge/i, /earn sats/i],
      description: 'Start a trivia game',
      examples: ['trivia', 'quiz', 'trivia crypto', 'trivia easy'],
      requiresAuth: true,
      groupSupported: true,
    },
    {
      trigger: 'answer',
      aliases: ['a'],
      patterns: [/answer\s+([1-4abcd])/i, /^([1-4abcd])$/i],
      description: 'Answer a trivia question',
      examples: ['answer 1', 'a 2', 'answer b', '3'],
      requiresAuth: true,
      groupSupported: true,
    },
    {
      trigger: 'hint',
      patterns: [/hint/i, /help me/i, /give me a hint/i],
      description: 'Get a hint (reduces reward by 50%)',
      examples: ['hint'],
      requiresAuth: true,
      groupSupported: true,
    },
    {
      trigger: 'leaderboard',
      aliases: ['top', 'ranking'],
      patterns: [/leaderboard/i, /top players/i, /trivia ranking/i],
      description: 'Show trivia leaderboard',
      examples: ['leaderboard', 'top 10'],
      groupSupported: true,
    },
  ];

  constructor(
    private redisService: RedisService,
    private paymentService: PaymentService,
    private sessionService: SessionService,
  ) {
    super();
  }

  async handleCommand(command: ParsedCommand, context: CommandContext): Promise<PluginResponse> {
    switch (command.trigger.toLowerCase()) {
      case 'trivia':
      case 'quiz':
        return this.startTrivia(command, context);
      case 'answer':
      case 'a':
      case '1':
      case '2':
      case '3':
      case '4':
        return this.handleAnswer(command, context);
      case 'hint':
        return this.handleHint(context);
      case 'leaderboard':
      case 'top':
      case 'ranking':
        return this.showLeaderboard(command, context);
      default:
        return {
          text: '❓ Unknown trivia command',
        };
    }
  }

  private async startTrivia(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    // Check if user already has active trivia
    const activeKey = `trivia:active:${context.userId}`;
    const existing = await this.redisService.get(activeKey);

    if (existing) {
      const active: ActiveTrivia = JSON.parse(existing);
      return {
        text: `⏳ You already have an active question!\n\n${this.formatQuestion(active.question)}\n\n💡 Type 'hint' for help (-50% reward)`,
      };
    }

    // Parse options from command
    const args = command.args.join(' ').toLowerCase();
    let category: string | undefined;
    let difficulty: string | undefined;

    if (args.includes('crypto') || args.includes('bitcoin')) {
      category = 'crypto';
    } else if (args.includes('lightning')) {
      category = 'lightning';
    } else if (args.includes('general')) {
      category = 'general';
    }

    if (args.includes('easy')) {
      difficulty = 'easy';
    } else if (args.includes('medium')) {
      difficulty = 'medium';
    } else if (args.includes('hard')) {
      difficulty = 'hard';
    }

    // Filter questions
    let availableQuestions = this.questions;
    if (category) {
      availableQuestions = availableQuestions.filter((q) => q.category === category);
    }
    if (difficulty) {
      availableQuestions = availableQuestions.filter((q) => q.difficulty === difficulty);
    }

    // Check if user has answered all available questions
    const answeredKey = `trivia:answered:${context.userId}`;
    const answeredStr = await this.redisService.get(answeredKey);
    const answered = answeredStr ? JSON.parse(answeredStr) : [];

    availableQuestions = availableQuestions.filter((q) => !answered.includes(q.id));

    if (availableQuestions.length === 0) {
      return {
        text: `🎉 Amazing! You've answered all ${category ? category : ''} ${difficulty ? difficulty : ''} questions!\n\nTry a different category or difficulty, or wait for new questions to be added.`,
      };
    }

    // Select random question
    const question = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];

    // Create active trivia session
    const activeTrivia: ActiveTrivia = {
      userId: context.userId,
      questionId: question.id,
      question,
      startTime: Date.now(),
      attempts: 0,
      hintUsed: false,
    };

    // Store with 5 minute expiry
    await this.redisService.set(activeKey, JSON.stringify(activeTrivia), 300);

    // Track analytics
    await this.trackEvent('trivia_started', {
      userId: context.userId,
      category: question.category,
      difficulty: question.difficulty,
    });

    return {
      text: `🎯 *Trivia Time!*\n\n${this.formatQuestion(question)}\n\n⏱️ You have 5 minutes to answer\n✨ Reward: ${question.reward} sats`,
      showTyping: true,
      delay: 500,
    };
  }

  private async handleAnswer(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    // Get active trivia
    const activeKey = `trivia:active:${context.userId}`;
    const activeStr = await this.redisService.get(activeKey);

    if (!activeStr) {
      return {
        text: `❌ You don't have an active trivia question!\n\nType 'trivia' to start a new game.`,
      };
    }

    const active: ActiveTrivia = JSON.parse(activeStr);

    // Parse answer
    let answerIndex: number;
    const answerText =
      command.trigger === 'answer' || command.trigger === 'a' ? command.args[0] : command.trigger;

    if (/^[1-4]$/.test(answerText)) {
      answerIndex = parseInt(answerText) - 1;
    } else if (/^[abcd]$/i.test(answerText)) {
      answerIndex = answerText.toLowerCase().charCodeAt(0) - 97;
    } else {
      return {
        text: `❌ Invalid answer format!\n\nPlease answer with a number (1-4) or letter (a-d).`,
      };
    }

    // Check answer
    active.attempts++;
    const isCorrect = answerIndex === active.question.correctAnswer;

    if (isCorrect) {
      // Calculate reward
      const baseReward = active.question.reward;
      const actualReward = active.hintUsed ? Math.floor(baseReward / 2) : baseReward;
      const timeTaken = Math.floor((Date.now() - active.startTime) / 1000);

      // Award sats
      try {
        const session = await this.sessionService.getSessionByWhatsappId(context.userId);
        if (session?.flashAuthToken) {
          // In a real implementation, you'd credit the user's account
          // For now, we'll just track it
          await this.trackReward(context.userId, actualReward);
        }
      } catch (error) {
        console.error('Error awarding trivia reward:', error);
      }

      // Update answered questions
      const answeredKey = `trivia:answered:${context.userId}`;
      const answeredStr = await this.redisService.get(answeredKey);
      const answered = answeredStr ? JSON.parse(answeredStr) : [];
      answered.push(active.questionId);
      await this.redisService.set(answeredKey, JSON.stringify(answered), 86400 * 30); // 30 days

      // Update stats
      await this.updateStats(context.userId, true, actualReward, timeTaken);

      // Clear active trivia
      await this.redisService.del(activeKey);

      // Track event
      await this.trackEvent('trivia_correct', {
        userId: context.userId,
        questionId: active.questionId,
        reward: actualReward,
        timeTaken,
        attempts: active.attempts,
        hintUsed: active.hintUsed,
      });

      return {
        text: `✅ *Correct!*\n\n🎉 You earned ${actualReward} sats!\n⏱️ Time: ${timeTaken} seconds\n${active.attempts > 1 ? `🎯 Attempts: ${active.attempts}\n` : ''}\n\nType 'trivia' for another question!`,
        voiceText: `Correct! You earned ${actualReward} sats!`,
        analytics: {
          event: 'trivia_completed',
          properties: {
            correct: true,
            reward: actualReward,
            category: active.question.category,
          },
        },
      };
    } else {
      // Wrong answer
      if (active.attempts >= 3) {
        // Game over
        const correctOption = active.question.options[active.question.correctAnswer];

        // Update stats
        await this.updateStats(context.userId, false, 0, 0);

        // Clear active trivia
        await this.redisService.del(activeKey);

        return {
          text: `❌ *Game Over!*\n\nThe correct answer was: **${correctOption}**\n\nBetter luck next time! Type 'trivia' to try again.`,
          voiceText: `Wrong! The correct answer was ${correctOption}. Better luck next time!`,
        };
      } else {
        // Update active trivia
        await this.redisService.set(activeKey, JSON.stringify(active), 300);

        return {
          text: `❌ Wrong answer!\n\n${3 - active.attempts} attempts remaining.\n\n${this.formatQuestion(active.question)}\n\n💡 Need help? Type 'hint' (-50% reward)`,
        };
      }
    }
  }

  private async handleHint(context: CommandContext): Promise<PluginResponse> {
    // Get active trivia
    const activeKey = `trivia:active:${context.userId}`;
    const activeStr = await this.redisService.get(activeKey);

    if (!activeStr) {
      return {
        text: `❌ You don't have an active trivia question!`,
      };
    }

    const active: ActiveTrivia = JSON.parse(activeStr);

    if (active.hintUsed) {
      return {
        text: `💡 You already used your hint!\n\nThe reward will be ${Math.floor(active.question.reward / 2)} sats if you answer correctly.`,
      };
    }

    // Mark hint as used
    active.hintUsed = true;
    await this.redisService.set(activeKey, JSON.stringify(active), 300);

    // Generate hint by eliminating 2 wrong answers
    const correctAnswer = active.question.correctAnswer;
    const wrongIndices: number[] = [];
    for (let i = 0; i < active.question.options.length; i++) {
      if (i !== correctAnswer) {
        wrongIndices.push(i);
      }
    }

    // Randomly select 2 wrong answers to eliminate
    const toEliminate = wrongIndices.sort(() => 0.5 - Math.random()).slice(0, 2);

    let hintText = `💡 *Hint Used!* (Reward reduced to ${Math.floor(active.question.reward / 2)} sats)\n\n`;
    hintText += `I've eliminated 2 wrong answers:\n`;
    toEliminate.forEach((idx) => {
      hintText += `❌ ${String.fromCharCode(97 + idx)}. ${active.question.options[idx]}\n`;
    });

    return {
      text: hintText,
      showTyping: true,
      delay: 1000,
    };
  }

  private async showLeaderboard(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    // Get top players
    const limit = command.args[0] === '10' ? 10 : 5;
    const leaderboard = await this.getTopPlayers(limit);

    if (leaderboard.length === 0) {
      return {
        text: `📊 *Trivia Leaderboard*\n\nNo players yet! Be the first to play and earn sats!`,
      };
    }

    let text = `🏆 *Trivia Leaderboard* (Top ${limit})\n\n`;

    leaderboard.forEach((player, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      text += `${medal} @${player.username || 'Anonymous'}\n`;
      text += `   📊 Score: ${player.score} | 💰 ${player.totalEarned} sats\n`;
      text += `   ✅ ${player.correct}/${player.total} (${Math.round(player.accuracy)}%)\n\n`;
    });

    // Show user's rank if not in top
    const userRank = await this.getUserRank(context.userId);
    if (userRank > limit) {
      const userStats = await this.getUserStats(context.userId);
      text += `\n📍 Your rank: #${userRank}\n`;
      if (userStats) {
        text += `   📊 Score: ${userStats.score} | 💰 ${userStats.totalEarned} sats\n`;
      }
    }

    return {
      text,
      showTyping: true,
      delay: 500,
    };
  }

  private formatQuestion(question: TriviaQuestion): string {
    let text = `❓ *${question.question}*\n\n`;
    question.options.forEach((option, index) => {
      const letter = String.fromCharCode(97 + index);
      text += `${letter}. ${option}\n`;
    });
    return text;
  }

  private async trackReward(userId: string, amount: number): Promise<void> {
    const rewardKey = `trivia:rewards:${userId}`;
    const current = await this.redisService.get(rewardKey);
    const total = current ? parseInt(current) + amount : amount;
    await this.redisService.set(rewardKey, total.toString());
  }

  private async updateStats(
    userId: string,
    correct: boolean,
    reward: number,
    timeTaken: number,
  ): Promise<void> {
    const statsKey = `trivia:stats:${userId}`;
    const statsStr = await this.redisService.get(statsKey);
    const stats = statsStr
      ? JSON.parse(statsStr)
      : {
          correct: 0,
          total: 0,
          totalEarned: 0,
          totalTime: 0,
          score: 0,
        };

    stats.total++;
    if (correct) {
      stats.correct++;
      stats.totalTime += timeTaken;
      stats.totalEarned += reward;
      // Score calculation: correct answers * 10 + total earned
      stats.score = stats.correct * 10 + stats.totalEarned;
    }

    await this.redisService.set(statsKey, JSON.stringify(stats));
  }

  private async getTopPlayers(limit: number): Promise<any[]> {
    // In production, this would use Redis sorted sets or a database
    // For now, we'll simulate with a simple implementation
    const players: any[] = [];

    // Get all player stats (simplified for demo)
    // In reality, you'd use Redis SCAN or maintain a sorted set

    return players.slice(0, limit);
  }

  private async getUserRank(_userId: string): Promise<number> {
    // Simplified implementation
    return 1;
  }

  private async getUserStats(userId: string): Promise<any> {
    const statsKey = `trivia:stats:${userId}`;
    const statsStr = await this.redisService.get(statsKey);
    if (!statsStr) return null;

    const stats = JSON.parse(statsStr);
    stats.accuracy = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
    return stats;
  }

  private async trackEvent(event: string, properties: any): Promise<void> {
    // Analytics tracking
    console.log('Trivia event:', event, properties);
  }
}
