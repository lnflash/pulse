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

interface DailyChallenge {
  id: string;
  date: string;
  type: 'trivia' | 'puzzle' | 'task' | 'social';
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  baseReward: number;
  bonusMultiplier: number;
  requirements?: {
    answer?: string;
    questionsToAnswer?: number;
    shares?: number;
    category?: string;
  };
}

interface UserStreak {
  currentStreak: number;
  longestStreak: number;
  lastCompleted: string;
  totalCompleted: number;
  totalEarned: number;
}

@Injectable()
export class DailyChallengePlugin implements PluginPort {
  readonly id = PluginId.DailyChallenge;
  readonly name = 'Daily Challenges';
  readonly description = 'Complete daily challenges to earn sats and build streaks!';

  private streaks = new Map<string, UserStreak>();
  private completedToday = new Set<string>();
  private startedToday = new Set<string>();

  constructor(@Inject(SESSION_PORT) private readonly session: SessionPort) {}

  getRecognizers(): PluginRecognizer[] {
    return [
      {
        pluginId: this.id,
        action: 'daily',
        patterns: [
          /^daily$/i,
          /^challenge$/i,
          /^dailychallenge$/i,
          /daily\s*challenge/i,
          /today'?s challenge/i,
        ],
        keywords: ['daily', 'challenge'],
      },
      {
        pluginId: this.id,
        action: 'streak',
        patterns: [/^streak$/i, /my streak/i, /check streak/i],
        keywords: ['streak'],
      },
      {
        pluginId: this.id,
        action: 'complete',
        patterns: [/^complete\b/i, /complete challenge/i, /finish daily/i],
        keywords: [],
      },
    ];
  }

  async execute(action: string, ctx: CommandContext): Promise<HandlerResult> {
    switch (action) {
      case 'daily':
        return this.handleDaily(ctx);
      case 'streak':
        return this.handleStreak(ctx);
      case 'complete':
        return this.handleComplete(ctx);
      default:
        return this.txt('Unknown daily challenge command.');
    }
  }

  async onLoad(): Promise<void> {
    /* no-op */
  }
  async onUnload(): Promise<void> {
    this.completedToday.clear();
    this.startedToday.clear();
  }

  private handleDaily(ctx: CommandContext): HandlerResult {
    const today = this.getTodayDate();
    const challenge = this.generateChallenge(today);
    const key = `${ctx.userId}:${today}`;

    if (this.completedToday.has(key)) {
      const streak = this.getStreak(ctx.userId);
      return this.txt(
        `You've already completed today's challenge!\n\nCurrent streak: ${streak.currentStreak} days\nCome back tomorrow for a new challenge!`,
      );
    }

    const args = ctx.rawText.toLowerCase();
    if (args.includes('start') || args.includes('begin')) {
      this.startedToday.add(key);
      return this.txt(
        `Challenge Started!\n\n${challenge.title}\n${challenge.description}\n\nType 'complete' (or 'complete [answer]' for puzzles) when done!`,
      );
    }

    const streak = this.getStreak(ctx.userId);
    const reward = this.calculateReward(
      challenge.baseReward,
      streak.currentStreak,
      challenge.bonusMultiplier,
    );

    let text = `Daily Challenge - ${today}\n\n`;
    text += `${challenge.title}\n${challenge.description}\n\n`;
    text += `Difficulty: ${challenge.difficulty}\n`;
    text += `Base Reward: ${challenge.baseReward} sats\n`;
    if (streak.currentStreak > 0) {
      text += `Streak Bonus: x${(1 + streak.currentStreak * 0.1).toFixed(1)}\nTotal Reward: ${reward} sats\n`;
    }
    text += `\nType 'daily start' to begin!`;

    return this.txt(text);
  }

  private handleStreak(ctx: CommandContext): HandlerResult {
    const streak = this.getStreak(ctx.userId);
    let text = `Your Challenge Stats\n\n`;
    text += `Current Streak: ${streak.currentStreak} days\n`;
    text += `Longest Streak: ${streak.longestStreak} days\n`;
    text += `Total Completed: ${streak.totalCompleted} challenges\n`;
    text += `Total Earned: ${streak.totalEarned} sats`;
    return this.txt(text);
  }

  private handleComplete(ctx: CommandContext): HandlerResult {
    const today = this.getTodayDate();
    const key = `${ctx.userId}:${today}`;

    if (!this.startedToday.has(key)) {
      return this.txt("You haven't started today's challenge yet! Type 'daily start' to begin.");
    }

    if (this.completedToday.has(key)) {
      return this.txt("You've already completed today's challenge!");
    }

    const challenge = this.generateChallenge(today);

    if (challenge.type === 'puzzle' && challenge.requirements?.answer) {
      const answer = ctx.rawText
        .replace(/^complete\s*/i, '')
        .toLowerCase()
        .trim();
      if (answer !== challenge.requirements.answer) {
        return this.txt(`Not quite right. Try again!`);
      }
    }

    this.completedToday.add(key);
    const streak = this.updateStreak(ctx.userId);
    const reward = this.calculateReward(
      challenge.baseReward,
      streak.currentStreak - 1,
      challenge.bonusMultiplier,
    );
    streak.totalEarned += reward;

    return this.txt(
      `Challenge completed!\n\nYou earned ${reward} sats!\nStreak: ${streak.currentStreak} days${streak.currentStreak >= streak.longestStreak ? ' (New record!)' : ''}\n\nCome back tomorrow for a new challenge!`,
    );
  }

  private getStreak(userId: string): UserStreak {
    return (
      this.streaks.get(userId) ?? {
        currentStreak: 0,
        longestStreak: 0,
        lastCompleted: '',
        totalCompleted: 0,
        totalEarned: 0,
      }
    );
  }

  private updateStreak(userId: string): UserStreak {
    const streak = this.getStreak(userId);
    const today = this.getTodayDate();
    const yesterday = this.getYesterdayDate();

    if (streak.lastCompleted === today) return streak;

    streak.currentStreak = streak.lastCompleted === yesterday ? streak.currentStreak + 1 : 1;
    streak.lastCompleted = today;
    streak.totalCompleted++;
    if (streak.currentStreak > streak.longestStreak) streak.longestStreak = streak.currentStreak;

    this.streaks.set(userId, streak);
    return streak;
  }

  private calculateReward(base: number, streakDays: number, multiplier: number): number {
    return Math.floor(base * (1 + streakDays * 0.1) * multiplier);
  }

  private generateChallenge(date: string): DailyChallenge {
    const hash = date.split('-').reduce((acc, n) => acc + parseInt(n), 0);
    const types: DailyChallenge['type'][] = ['trivia', 'puzzle', 'social', 'task'];
    const type = types[hash % types.length];

    const challenges: Record<string, DailyChallenge> = {
      trivia: {
        id: `dc-${date}`,
        date,
        type: 'trivia',
        title: 'Lightning Speed Quiz',
        description: 'Answer 5 Lightning Network questions correctly',
        difficulty: 'medium',
        baseReward: 50,
        bonusMultiplier: 1.5,
        requirements: { questionsToAnswer: 5, category: 'lightning' },
      },
      puzzle: {
        id: `dc-${date}`,
        date,
        type: 'puzzle',
        title: "Satoshi's Riddle",
        description:
          "Solve today's Bitcoin-themed riddle: I am created every 10 minutes, contain thousands of stories, and am linked to my past forever. What am I?",
        difficulty: 'hard',
        baseReward: 100,
        bonusMultiplier: 2,
        requirements: { answer: 'block' },
      },
      social: {
        id: `dc-${date}`,
        date,
        type: 'social',
        title: 'Spread the Word',
        description: 'Share a Bitcoin fact with at least 3 friends',
        difficulty: 'easy',
        baseReward: 30,
        bonusMultiplier: 1.5,
        requirements: { shares: 3 },
      },
      task: {
        id: `dc-${date}`,
        date,
        type: 'task',
        title: 'Bitcoin Basics',
        description: 'Answer 3 Bitcoin questions correctly',
        difficulty: 'easy',
        baseReward: 30,
        bonusMultiplier: 1.5,
        requirements: { questionsToAnswer: 3, category: 'crypto' },
      },
    };

    return challenges[type];
  }

  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }
  private getYesterdayDate(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }

  private txt(value: string): HandlerResult {
    const text: FormattedText = [{ type: 'text', value }];
    return { text };
  }
}
