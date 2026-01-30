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

interface TriviaQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  difficulty: 'easy' | 'medium' | 'hard';
  category: 'crypto' | 'lightning' | 'general';
  reward: number;
}

interface ActiveTrivia {
  questionId: string;
  question: TriviaQuestion;
  startTime: number;
  attempts: number;
  hintUsed: boolean;
}

const QUESTIONS: TriviaQuestion[] = [
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
  {
    id: 'gk1',
    question: 'What is the capital of El Salvador (first country to adopt Bitcoin)?',
    options: ['San Jose', 'San Salvador', 'San Pedro', 'Santa Ana'],
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

@Injectable()
export class TriviaPlugin implements PluginPort {
  readonly id = PluginId.Trivia;
  readonly name = 'Trivia Games';
  readonly description = 'Test your knowledge and earn sats!';

  private activeTrivias = new Map<string, ActiveTrivia>();
  private answeredQuestions = new Map<string, string[]>();
  private userStats = new Map<
    string,
    { correct: number; total: number; totalEarned: number; score: number }
  >();

  constructor(@Inject(SESSION_PORT) private readonly session: SessionPort) {}

  getRecognizers(): PluginRecognizer[] {
    return [
      {
        pluginId: this.id,
        action: 'start',
        patterns: [
          /^trivia$/i,
          /^quiz$/i,
          /^trivia\s+\w+/i,
          /play\s+trivia/i,
          /start\s+quiz/i,
          /test my knowledge/i,
        ],
        keywords: ['trivia', 'quiz'],
      },
      {
        pluginId: this.id,
        action: 'answer',
        patterns: [/^answer\s+[1-4abcd]/i, /^a\s+[1-4abcd]/i],
        keywords: [],
      },
      { pluginId: this.id, action: 'hint', patterns: [/^hint$/i, /give me a hint/i], keywords: [] },
      {
        pluginId: this.id,
        action: 'leaderboard',
        patterns: [/^leaderboard$/i, /^top$/i, /trivia ranking/i, /top players/i],
        keywords: ['leaderboard'],
      },
    ];
  }

  async execute(action: string, ctx: CommandContext): Promise<HandlerResult> {
    switch (action) {
      case 'start':
        return this.startTrivia(ctx);
      case 'answer':
        return this.handleAnswer(ctx);
      case 'hint':
        return this.handleHint(ctx);
      case 'leaderboard':
        return this.showLeaderboard(ctx);
      default:
        return this.txt('Unknown trivia command.');
    }
  }

  async onLoad(): Promise<void> {
    /* no-op */
  }
  async onUnload(): Promise<void> {
    this.activeTrivias.clear();
  }

  private startTrivia(ctx: CommandContext): HandlerResult {
    const existing = this.activeTrivias.get(ctx.userId);
    if (existing) {
      return this.txt(
        `You already have an active question!\n\n${this.formatQuestion(existing.question)}\n\nType 'hint' for help (-50% reward)`,
      );
    }

    const args = ctx.rawText.toLowerCase();
    let category: TriviaQuestion['category'] | undefined;
    if (args.includes('crypto') || args.includes('bitcoin')) category = 'crypto';
    else if (args.includes('lightning')) category = 'lightning';
    else if (args.includes('general')) category = 'general';

    let available = QUESTIONS;
    if (category) available = available.filter((q) => q.category === category);

    const answered = this.answeredQuestions.get(ctx.userId) ?? [];
    available = available.filter((q) => !answered.includes(q.id));

    if (available.length === 0) {
      return this.txt(
        "Amazing! You've answered all available questions! Try a different category or wait for new questions.",
      );
    }

    const question = available[Math.floor(Math.random() * available.length)];
    this.activeTrivias.set(ctx.userId, {
      questionId: question.id,
      question,
      startTime: Date.now(),
      attempts: 0,
      hintUsed: false,
    });

    return this.txt(
      `Trivia Time!\n\n${this.formatQuestion(question)}\n\nYou have 5 minutes to answer.\nReward: ${question.reward} sats`,
    );
  }

  private handleAnswer(ctx: CommandContext): HandlerResult {
    const active = this.activeTrivias.get(ctx.userId);
    if (!active) {
      return this.txt("You don't have an active trivia question! Type 'trivia' to start.");
    }

    const parts = ctx.rawText.trim().split(/\s+/);
    const answerText = parts.length > 1 ? parts[parts.length - 1] : parts[0];

    let answerIndex: number;
    if (/^[1-4]$/.test(answerText)) {
      answerIndex = parseInt(answerText) - 1;
    } else if (/^[abcd]$/i.test(answerText)) {
      answerIndex = answerText.toLowerCase().charCodeAt(0) - 97;
    } else {
      return this.txt('Invalid answer format! Please answer with a number (1-4) or letter (a-d).');
    }

    active.attempts++;
    const isCorrect = answerIndex === active.question.correctAnswer;

    if (isCorrect) {
      const baseReward = active.question.reward;
      const actualReward = active.hintUsed ? Math.floor(baseReward / 2) : baseReward;
      const timeTaken = Math.floor((Date.now() - active.startTime) / 1000);

      const answered = this.answeredQuestions.get(ctx.userId) ?? [];
      answered.push(active.questionId);
      this.answeredQuestions.set(ctx.userId, answered);

      this.updateStats(ctx.userId, true, actualReward);
      this.activeTrivias.delete(ctx.userId);

      return this.txt(
        `Correct!\n\nYou earned ${actualReward} sats!\nTime: ${timeTaken} seconds${active.attempts > 1 ? `\nAttempts: ${active.attempts}` : ''}\n\nType 'trivia' for another question!`,
      );
    }

    if (active.attempts >= 3) {
      const correctOption = active.question.options[active.question.correctAnswer];
      this.updateStats(ctx.userId, false, 0);
      this.activeTrivias.delete(ctx.userId);
      return this.txt(
        `Game Over!\n\nThe correct answer was: ${correctOption}\n\nType 'trivia' to try again.`,
      );
    }

    return this.txt(
      `Wrong answer! ${3 - active.attempts} attempts remaining.\n\n${this.formatQuestion(active.question)}\n\nType 'hint' for help (-50% reward)`,
    );
  }

  private handleHint(ctx: CommandContext): HandlerResult {
    const active = this.activeTrivias.get(ctx.userId);
    if (!active) {
      return this.txt("You don't have an active trivia question!");
    }

    if (active.hintUsed) {
      return this.txt(
        `You already used your hint! Reward will be ${Math.floor(active.question.reward / 2)} sats.`,
      );
    }

    active.hintUsed = true;

    const correctAnswer = active.question.correctAnswer;
    const wrongIndices = active.question.options
      .map((_, i) => i)
      .filter((i) => i !== correctAnswer)
      .sort(() => 0.5 - Math.random())
      .slice(0, 2);

    const eliminated = wrongIndices
      .map((idx) => `  ${String.fromCharCode(97 + idx)}. ${active.question.options[idx]}`)
      .join('\n');

    return this.txt(
      `Hint Used! (Reward reduced to ${Math.floor(active.question.reward / 2)} sats)\n\nEliminated 2 wrong answers:\n${eliminated}`,
    );
  }

  private showLeaderboard(_ctx: CommandContext): HandlerResult {
    const entries = Array.from(this.userStats.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 5);

    if (entries.length === 0) {
      return this.txt('Trivia Leaderboard\n\nNo players yet! Be the first to play and earn sats!');
    }

    const lines = entries.map(([userId, stats], i) => {
      const medal = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`;
      const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      return `${medal} ${userId} - Score: ${stats.score} | ${stats.totalEarned} sats | ${stats.correct}/${stats.total} (${accuracy}%)`;
    });

    return this.txt(`Trivia Leaderboard (Top 5)\n\n${lines.join('\n')}`);
  }

  private formatQuestion(q: TriviaQuestion): string {
    const options = q.options.map((o, i) => `${String.fromCharCode(97 + i)}. ${o}`).join('\n');
    return `${q.question}\n\n${options}`;
  }

  private updateStats(userId: string, correct: boolean, reward: number): void {
    const stats = this.userStats.get(userId) ?? { correct: 0, total: 0, totalEarned: 0, score: 0 };
    stats.total++;
    if (correct) {
      stats.correct++;
      stats.totalEarned += reward;
      stats.score = stats.correct * 10 + stats.totalEarned;
    }
    this.userStats.set(userId, stats);
  }

  private txt(value: string): HandlerResult {
    const text: FormattedText = [{ type: 'text', value }];
    return { text };
  }
}
