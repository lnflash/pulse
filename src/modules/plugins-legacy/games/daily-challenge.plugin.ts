import { Injectable } from '@nestjs/common';
import {
  BasePlugin,
  CommandDefinition,
  ParsedCommand,
  CommandContext,
  PluginResponse,
} from '../interfaces/plugin.interface';
import { RedisService } from '../../redis/redis.service';

interface DailyChallenge {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'trivia' | 'puzzle' | 'task' | 'social';
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  baseReward: number; // base sats reward
  bonusMultiplier: number; // for streaks
  requirements?: any;
  expiresAt: number;
}

interface UserChallengeProgress {
  userId: string;
  challengeId: string;
  startedAt: number;
  completedAt?: number;
  attempts: number;
  score?: number;
}

interface UserStreak {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastCompleted: string; // YYYY-MM-DD
  totalCompleted: number;
}

/**
 * Daily challenges plugin - new challenges every day with streak bonuses
 */
@Injectable()
export class DailyChallengePlugin extends BasePlugin {
  id = 'daily-challenge';
  name = 'Daily Challenges';
  description = 'Complete daily challenges to earn sats and build streaks!';
  version = '1.0.0';

  // Daily challenges - in production these would be generated dynamically
  private challenges: Record<string, DailyChallenge> = {
    '2025-07-11': {
      id: 'dc-2025-07-11',
      date: '2025-07-11',
      type: 'trivia',
      title: 'Lightning Speed Quiz',
      description: 'Answer 5 Lightning Network questions correctly in under 2 minutes',
      difficulty: 'medium',
      baseReward: 50,
      bonusMultiplier: 1.5,
      requirements: {
        questionsToAnswer: 5,
        timeLimit: 120, // seconds
        category: 'lightning',
      },
      expiresAt: new Date('2025-07-12T00:00:00Z').getTime(),
    },
    '2025-07-12': {
      id: 'dc-2025-07-12',
      date: '2025-07-12',
      type: 'social',
      title: 'Spread the Word',
      description: 'Share a Bitcoin fact with at least 3 friends',
      difficulty: 'easy',
      baseReward: 30,
      bonusMultiplier: 1.5,
      requirements: {
        shares: 3,
      },
      expiresAt: new Date('2025-07-13T00:00:00Z').getTime(),
    },
    '2025-07-13': {
      id: 'dc-2025-07-13',
      date: '2025-07-13',
      type: 'puzzle',
      title: "Satoshi's Riddle",
      description: "Solve today's Bitcoin-themed riddle",
      difficulty: 'hard',
      baseReward: 100,
      bonusMultiplier: 2,
      requirements: {
        riddle:
          'I am created every 10 minutes, contain thousands of stories, and am linked to my past forever. What am I?',
        answer: 'block',
      },
      expiresAt: new Date('2025-07-14T00:00:00Z').getTime(),
    },
  };

  commands: CommandDefinition[] = [
    {
      trigger: 'daily',
      aliases: ['challenge', 'dailychallenge'],
      patterns: [/daily\s*(?:challenge)?/i, /today'?s challenge/i, /what'?s the daily/i],
      description: "View today's daily challenge",
      examples: ['daily', 'challenge', 'daily start'],
      requiresAuth: true,
      groupSupported: true,
    },
    {
      trigger: 'streak',
      patterns: [/my streak/i, /check streak/i],
      description: 'Check your challenge streak',
      examples: ['streak'],
      requiresAuth: true,
      groupSupported: true,
    },
    {
      trigger: 'complete',
      patterns: [/complete challenge/i, /finish daily/i],
      description: 'Submit daily challenge completion',
      examples: ['complete', 'complete block'],
      requiresAuth: true,
      groupSupported: false,
    },
  ];

  constructor(private redisService: RedisService) {
    super();
  }

  async handleCommand(command: ParsedCommand, context: CommandContext): Promise<PluginResponse> {
    switch (command.trigger.toLowerCase()) {
      case 'daily':
      case 'challenge':
      case 'dailychallenge':
        return this.handleDailyChallenge(command, context);
      case 'streak':
        return this.handleStreak(context);
      case 'complete':
        return this.handleComplete(command, context);
      default:
        return {
          text: '❓ Unknown daily challenge command',
        };
    }
  }

  private async handleDailyChallenge(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    const today = this.getTodayDate();
    const challenge = this.challenges[today] || this.generateDailyChallenge(today);

    // Check if user has already completed today's challenge
    const progressKey = `daily:progress:${context.userId}:${challenge.id}`;
    const progressStr = await this.redisService.get(progressKey);

    if (progressStr) {
      const progress: UserChallengeProgress = JSON.parse(progressStr);
      if (progress.completedAt) {
        const streak = await this.getUserStreak(context.userId);
        return {
          text: `✅ You've already completed today's challenge!\n\n🔥 Current streak: ${streak.currentStreak} days\n💰 Come back tomorrow for a new challenge!`,
        };
      }
    }

    // Start challenge if requested
    const args = command.args.join(' ').toLowerCase();
    if (args.includes('start') || args.includes('begin')) {
      return this.startChallenge(challenge, context);
    }

    // Show challenge details
    const timeLeft = this.getTimeUntilExpiry(challenge.expiresAt);
    const streak = await this.getUserStreak(context.userId);
    const potentialReward = this.calculateReward(
      challenge.baseReward,
      streak.currentStreak,
      challenge.bonusMultiplier,
    );

    let text = `🎯 *Daily Challenge* - ${this.formatDate(today)}\n\n`;
    text += `📋 *${challenge.title}*\n`;
    text += `${challenge.description}\n\n`;
    text += `💪 Difficulty: ${this.getDifficultyEmoji(challenge.difficulty)} ${challenge.difficulty}\n`;
    text += `💰 Base Reward: ${challenge.baseReward} sats\n`;

    if (streak.currentStreak > 0) {
      text += `🔥 Streak Bonus: x${(1 + streak.currentStreak * 0.1).toFixed(1)}\n`;
      text += `✨ Total Reward: ${potentialReward} sats\n`;
    }

    text += `⏰ Time Left: ${timeLeft}\n\n`;
    text += `Type 'daily start' to begin!`;

    return {
      text,
      showTyping: true,
      delay: 500,
    };
  }

  private async startChallenge(
    challenge: DailyChallenge,
    context: CommandContext,
  ): Promise<PluginResponse> {
    const progressKey = `daily:progress:${context.userId}:${challenge.id}`;

    // Create progress entry
    const progress: UserChallengeProgress = {
      userId: context.userId,
      challengeId: challenge.id,
      startedAt: Date.now(),
      attempts: 0,
    };

    await this.redisService.set(progressKey, JSON.stringify(progress), 86400); // 24 hour expiry

    // Return challenge-specific instructions
    switch (challenge.type) {
      case 'trivia':
        return {
          text: `🚀 *Challenge Started!*\n\n${challenge.description}\n\n⏱️ You have ${challenge.requirements.timeLimit} seconds!\n\nType 'trivia ${challenge.requirements.category}' to begin the Lightning quiz!`,
        };

      case 'puzzle':
        return {
          text: `🧩 *Puzzle Challenge!*\n\n${challenge.requirements.riddle}\n\nType 'complete [your answer]' when you think you know it!`,
        };

      case 'social':
        return {
          text: `🤝 *Social Challenge!*\n\n${challenge.description}\n\nShare this Bitcoin fact:\n💡 "Did you know? The Lightning Network can process millions of transactions per second!"\n\nType 'complete' when you've shared with ${challenge.requirements.shares} friends!`,
        };

      case 'task':
        return {
          text: `📝 *Task Challenge!*\n\n${challenge.description}\n\nComplete the task and type 'complete' when done!`,
        };

      default:
        return {
          text: `🎯 Challenge started! Follow the instructions and type 'complete' when done.`,
        };
    }
  }

  private async handleComplete(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    const today = this.getTodayDate();
    const challenge = this.challenges[today] || this.generateDailyChallenge(today);

    const progressKey = `daily:progress:${context.userId}:${challenge.id}`;
    const progressStr = await this.redisService.get(progressKey);

    if (!progressStr) {
      return {
        text: `❌ You haven't started today's challenge yet!\n\nType 'daily' to see it.`,
      };
    }

    const progress: UserChallengeProgress = JSON.parse(progressStr);

    if (progress.completedAt) {
      return {
        text: `✅ You've already completed today's challenge!`,
      };
    }

    // Check challenge-specific completion
    let completed = false;
    let message = '';

    switch (challenge.type) {
      case 'puzzle': {
        const answer = command.args.join(' ').toLowerCase().trim();
        if (answer === challenge.requirements.answer) {
          completed = true;
          message = '🎉 Correct! You solved the riddle!';
        } else {
          progress.attempts++;
          if (progress.attempts >= 3) {
            message = `❌ Sorry, that's not correct. The answer was "${challenge.requirements.answer}". Try again tomorrow!`;
          } else {
            message = `❌ Not quite right. ${3 - progress.attempts} attempts remaining.`;
          }
        }
        break;
      }

      case 'social':
        // In a real app, we'd verify shares somehow
        completed = true;
        message = '🤝 Great job spreading Bitcoin knowledge!';
        break;

      case 'trivia': {
        // Check if they completed the trivia requirements
        const triviaStatsKey = `trivia:daily:${context.userId}:${today}`;
        const triviaStats = await this.redisService.get(triviaStatsKey);
        if (triviaStats) {
          const stats = JSON.parse(triviaStats);
          if (stats.correct >= challenge.requirements.questionsToAnswer) {
            completed = true;
            message = '🧠 Excellent! You aced the Lightning quiz!';
          }
        }
        break;
      }

      default:
        completed = true;
        message = '✅ Challenge completed!';
    }

    if (completed) {
      progress.completedAt = Date.now();
      await this.redisService.set(progressKey, JSON.stringify(progress), 86400);

      // Update streak
      const streak = await this.updateStreak(context.userId);
      const reward = this.calculateReward(
        challenge.baseReward,
        streak.currentStreak - 1,
        challenge.bonusMultiplier,
      );

      // Track completion
      await this.trackCompletion(context.userId, challenge.id, reward);

      return {
        text: `${message}\n\n💰 You earned ${reward} sats!\n🔥 Streak: ${streak.currentStreak} days${streak.currentStreak > streak.longestStreak - 1 ? ' (New record!)' : ''}\n\nCome back tomorrow for a new challenge!`,
        voiceText: `${message} You earned ${reward} sats and your streak is now ${streak.currentStreak} days!`,
        analytics: {
          event: 'daily_challenge_completed',
          properties: {
            challengeId: challenge.id,
            type: challenge.type,
            reward,
            streak: streak.currentStreak,
          },
        },
      };
    } else {
      await this.redisService.set(progressKey, JSON.stringify(progress), 86400);
      return { text: message };
    }
  }

  private async handleStreak(context: CommandContext): Promise<PluginResponse> {
    const streak = await this.getUserStreak(context.userId);
    const stats = await this.getUserChallengeStats(context.userId);

    let text = `🔥 *Your Challenge Stats*\n\n`;
    text += `📅 Current Streak: ${streak.currentStreak} days\n`;
    text += `🏆 Longest Streak: ${streak.longestStreak} days\n`;
    text += `✅ Total Completed: ${streak.totalCompleted} challenges\n`;
    text += `💰 Total Earned: ${stats.totalEarned} sats\n`;

    if (streak.currentStreak > 0) {
      text += `\n⚡ Keep it up! Don't break your streak!`;
    } else {
      text += `\n💪 Start a new streak today! Type 'daily' to begin.`;
    }

    return {
      text,
      showTyping: true,
      delay: 300,
    };
  }

  private async getUserStreak(userId: string): Promise<UserStreak> {
    const key = `daily:streak:${userId}`;
    const data = await this.redisService.get(key);

    if (!data) {
      return {
        userId,
        currentStreak: 0,
        longestStreak: 0,
        lastCompleted: '',
        totalCompleted: 0,
      };
    }

    return JSON.parse(data);
  }

  private async updateStreak(userId: string): Promise<UserStreak> {
    const streak = await this.getUserStreak(userId);
    const today = this.getTodayDate();
    const yesterday = this.getYesterdayDate();

    if (streak.lastCompleted === today) {
      // Already updated today
      return streak;
    }

    if (streak.lastCompleted === yesterday) {
      // Continuing streak
      streak.currentStreak++;
    } else {
      // Streak broken, start new
      streak.currentStreak = 1;
    }

    streak.lastCompleted = today;
    streak.totalCompleted++;

    if (streak.currentStreak > streak.longestStreak) {
      streak.longestStreak = streak.currentStreak;
    }

    await this.redisService.set(`daily:streak:${userId}`, JSON.stringify(streak));
    return streak;
  }

  private calculateReward(baseReward: number, streakDays: number, bonusMultiplier: number): number {
    // Each day of streak adds 10% bonus
    const streakBonus = 1 + streakDays * 0.1;
    return Math.floor(baseReward * streakBonus * bonusMultiplier);
  }

  private async getUserChallengeStats(userId: string): Promise<any> {
    const key = `daily:stats:${userId}`;
    const data = await this.redisService.get(key);
    return data ? JSON.parse(data) : { totalEarned: 0 };
  }

  private async trackCompletion(
    userId: string,
    challengeId: string,
    reward: number,
  ): Promise<void> {
    const key = `daily:stats:${userId}`;
    const stats = await this.getUserChallengeStats(userId);
    stats.totalEarned = (stats.totalEarned || 0) + reward;
    await this.redisService.set(key, JSON.stringify(stats));
  }

  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  private getYesterdayDate(): string {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }

  private formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  private getTimeUntilExpiry(expiresAt: number): string {
    const now = Date.now();
    const diff = expiresAt - now;

    if (diff <= 0) return 'Expired';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  private getDifficultyEmoji(difficulty: string): string {
    switch (difficulty) {
      case 'easy':
        return '🟢';
      case 'medium':
        return '🟡';
      case 'hard':
        return '🔴';
      default:
        return '⚪';
    }
  }

  private generateDailyChallenge(date: string): DailyChallenge {
    // In production, this would generate unique challenges
    // For now, return a default
    return {
      id: `dc-${date}`,
      date,
      type: 'trivia',
      title: 'Bitcoin Basics',
      description: 'Answer 3 Bitcoin questions correctly',
      difficulty: 'easy',
      baseReward: 30,
      bonusMultiplier: 1.5,
      requirements: {
        questionsToAnswer: 3,
        category: 'crypto',
      },
      expiresAt: new Date(date + 'T23:59:59Z').getTime(),
    };
  }
}
