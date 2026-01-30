import { Injectable } from '@nestjs/common';
import {
  PluginPort,
  PluginRecognizer,
  CommandContext,
  HandlerResult,
} from '../../../core/ports/plugin.port';
import { FormattedText } from '../../../core/types/messages';
import { PluginId } from '../../../core/types/intents';

const CRYPTO_JOKES = [
  "Why won't the government embrace Bitcoin? They hate the idea of Proof Of Work!",
  "I used to hate crypto but then it started to grow on me. Now I'm a big fan of proof-of-stake!",
  'Why did the Bitcoin break up with the Dollar? It wanted a relationship with no strings (or banks) attached!',
  "What's a Bitcoin maximalist's favorite type of music? Heavy metal... because they're always talking about digital gold!",
  "Why don't Bitcoin holders ever get invited to parties? Because they always bring up the blockchain!",
  'I told my therapist about my crypto losses. He said I need to learn to let go of my emotional baggage... and my bags.',
  'Why did the crypto trader go to therapy? They had trouble dealing with rejection... especially at resistance levels!',
  'What do you call a Bitcoin holder who sold at $100? A legend... in their own mind!',
  'Why did Satoshi Nakamoto hide their identity? Because they knew everyone would ask them for crypto advice at parties!',
];

const GENERAL_JOKES = [
  'I told my wife she was drawing her eyebrows too high. She looked surprised.',
  "Why don't scientists trust atoms? Because they make up everything!",
  'Why did the scarecrow win an award? He was outstanding in his field!',
  "I'm reading a book about anti-gravity. It's impossible to put down!",
  'What do you call a bear with no teeth? A gummy bear!',
  'Why did the math book look so sad? Because it had too many problems!',
  "Why don't eggs tell jokes? They'd crack each other up!",
  'What do you call a fake noodle? An impasta!',
];

const DAD_JOKES = [
  "Hi hungry, I'm Dad!",
  'What do you call a deer with no eyes? No-eye-deer!',
  "I'm afraid for the calendar. Its days are numbered.",
  "What do you call cheese that isn't yours? Nacho cheese!",
  "Why couldn't the bicycle stand up by itself? It was two tired!",
  'What do you call a factory that makes good products? A satisfactory!',
  'Did you hear about the claustrophobic astronaut? He just needed a little space!',
  'Why did the coffee file a police report? It got mugged!',
  'How do you organize a space party? You planet!',
  "What's the best thing about Switzerland? I don't know, but the flag is a big plus!",
];

const ROAST_TEMPLATES = [
  '{name} is so bad at crypto, they bought high and sold low... on purpose!',
  '{name} is like a Bitcoin transaction during high fees... nobody wants to deal with them!',
  "{name}'s portfolio is like their dating life... full of red flags!",
  '{name} HODLs their jokes like they HODL their crypto... way too long!',
  '{name} is proof that not all assets appreciate over time!',
  '{name} is like a stablecoin... boring but reliable!',
  "{name} checks their portfolio so often, Coinbase sent them a 'concern' notification!",
  '{name} is like my altcoin picks... seemed like a good idea at the time!',
];

const FORTUNES = [
  "Your next trade will be profitable... if you do the opposite of what you're thinking!",
  "A great opportunity awaits you... it's called 'going outside'!",
  'The stars say you will receive unexpected money... probably a $5 Venmo from your mom!',
  "Your patience will be rewarded... especially if you're waiting for Bitcoin to hit $1M!",
  "Success is just around the corner... unfortunately, you're walking in circles!",
  'Today is your lucky day... to finally read the whitepaper!',
  'The moon is in your future... whether your portfolio gets there is another question!',
  'Victory is within your grasp... just kidding, HODL longer!',
];

const MEME_TEMPLATES = [
  'Drake Meme\nNo: Checking portfolio every 5 minutes\nYes: Checking portfolio every 4 minutes',
  'Distracted Boyfriend Meme\nMe looking at: New shitcoin\nMy portfolio: sad',
  "This is Fine Meme\nPortfolio down 90%\n'I'm a long-term investor'",
  'Galaxy Brain Meme\nBuy high -> Sell low -> Buy high again -> This is the way',
  'Expanding Brain Meme\nDollar cost averaging -> Buying the dip -> Buying every dip -> Being the dip',
];

@Injectable()
export class EntertainmentPlugin implements PluginPort {
  readonly id = PluginId.Entertainment;
  readonly name = 'Entertainment';
  readonly description = 'Jokes, memes, and fun content to share with friends';

  getRecognizers(): PluginRecognizer[] {
    return [
      {
        pluginId: this.id,
        action: 'joke',
        patterns: [
          /^joke$/i,
          /^jokes?$/i,
          /^funny$/i,
          /tell me a joke/i,
          /make me laugh/i,
          /say something funny/i,
          /joke about .+/i,
        ],
        keywords: ['joke'],
      },
      {
        pluginId: this.id,
        action: 'meme',
        patterns: [/^meme$/i, /^memes?$/i, /show me a meme/i, /send a meme/i, /meme about .+/i],
        keywords: ['meme'],
      },
      {
        pluginId: this.id,
        action: 'roast',
        patterns: [/^roast\s+\w+/i, /burn\s+\w+/i, /make fun of\s+\w+/i],
        keywords: ['roast'],
      },
      {
        pluginId: this.id,
        action: 'dadjoke',
        patterns: [/^dadjoke$/i, /^dad$/i, /dad joke/i, /tell me a dad joke/i],
        keywords: ['dadjoke'],
      },
      {
        pluginId: this.id,
        action: 'fortune',
        patterns: [
          /^fortune$/i,
          /^lucky$/i,
          /^wisdom$/i,
          /tell my fortune/i,
          /fortune cookie/i,
          /give me wisdom/i,
        ],
        keywords: ['fortune'],
      },
    ];
  }

  async execute(action: string, ctx: CommandContext): Promise<HandlerResult> {
    switch (action) {
      case 'joke':
        return this.handleJoke(ctx);
      case 'meme':
        return this.handleMeme();
      case 'roast':
        return this.handleRoast(ctx);
      case 'dadjoke':
        return this.handleDadJoke();
      case 'fortune':
        return this.handleFortune();
      default:
        return this.txt('Unknown entertainment command.');
    }
  }

  async onLoad(): Promise<void> {
    /* no-op */
  }
  async onUnload(): Promise<void> {
    /* no-op */
  }

  private handleJoke(ctx: CommandContext): HandlerResult {
    const topic = ctx.rawText.replace(/^(joke|jokes|funny)\s*/i, '').toLowerCase();
    const pool =
      topic.includes('bitcoin') || topic.includes('crypto')
        ? CRYPTO_JOKES
        : [...CRYPTO_JOKES, ...GENERAL_JOKES];
    return this.txt(this.random(pool));
  }

  private handleMeme(): HandlerResult {
    return this.txt(this.random(MEME_TEMPLATES));
  }

  private handleRoast(ctx: CommandContext): HandlerResult {
    let target =
      ctx.rawText.replace(/^(roast|burn|make fun of)\s+/i, '').replace('@', '') || 'someone';
    if (target.toLowerCase() === 'me') target = 'You';
    const roast = this.random(ROAST_TEMPLATES).replace('{name}', target);
    return this.txt(`${roast}\n\nJust kidding! All in good fun!`);
  }

  private handleDadJoke(): HandlerResult {
    return this.txt(this.random(DAD_JOKES));
  }

  private handleFortune(): HandlerResult {
    return this.txt(this.random(FORTUNES));
  }

  private random<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private txt(value: string): HandlerResult {
    const text: FormattedText = [{ type: 'text', value }];
    return { text };
  }
}
