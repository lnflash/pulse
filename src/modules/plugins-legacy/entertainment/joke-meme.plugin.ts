import { Injectable } from '@nestjs/common';
import {
  BasePlugin,
  CommandDefinition,
  ParsedCommand,
  CommandContext,
  PluginResponse,
} from '../interfaces/plugin.interface';

/**
 * Entertainment plugin providing jokes, memes, and fun content
 */
@Injectable()
export class JokeMemePlugin extends BasePlugin {
  id = 'joke-meme';
  name = 'Entertainment';
  description = 'Jokes, memes, and fun content to share with friends';
  version = '1.0.0';

  commands: CommandDefinition[] = [
    {
      trigger: 'joke',
      aliases: ['jokes', 'funny'],
      patterns: [
        /tell me a joke/i,
        /make me laugh/i,
        /say something funny/i,
        /got any jokes/i,
        /joke about (.*)/i,
      ],
      description: 'Get a random joke',
      examples: ['joke', 'tell me a joke', 'joke about bitcoin'],
      groupSupported: true,
    },
    {
      trigger: 'meme',
      aliases: ['memes'],
      patterns: [
        /show me a meme/i,
        /send a meme/i,
        /meme about (.*)/i,
        /create a meme/i,
        /make a meme/i,
      ],
      description: 'Get a random meme',
      examples: ['meme', 'show me a meme', 'meme about crypto'],
      groupSupported: true,
    },
    {
      trigger: 'roast',
      patterns: [
        /roast (\w+)/i,
        /burn (\w+)/i,
        /make fun of (\w+)/i,
        /insult (\w+) (?:playfully|jokingly)?/i,
      ],
      description: 'Playfully roast someone (all in good fun!)',
      examples: ['roast @john', 'roast me'],
      groupSupported: true,
    },
    {
      trigger: 'dadjoke',
      aliases: ['dad'],
      patterns: [/dad joke/i, /tell me a dad joke/i],
      description: 'Get a classic dad joke',
      examples: ['dadjoke', 'tell me a dad joke'],
      groupSupported: true,
    },
    {
      trigger: 'fortune',
      aliases: ['lucky', 'wisdom'],
      patterns: [/tell my fortune/i, /fortune cookie/i, /give me wisdom/i, /what.*my fortune/i],
      description: 'Get a fortune cookie message',
      examples: ['fortune', 'tell my fortune'],
      groupSupported: true,
    },
  ];

  // Bitcoin and crypto themed jokes
  private cryptoJokes = [
    "Why won't the government embrace Bitcoin? They hate the idea of Proof Of Work!",
    "I used to hate crypto but then it started to grow on me. Now I'm a big fan of proof-of-stake!",
    "My wife asked me to stop singing 'Wonderwall.' I said maybe... you're gonna be the one that saves me... from this bear market.",
    'Why did the Bitcoin break up with the Dollar? It wanted a relationship with no strings (or banks) attached!',
    "What's a Bitcoin maximalist's favorite type of music? Heavy metal... because they're always talking about digital gold!",
    "Why don't Bitcoin holders ever get invited to parties? Because they always bring up the blockchain!",
    'I told my therapist about my crypto losses. He said I need to learn to let go of my emotional baggage... and my bags.',
    'Why did the crypto trader go to therapy? They had trouble dealing with rejection... especially at resistance levels!',
    'What do you call a Bitcoin holder who sold at $100? A legend... in their own mind!',
    'Why did Satoshi Nakamoto hide their identity? Because they knew everyone would ask them for crypto advice at parties!',
  ];

  // General jokes
  private generalJokes = [
    'I told my wife she was drawing her eyebrows too high. She looked surprised.',
    "Why don't scientists trust atoms? Because they make up everything!",
    'I used to play piano by ear, but now I use my hands.',
    'Why did the scarecrow win an award? He was outstanding in his field!',
    "I'm reading a book about anti-gravity. It's impossible to put down!",
    'What do you call a bear with no teeth? A gummy bear!',
    'Why did the math book look so sad? Because it had too many problems!',
    'I used to hate facial hair, but then it grew on me.',
    "Why don't eggs tell jokes? They'd crack each other up!",
    'What do you call a fake noodle? An impasta!',
  ];

  // Dad jokes
  private dadJokes = [
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

  // Roast templates (playful, not mean)
  private roastTemplates = [
    '{name} is so bad at crypto, they bought high and sold low... on purpose!',
    '{name} is like a Bitcoin transaction during high fees... nobody wants to deal with them!',
    "{name}'s portfolio is like their dating life... full of red flags!",
    '{name} HODLs their jokes like they HODL their crypto... way too long!',
    '{name} is proof that not all assets appreciate over time!',
    '{name} is like a stablecoin... boring but reliable!',
    "{name} checks their portfolio so often, Coinbase sent them a 'concern' notification!",
    '{name} is like my altcoin picks... seemed like a good idea at the time!',
    "{name}'s chat game is like Bitcoin in 2010... full of potential but nobody's interested yet!",
    '{name} is so slow, by the time they finish typing, ETH 2.0 will already be at version 5.0!',
  ];

  // Fortune messages
  private fortunes = [
    "🔮 Your next trade will be profitable... if you do the opposite of what you're thinking!",
    "🥠 A great opportunity awaits you... it's called 'going outside'!",
    '✨ The stars say you will receive unexpected money... probably a $5 Venmo from your mom!',
    "🌟 Your patience will be rewarded... especially if you're waiting for Bitcoin to hit $1M!",
    "🎯 Success is just around the corner... unfortunately, you're walking in circles!",
    '💫 Today is your lucky day... to finally read the whitepaper!',
    '🌙 The moon is in your future... whether your portfolio gets there is another question!',
    "⭐ Your persistence will pay off... or you'll just be persistently wrong!",
    "🎰 Lady Luck smiles upon you... she's laughing, actually!",
    '🏆 Victory is within your grasp... just kidding, HODL longer!',
  ];

  async handleCommand(command: ParsedCommand, context: CommandContext): Promise<PluginResponse> {
    const trigger = command.trigger.toLowerCase();

    switch (trigger) {
      case 'joke':
        return this.handleJoke(command, context);
      case 'meme':
        return this.handleMeme(command, context);
      case 'roast':
        return this.handleRoast(command, context);
      case 'dadjoke':
      case 'dad':
        return this.handleDadJoke(context);
      case 'fortune':
      case 'lucky':
      case 'wisdom':
        return this.handleFortune(context);
      default:
        return {
          text: "🤔 I don't understand that entertainment command.",
        };
    }
  }

  private async handleJoke(
    command: ParsedCommand,
    _context: CommandContext,
  ): Promise<PluginResponse> {
    // Check if specific topic requested
    const topic = command.args.join(' ').toLowerCase();
    let joke: string;

    if (topic.includes('bitcoin') || topic.includes('crypto') || topic.includes('btc')) {
      joke = this.getRandomItem(this.cryptoJokes);
    } else {
      // Mix crypto and general jokes
      const allJokes = [...this.cryptoJokes, ...this.generalJokes];
      joke = this.getRandomItem(allJokes);
    }

    return {
      text: `😄 ${joke}`,
      voiceText: joke,
      showTyping: true,
      delay: 500,
      analytics: {
        event: 'joke_requested',
        properties: { topic, type: 'joke' },
      },
    };
  }

  private async handleMeme(
    _command: ParsedCommand,
    _context: CommandContext,
  ): Promise<PluginResponse> {
    try {
      // For now, return a text response about memes
      // In production, this would fetch actual meme images
      const memeTemplates = [
        '🖼️ *Drake Meme*\n❌ Checking portfolio every 5 minutes\n✅ Checking portfolio every 4 minutes',
        '🖼️ *Distracted Boyfriend Meme*\nMe 👀 New shitcoin\nMy portfolio 😢',
        "🖼️ *This is Fine Meme*\n🔥 Portfolio down 90% 🔥\n🐕☕ 'I'm a long-term investor'",
        '🖼️ *Galaxy Brain Meme*\n🧠 Buy high\n🌟 Sell low\n💫 Buy high again\n🌌 This is the way',
        '🖼️ *Expanding Brain Meme*\n🧠 Dollar cost averaging\n🧩 Buying the dip\n🎯 Buying every dip\n🌟 Being the dip',
      ];

      const meme = this.getRandomItem(memeTemplates);

      return {
        text: meme,
        showTyping: true,
        delay: 1000,
        followUp: {
          action: 'suggest_create_actual_meme',
          delay: 3000,
        },
        analytics: {
          event: 'meme_requested',
          properties: { type: 'text_meme' },
        },
      };
    } catch {
      return {
        text: "😅 Couldn't generate a meme right now. Here's a joke instead: Why did the Bitcoin cross the road? To get to the other blockchain!",
      };
    }
  }

  private async handleRoast(
    command: ParsedCommand,
    _context: CommandContext,
  ): Promise<PluginResponse> {
    let target = command.args[0] || 'someone';

    // Handle "roast me"
    if (target.toLowerCase() === 'me') {
      target = 'You';
    }

    // Remove @ symbol if present
    target = target.replace('@', '');

    const roast = this.getRandomItem(this.roastTemplates).replace('{name}', target);

    return {
      text: `🔥 ${roast}\n\n_Just kidding! All in good fun!_ 😄`,
      voiceText: `${roast}... Just kidding!`,
      showTyping: true,
      delay: 1500,
      analytics: {
        event: 'roast_requested',
        properties: { target: target !== 'You' ? 'other' : 'self' },
      },
    };
  }

  private async handleDadJoke(_context: CommandContext): Promise<PluginResponse> {
    const joke = this.getRandomItem(this.dadJokes);

    return {
      text: `👨 ${joke}`,
      voiceText: joke,
      showTyping: true,
      delay: 800,
      analytics: {
        event: 'joke_requested',
        properties: { type: 'dad_joke' },
      },
    };
  }

  private async handleFortune(_context: CommandContext): Promise<PluginResponse> {
    const fortune = this.getRandomItem(this.fortunes);

    return {
      text: fortune,
      voiceText: fortune.replace(/[🔮🥠✨🌟🎯💫🌙⭐🎰🏆]/gu, '').trim(),
      showTyping: true,
      delay: 2000,
      analytics: {
        event: 'fortune_requested',
        properties: {},
      },
    };
  }

  private getRandomItem<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  async getAIContext(_userId: string): Promise<any> {
    return {
      pluginContext:
        'Entertainment plugin providing jokes, memes, and fun content. Keep responses light-hearted and fun.',
      suggestedResponses: [
        'Want to hear another joke?',
        'Try asking for a meme!',
        'I can also roast someone (playfully)!',
      ],
    };
  }
}
