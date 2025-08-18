import { Injectable, Logger } from '@nestjs/common';
import { VOICE_SWITCH_PATTERNS } from '../constants/voice-patterns.constants';

export enum CommandType {
  HELP = 'help',
  BALANCE = 'balance',
  LINK = 'link',
  UNLINK = 'unlink',
  VERIFY = 'verify',
  CONSENT = 'consent',
  REFRESH = 'refresh',
  USERNAME = 'username',
  PRICE = 'price',
  SEND = 'send',
  RECEIVE = 'receive',
  HISTORY = 'history',
  REQUEST = 'request',
  CONTACTS = 'contacts',
  PAY = 'pay',
  VYBZ = 'vybz',
  ADMIN = 'admin',
  PENDING = 'pending',
  VOICE = 'voice',
  SETTINGS = 'settings',
  UNDO = 'undo',
  TEMPLATE = 'template',
  SKIP = 'skip',
  LEARN = 'learn',
  UNKNOWN = 'unknown',
}

export interface ParsedCommand {
  type: CommandType;
  args: Record<string, string>;
  rawText: string;
}

export type CommandData = ParsedCommand['args'];

@Injectable()
export class CommandParserService {
  private readonly logger = new Logger(CommandParserService.name);

  private readonly commandPatterns = [
    {
      type: CommandType.HELP,
      pattern: /^help(?:\s+(wallet|send|receive|contacts|pending|voice|games|more|1|2|3))?$/i,
    },
    { type: CommandType.BALANCE, pattern: /^balance|^bal$/i },
    {
      type: CommandType.LINK,
      pattern:
        /^link(?:\s+(group|[A-Z0-9]{6}))?$|^connect(?:\s+(?:to\s+)?(?:flash|me|my\s+account))?$/i,
    },
    { type: CommandType.UNLINK, pattern: /^unlink(?:\s+(confirm))?$/i },
    { type: CommandType.VERIFY, pattern: /^(?:verify|v)\s+(\d{6})$/i },
    { type: CommandType.CONSENT, pattern: /^consent\s+(yes|no)$/i },
    { type: CommandType.REFRESH, pattern: /^refresh$/i },
    { type: CommandType.USERNAME, pattern: /^username(?:\s+(.+))?$/i },
    { type: CommandType.PRICE, pattern: /^price|^rate|^btc$/i },
    {
      type: CommandType.SEND,
      pattern: /^(?:send|sent)\s+(\d*\.?\d+)\s+to\s+(?:@?(\w+)|(\+?\d{10,})|(\w+))(?:\s+(.*))?$/i,
    },
    { type: CommandType.RECEIVE, pattern: /^receive(?:\s+(\d*\.?\d+))?\s*(.*)$/i },
    {
      type: CommandType.HISTORY,
      pattern: /^(?:history|transactions|txs)(?:\s+#?([A-Za-z0-9]+))?$/i,
    },
    {
      type: CommandType.REQUEST,
      pattern: /^request\s+(\d*\.?\d+)\s+from\s+(?:@?(\w+)|(\+?\d{10,}))(?:\s+(.+))?$/i,
    },
    {
      type: CommandType.CONTACTS,
      pattern: /^contacts(?:\s+(add|list|remove|history))?(?:\s+(\w+))?(?:\s+(.+))?$/i,
    },
    { type: CommandType.PAY, pattern: /^pay(?:\s+(confirm|cancel|list|\d+))?(?:\s+(all))?$/i },
    {
      type: CommandType.VYBZ,
      pattern: /^(?:vybz|vybe|vibes|vibe|post|share|drop)(?:\s+(status|check))?$/i,
    },
    {
      type: CommandType.ADMIN,
      pattern:
        /^admin(?:\s+(help|disconnect|reconnect|status|clear-session|settings|lockdown|find|group|add|remove|voice|analytics))?\s*(?:support|admin)?\s*(.*)$/i,
    },
    { type: CommandType.PENDING, pattern: /^pending(?:\s+(sent|received|claim))?(?:\s+(.+))?$/i },
    { type: CommandType.VOICE, pattern: /^voice(?:\s+(.+))?$/i },
    { type: CommandType.SETTINGS, pattern: /^settings?$/i },
    { type: CommandType.UNDO, pattern: /^undo$/i },
    { type: CommandType.TEMPLATE, pattern: /^template(?:\s+(add|remove|list))?(?:\s+(.+))?$/i },
    { type: CommandType.SKIP, pattern: /^skip(?:\s+(?:onboarding|tutorial|intro))?$/i },
    {
      type: CommandType.LEARN,
      pattern: /^learn(?:\s+(category|delete|stats|reset))?(?:\s+(.+))?$/i,
    },
  ];

  /**
   * Parse an incoming message text into a command
   */
  parseCommand(text: string, isVoiceInput = false): ParsedCommand {
    try {
      let trimmedText = text.trim();
      const originalText = trimmedText;

      // Check if this is a 6-digit code (for simplified verification)
      const sixDigitPattern = /^(\d{6})$/;
      const sixDigitMatch = trimmedText.match(sixDigitPattern);
      if (sixDigitMatch) {
        // Convert 6-digit code to verify command
        return {
          type: CommandType.VERIFY,
          args: { otp: sixDigitMatch[1] },
          rawText: originalText,
        };
      }

      // Check for compound voice commands (voice + another command)
      const compoundVoicePattern =
        /^voice\s+(balance|help|price|history|settings|username|contacts|pending)\b/i;
      const compoundMatch = trimmedText.match(compoundVoicePattern);
      if (compoundMatch) {
        // This is a compound command like "voice balance"
        // Strip the "voice" prefix and mark that voice was requested
        trimmedText = trimmedText.replace(/^voice\s+/i, '').trim();
        // Store that this was a voice-requested command
        isVoiceInput = true;
      } else {
        // Check if this is specifically a voice command first
        const voiceCommandPattern = /^voice(\s+|$)/i;
        if (voiceCommandPattern.test(trimmedText)) {
          // Don't strip the prefix for voice commands
          // Let it fall through to be matched by the VOICE command pattern
        } else {
          // Strip voice-related prefixes to allow "speak help", etc.
          const voicePrefixes = /^(audio|speak|say it|tell me)\s+/i;
          const voiceMatch = trimmedText.match(voicePrefixes);
          if (voiceMatch) {
            // Remove the voice prefix but keep track that voice was requested
            trimmedText = trimmedText.replace(voicePrefixes, '').trim();
            isVoiceInput = true;
          }
        }
      }

      // Apply smart command corrections
      trimmedText = this.applyCommandCorrections(trimmedText);

      // Check for voice only patterns before natural language parsing
      const voiceOnlyPatterns = [
        'voice only',
        'voicenote only',
        'voice note only',
        'only voice',
        'only voicenote',
        'only voice note',
        'just voice',
        'just voicenote',
        'just voice note',
        'voice notes only',
        'voicenotes only',
        'just voice notes',
        'just voicenotes',
        'only voice notes',
        'only voicenotes',
      ];

      const lowerTrimmed = trimmedText.toLowerCase();
      // Check exact matches first
      if (voiceOnlyPatterns.includes(lowerTrimmed)) {
        return {
          type: CommandType.VOICE,
          args: { action: 'only' },
          rawText: originalText,
        };
      }

      // Check for patterns with extra words
      const voiceOnlyPhrases = [
        'voice only',
        'voicenote only',
        'voice note only',
        'only voice',
        'only voicenote',
        'only voice note',
        'just voice',
        'just voicenote',
        'just voice note',
        'i want voice only',
        'i want voicenote only',
        'i want voice note only',
        'i want only voice',
        'i want only voicenote',
        'i want only voice note',
        'i want just voice',
        'i want just voicenote',
        'i want just voice note',
      ];

      for (const phrase of voiceOnlyPhrases) {
        if (lowerTrimmed.includes(phrase)) {
          return {
            type: CommandType.VOICE,
            args: { action: 'only' },
            rawText: originalText,
          };
        }
      }

      // Check for simple yes/no that might be consent responses
      // These will be handled by the main service if there's a pending consent
      if (trimmedText === 'yes' || trimmedText === 'no') {
        // Return as UNKNOWN so the main service can check for pending consent
        return {
          type: CommandType.UNKNOWN,
          args: {},
          rawText: originalText,
        };
      }

      // Try natural language patterns first for all inputs (not just voice)
      const naturalCommand = this.parseNaturalLanguage(trimmedText);
      if (naturalCommand.type !== CommandType.UNKNOWN) {
        // Add voice confirmation flag for payment commands from voice
        if (
          isVoiceInput &&
          (naturalCommand.type === CommandType.SEND || naturalCommand.type === CommandType.REQUEST)
        ) {
          naturalCommand.args.requiresConfirmation = 'true';
          naturalCommand.args.isVoiceCommand = 'true';
        }
        // Mark if this was a voice-requested command
        if (isVoiceInput) {
          naturalCommand.args.voiceRequested = 'true';
        }
        return naturalCommand;
      }

      for (const { type, pattern } of this.commandPatterns) {
        const match = trimmedText.match(pattern);

        if (match) {
          const result = this.extractCommand(type, match, trimmedText);

          // Add voice confirmation flag for payment commands from voice
          if (isVoiceInput && (type === CommandType.SEND || type === CommandType.REQUEST)) {
            result.args.requiresConfirmation = 'true';
            result.args.isVoiceCommand = 'true';
          }

          // Mark if this was a voice-requested command (for proper voice response)
          if (isVoiceInput) {
            result.args.voiceRequested = 'true';
          }

          return result;
        }
      }

      // Check for instructional questions before returning unknown
      const instructionalQuestion = this.parseInstructionalQuestion(trimmedText);
      if (instructionalQuestion.type !== CommandType.UNKNOWN) {
        return instructionalQuestion;
      }

      // If no pattern matched, return as unknown command
      return {
        type: CommandType.UNKNOWN,
        args: {},
        rawText: originalText, // Use original text for unknown commands
      };
    } catch (error) {
      this.logger.error(`Error parsing command: ${error.message}`, error.stack);

      // Return as unknown command on error
      return {
        type: CommandType.UNKNOWN,
        args: {},
        rawText: text,
      };
    }
  }

  /**
   * Parse natural language variations for voice commands
   */
  private parseNaturalLanguage(text: string): ParsedCommand {
    const lowerText = text.toLowerCase();

    // Check for instructional questions FIRST before any command patterns
    const instructionalQuestion = this.parseInstructionalQuestion(text);
    if (instructionalQuestion.type !== CommandType.UNKNOWN) {
      return instructionalQuestion;
    }

    // Balance variations
    if (
      lowerText.includes('check my balance') ||
      lowerText.includes('what is my balance') ||
      lowerText.includes('show me my balance') ||
      lowerText.includes('how much do i have') ||
      lowerText.includes('how much money') ||
      lowerText.includes('my wallet balance') ||
      lowerText.includes('i want to know what my balance is') ||
      lowerText.includes('i want to know my balance') ||
      lowerText.includes('tell me my balance') ||
      lowerText.includes("what's my balance") ||
      lowerText.includes('whats my balance') ||
      lowerText.includes('do i have any money') ||
      lowerText.includes('show balance') ||
      lowerText.includes('display balance') ||
      lowerText.includes('account balance') ||
      lowerText.includes('wallet status') ||
      lowerText.includes('how much is in my account') ||
      lowerText.includes('how much is in my wallet') ||
      lowerText.includes('what do i have') ||
      lowerText.includes('how much can i spend') ||
      lowerText.includes('available balance') ||
      lowerText.includes('current balance') ||
      lowerText.includes('flash balance') ||
      lowerText.includes('my funds') ||
      lowerText.includes('check funds') ||
      lowerText.includes('show me how much') ||
      lowerText.includes('let me know my balance') ||
      lowerText.includes('i need to know my balance') ||
      lowerText.includes('can you tell me my balance') ||
      lowerText.includes('please check my balance') ||
      lowerText.includes('balance please') ||
      lowerText.includes('how much money do i have') ||
      lowerText.includes('what is my wallet balance') ||
      lowerText === 'balance' ||
      lowerText === 'bal' ||
      lowerText === 'funds' ||
      lowerText === '$'
    ) {
      return { type: CommandType.BALANCE, args: {}, rawText: text };
    }

    // Price variations
    if (
      lowerText.includes('bitcoin price') ||
      lowerText.includes('btc price') ||
      lowerText.includes('price of bitcoin') ||
      lowerText.includes('how much is bitcoin') ||
      lowerText.includes('what is bitcoin worth') ||
      lowerText.includes('current bitcoin price') ||
      lowerText.includes('check the price') ||
      lowerText.includes('bitcoin rate') ||
      lowerText.includes('btc rate') ||
      lowerText.includes('bitcoin value') ||
      lowerText.includes('btc value') ||
      lowerText.includes('bitcoin cost') ||
      lowerText.includes('btc cost') ||
      lowerText.includes('bitcoin exchange rate') ||
      lowerText.includes('btc exchange rate') ||
      lowerText.includes('show me the price') ||
      lowerText.includes('tell me the price') ||
      lowerText.includes("what's bitcoin at") ||
      lowerText.includes('whats bitcoin at') ||
      lowerText.includes('bitcoin trading at') ||
      lowerText.includes('btc trading at') ||
      lowerText.includes('how expensive is bitcoin') ||
      lowerText.includes('bitcoin market price') ||
      lowerText.includes('btc market price') ||
      lowerText.includes('bitcoin quote') ||
      lowerText.includes('btc quote') ||
      lowerText.includes('price check') ||
      lowerText.includes('rate check') ||
      lowerText.includes('bitcoin ticker') ||
      lowerText.includes('btc ticker') ||
      lowerText.includes('current rate') ||
      lowerText.includes("today's price") ||
      lowerText.includes('todays price') ||
      lowerText.includes('latest price') ||
      lowerText.includes('market rate') ||
      lowerText.includes('exchange price') ||
      lowerText === 'price' ||
      lowerText === 'rate' ||
      lowerText === 'btc' ||
      lowerText === 'bitcoin'
    ) {
      return { type: CommandType.PRICE, args: {}, rawText: text };
    }

    // Help variations
    if (
      lowerText === 'help please' ||
      lowerText === 'please help' ||
      lowerText === 'help me' ||
      lowerText === 'i need help' ||
      lowerText === 'can you help me' ||
      lowerText === 'what can you do' ||
      lowerText === 'show me what you can do' ||
      lowerText.includes('need assistance') ||
      lowerText.includes('need some help') ||
      lowerText.includes('help me out') ||
      lowerText.includes('assist me') ||
      lowerText.includes("i'm confused") ||
      lowerText.includes('im confused') ||
      lowerText.includes("i'm lost") ||
      lowerText.includes('im lost') ||
      lowerText.includes("don't understand") ||
      lowerText.includes('dont understand') ||
      lowerText.includes('how does this work') ||
      lowerText.includes('how do i use this') ||
      lowerText.includes('what are the commands') ||
      lowerText.includes('show commands') ||
      lowerText.includes('list commands') ||
      lowerText.includes('available commands') ||
      lowerText.includes('what can i do') ||
      lowerText.includes('what are my options') ||
      lowerText.includes('show me options') ||
      lowerText.includes('tell me what to do') ||
      lowerText.includes('guide me') ||
      lowerText.includes('instructions') ||
      lowerText.includes('how to use') ||
      lowerText.includes('tutorial') ||
      lowerText.includes('get started') ||
      lowerText.includes('getting started') ||
      lowerText.includes('where do i start') ||
      lowerText.includes('what should i do') ||
      lowerText.includes('menu') ||
      lowerText.includes('main menu') ||
      lowerText.includes('show menu') ||
      lowerText === 'help' ||
      lowerText === 'h' ||
      lowerText === '?' ||
      lowerText === 'info' ||
      lowerText === 'commands' ||
      lowerText === 'options' ||
      lowerText === 'start'
    ) {
      return { type: CommandType.HELP, args: {}, rawText: text };
    }

    // Send variations with natural language
    const sendPatterns = [
      /(?:please\s+)?send\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /(?:please\s+)?send\s+(\w+)\s+(?:dollars?\s+)?to\s+(\w+)/i, // "send one dollar to john"
      /(?:please\s+)?pay\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /(?:please\s+)?pay\s+(\w+)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /transfer\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /give\s+(\w+)\s+(\d+(?:\.\d+)?)\s+(?:dollars?)?/i,
      /give\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /i want to send\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /i need to send\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /i\'d like to send\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /id like to send\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /can i send\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /can you send\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /help me send\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /i want to pay\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /i need to pay\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /i owe\s+(\w+)\s+(\d+(?:\.\d+)?)\s+(?:dollars?)?/i,
      /pay back\s+(\w+)\s+(\d+(?:\.\d+)?)\s+(?:dollars?)?/i,
      /send\s+(\w+)\s+\$(\d+(?:\.\d+)?)/i, // "send john $10"
      /pay\s+(\w+)\s+\$(\d+(?:\.\d+)?)/i, // "pay john $10"
      /zap\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /shoot\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /wire\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /forward\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?for\s+(\w+)/i, // "10 for john"
      /(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i, // "10 to john"
    ];

    for (const pattern of sendPatterns) {
      const match = text.match(pattern);
      if (match) {
        let amount = match[1];
        let recipient = match[2];

        // Handle patterns where order might be reversed
        const patternStr = pattern.toString();
        if (
          patternStr.includes('i owe') ||
          patternStr.includes('pay back') ||
          patternStr.includes('send\\s+(\\w+)\\s+\\$') ||
          patternStr.includes('pay\\s+(\\w+)\\s+\\$')
        ) {
          // For these patterns, recipient comes first
          recipient = match[1];
          amount = match[2];
        }

        // Convert word numbers to digits
        const wordNumbers: Record<string, string> = {
          zero: '0',
          one: '1',
          two: '2',
          three: '3',
          four: '4',
          five: '5',
          six: '6',
          seven: '7',
          eight: '8',
          nine: '9',
          ten: '10',
          eleven: '11',
          twelve: '12',
          thirteen: '13',
          fourteen: '14',
          fifteen: '15',
          sixteen: '16',
          seventeen: '17',
          eighteen: '18',
          nineteen: '19',
          twenty: '20',
          thirty: '30',
          forty: '40',
          fifty: '50',
          sixty: '60',
          seventy: '70',
          eighty: '80',
          ninety: '90',
          hundred: '100',
          thousand: '1000',
          million: '1000000',
          // Common combinations
          'twenty-five': '25',
          twentyfive: '25',
          'fifty-five': '55',
          fiftyfive: '55',
          'a hundred': '100',
          'one hundred': '100',
          'five hundred': '500',
          'a thousand': '1000',
          'one thousand': '1000',
          // Colloquial terms
          buck: '1',
          bucks: '1',
          dollar: '1',
          dollars: '1',
          grand: '1000',
        };

        if (wordNumbers[amount.toLowerCase()]) {
          amount = wordNumbers[amount.toLowerCase()];
        }

        return {
          type: CommandType.SEND,
          args: { amount, recipient },
          rawText: text,
        };
      }
    }

    // Request variations
    const requestPatterns = [
      /(?:please\s+)?request\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?from\s+(\w+)/i,
      /(?:please\s+)?ask\s+(\w+)\s+for\s+(\d+(?:\.\d+)?)\s*(?:dollars?)?/i,
      /(?:can you\s+)?request\s+(\d+(?:\.\d+)?)\s+from\s+(\w+)/i,
      /i want to request\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?from\s+(\w+)/i,
      /i need to request\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?from\s+(\w+)/i,
      /i\'d like to request\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?from\s+(\w+)/i,
      /id like to request\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?from\s+(\w+)/i,
      /can i request\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?from\s+(\w+)/i,
      /help me request\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?from\s+(\w+)/i,
      /(\w+)\s+owes me\s+(\d+(?:\.\d+)?)\s+(?:dollars?)?/i, // "john owes me 10"
      /charge\s+(\w+)\s+(\d+(?:\.\d+)?)\s+(?:dollars?)?/i,
      /bill\s+(\w+)\s+(\d+(?:\.\d+)?)\s+(?:dollars?)?/i,
      /invoice\s+(\w+)\s+for\s+(\d+(?:\.\d+)?)\s+(?:dollars?)?/i,
      /collect\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?from\s+(\w+)/i,
      /get\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?from\s+(\w+)/i,
      /need\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?from\s+(\w+)/i,
      /want\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?from\s+(\w+)/i,
      /expecting\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?from\s+(\w+)/i,
      /waiting for\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?from\s+(\w+)/i,
    ];

    for (const pattern of requestPatterns) {
      const match = lowerText.match(pattern);
      if (match) {
        let amount, username;
        const patternStr = pattern.toString();
        if (
          patternStr.includes('ask') ||
          patternStr.includes('owes me') ||
          patternStr.includes('charge') ||
          patternStr.includes('bill') ||
          patternStr.includes('invoice')
        ) {
          // For these patterns, recipient comes first
          username = match[1];
          amount = match[2];
        } else {
          amount = match[1];
          username = match[2];
        }

        return {
          type: CommandType.REQUEST,
          args: { amount, username },
          rawText: text,
        };
      }
    }

    // Link account variations
    if (
      lowerText.includes('link my account') ||
      lowerText.includes('connect my account') ||
      lowerText.includes('link my flash') ||
      lowerText.includes('connect to flash') ||
      lowerText.includes('link to flash') ||
      lowerText.includes('setup my account') ||
      lowerText.includes('set up my account') ||
      lowerText.includes('authenticate me') ||
      lowerText.includes('auth me') ||
      lowerText.includes('sign me up') ||
      lowerText.includes('register me') ||
      lowerText.includes('register my account') ||
      lowerText.includes('create my account') ||
      lowerText.includes('activate my account') ||
      lowerText.includes('i want to link') ||
      lowerText.includes('i need to link') ||
      lowerText.includes('help me link') ||
      lowerText.includes('help me connect') ||
      lowerText.includes('i want to connect') ||
      lowerText.includes('i need to connect') ||
      lowerText.includes('can you link me') ||
      lowerText.includes('can you connect me') ||
      lowerText.includes('please link') ||
      lowerText.includes('please connect') ||
      lowerText.includes('link up') ||
      lowerText.includes('hook me up') ||
      lowerText.includes('get me connected') ||
      lowerText.includes('join flash') ||
      lowerText.includes('join the network') ||
      lowerText.includes('add my flash account') ||
      lowerText.includes('add flash account') ||
      lowerText.includes('connect wallet') ||
      lowerText.includes('link wallet') ||
      lowerText.includes('setup wallet') ||
      lowerText.includes('configure my account') ||
      lowerText === 'link me' ||
      lowerText === 'connect me' ||
      lowerText === 'link' ||
      lowerText === 'connect' ||
      lowerText === 'setup' ||
      lowerText === 'register' ||
      lowerText === 'authenticate' ||
      lowerText === 'auth'
    ) {
      return { type: CommandType.LINK, args: {}, rawText: text };
    }

    // History variations
    if (
      lowerText.includes('show my history') ||
      lowerText.includes('transaction history') ||
      lowerText.includes('show my transactions') ||
      lowerText.includes('recent transactions') ||
      lowerText.includes('payment history') ||
      lowerText.includes('my transactions') ||
      lowerText.includes('list transactions') ||
      lowerText.includes('display transactions') ||
      lowerText.includes('check history') ||
      lowerText.includes('check transactions') ||
      lowerText.includes('view history') ||
      lowerText.includes('view transactions') ||
      lowerText.includes('see history') ||
      lowerText.includes('see transactions') ||
      lowerText.includes('past transactions') ||
      lowerText.includes('previous transactions') ||
      lowerText.includes('transaction log') ||
      lowerText.includes('payment log') ||
      lowerText.includes('activity log') ||
      lowerText.includes('my activity') ||
      lowerText.includes('account activity') ||
      lowerText.includes('wallet activity') ||
      lowerText.includes('recent activity') ||
      lowerText.includes('show activity') ||
      lowerText.includes('what did i send') ||
      lowerText.includes('what did i receive') ||
      lowerText.includes('what have i sent') ||
      lowerText.includes('what have i received') ||
      lowerText.includes('my payments') ||
      lowerText.includes('show payments') ||
      lowerText.includes('list payments') ||
      lowerText.includes('payment record') ||
      lowerText.includes('transaction record') ||
      lowerText.includes('spending history') ||
      lowerText.includes('earning history') ||
      lowerText.includes('money history') ||
      lowerText.includes('funds history') ||
      lowerText.includes('bitcoin history') ||
      lowerText.includes('btc history') ||
      lowerText.includes('flash history') ||
      lowerText === 'history' ||
      lowerText === 'hist' ||
      lowerText === 'transactions' ||
      lowerText === 'tx' ||
      lowerText === 'txs' ||
      lowerText === 'activity' ||
      lowerText === 'log' ||
      lowerText === 'records'
    ) {
      return { type: CommandType.HISTORY, args: {}, rawText: text };
    }

    // Receive variations
    if (
      lowerText.includes('receive money') ||
      lowerText.includes('receive payment') ||
      lowerText.includes('get paid') ||
      lowerText.includes('request money') ||
      lowerText.includes('create invoice') ||
      lowerText.includes('generate invoice') ||
      lowerText.includes('make invoice') ||
      lowerText.includes('create payment request') ||
      lowerText.includes('generate payment request') ||
      lowerText.includes('request payment') ||
      lowerText.includes('ask for money') ||
      lowerText.includes('ask for payment') ||
      lowerText.includes('i want to receive') ||
      lowerText.includes('i need to receive') ||
      lowerText.includes('help me receive') ||
      lowerText.includes('let me receive') ||
      lowerText.includes('can i receive') ||
      lowerText.includes('how to receive') ||
      lowerText.includes('receive funds') ||
      lowerText.includes('accept payment') ||
      lowerText.includes('accept money') ||
      lowerText.includes('collect payment') ||
      lowerText.includes('collect money') ||
      lowerText.includes('get money') ||
      lowerText.includes('get funds') ||
      lowerText.includes('invoice me') ||
      lowerText.includes('bill someone') ||
      lowerText.includes('charge someone') ||
      lowerText.includes('payment link') ||
      lowerText.includes('payment code') ||
      lowerText.includes('qr code') ||
      lowerText.includes('generate qr') ||
      lowerText.includes('create qr') ||
      lowerText.includes('show qr') ||
      lowerText.includes('display qr') ||
      lowerText.includes('lightning invoice') ||
      lowerText.includes('ln invoice') ||
      lowerText.includes('bolt11') ||
      lowerText === 'receive' ||
      lowerText === 'recv' ||
      lowerText === 'invoice' ||
      lowerText === 'inv' ||
      lowerText === 'qr' ||
      lowerText === 'collect'
    ) {
      // Try to extract amount if mentioned
      const amountMatch = text.match(/(\d+(?:\.\d+)?)/);
      if (amountMatch) {
        return {
          type: CommandType.RECEIVE,
          args: { amount: amountMatch[1] },
          rawText: text,
        };
      }
      return { type: CommandType.RECEIVE, args: {}, rawText: text };
    }

    // Contacts variations
    if (
      lowerText.includes('my contacts') ||
      lowerText.includes('show contacts') ||
      lowerText.includes('list contacts') ||
      lowerText.includes('view contacts') ||
      lowerText.includes('see contacts') ||
      lowerText.includes('address book') ||
      lowerText.includes('phone book') ||
      lowerText.includes('contact list') ||
      lowerText.includes('saved contacts') ||
      lowerText.includes('add contact') ||
      lowerText.includes('add a contact') ||
      lowerText.includes('save contact') ||
      lowerText.includes('save a contact') ||
      lowerText.includes('new contact') ||
      lowerText.includes('create contact') ||
      lowerText.includes('store contact') ||
      lowerText.includes('add phone number') ||
      lowerText.includes('save phone number') ||
      lowerText.includes('add number') ||
      lowerText.includes('save number') ||
      lowerText.includes('remove contact') ||
      lowerText.includes('delete contact') ||
      lowerText.includes('erase contact') ||
      lowerText.includes('clear contact') ||
      lowerText.includes('manage contacts') ||
      lowerText.includes('contact management') ||
      lowerText.includes('who are my contacts') ||
      lowerText.includes('show me contacts') ||
      lowerText.includes('i want to add a contact') ||
      lowerText.includes('i need to add a contact') ||
      lowerText.includes('help me add a contact') ||
      lowerText === 'contacts' ||
      lowerText === 'contact' ||
      lowerText === 'addressbook' ||
      lowerText === 'phonebook'
    ) {
      return { type: CommandType.CONTACTS, args: {}, rawText: text };
    }

    // Username variations
    if (
      lowerText.includes('set username') ||
      lowerText.includes('change username') ||
      lowerText.includes('update username') ||
      lowerText.includes('modify username') ||
      lowerText.includes('edit username') ||
      lowerText.includes('pick username') ||
      lowerText.includes('choose username') ||
      lowerText.includes('select username') ||
      lowerText.includes('create username') ||
      lowerText.includes('make username') ||
      lowerText.includes('my username') ||
      lowerText.includes('check username') ||
      lowerText.includes('view username') ||
      lowerText.includes('see username') ||
      lowerText.includes('show username') ||
      lowerText.includes('what is my username') ||
      lowerText.includes('whats my username') ||
      lowerText.includes('change my name') ||
      lowerText.includes('update my name') ||
      lowerText.includes('set my name') ||
      lowerText.includes('i want to change my username') ||
      lowerText.includes('i need to change my username') ||
      lowerText.includes('help me change my username') ||
      lowerText.includes('can i change my username') ||
      lowerText.includes('how to change username') ||
      lowerText.includes('username available') ||
      lowerText.includes('is username taken') ||
      lowerText.includes('check if username') ||
      lowerText === 'username' ||
      lowerText === 'user' ||
      lowerText === 'name' ||
      lowerText === 'handle' ||
      lowerText === 'alias'
    ) {
      return { type: CommandType.USERNAME, args: {}, rawText: text };
    }

    // Check voice switching patterns using imported constants
    for (const pattern of VOICE_SWITCH_PATTERNS) {
      const match = lowerText.match(pattern);
      if (match) {
        const voiceName = match[1];
        return {
          type: CommandType.VOICE,
          args: { action: 'select', voiceName },
          rawText: text,
        };
      }
    }

    // Voice settings - check for "voice only" and variations first
    if (
      lowerText === 'voice only' ||
      lowerText === 'voicenote only' ||
      lowerText === 'voice note only' ||
      lowerText === 'only voice' ||
      lowerText === 'only voicenote' ||
      lowerText === 'only voice note' ||
      lowerText === 'just voice' ||
      lowerText === 'just voicenote' ||
      lowerText === 'just voice note' ||
      lowerText === 'voice notes only' ||
      lowerText === 'voicenotes only' ||
      lowerText === 'just voice notes' ||
      lowerText === 'just voicenotes' ||
      lowerText === 'only voice notes' ||
      lowerText === 'only voicenotes' ||
      lowerText.includes('voice only') ||
      lowerText.includes('voicenote only') ||
      lowerText.includes('voice note only') ||
      lowerText.includes('only voice') ||
      lowerText.includes('only voicenote') ||
      lowerText.includes('only voice note') ||
      lowerText.includes('just voice') ||
      lowerText.includes('just voicenote') ||
      lowerText.includes('just voice note') ||
      lowerText.includes('i want voice only') ||
      lowerText.includes('i want voicenote only') ||
      lowerText.includes('i want voice note only') ||
      lowerText.includes('i want only voice') ||
      lowerText.includes('i want only voicenote') ||
      lowerText.includes('i want only voice note') ||
      lowerText.includes('i want just voice') ||
      lowerText.includes('i want just voicenote') ||
      lowerText.includes('i want just voice note')
    ) {
      return { type: CommandType.VOICE, args: { action: 'only' }, rawText: text };
    }

    // Other voice settings variations
    if (
      lowerText.includes('voice settings') ||
      lowerText.includes('voice mode') ||
      lowerText.includes('voice options') ||
      lowerText.includes('voice preferences') ||
      lowerText.includes('audio settings') ||
      lowerText.includes('audio mode') ||
      lowerText.includes('speech settings') ||
      lowerText.includes('turn on voice') ||
      lowerText.includes('turn off voice') ||
      lowerText.includes('enable voice') ||
      lowerText.includes('disable voice') ||
      lowerText.includes('activate voice') ||
      lowerText.includes('deactivate voice') ||
      lowerText.includes('voice on') ||
      lowerText.includes('voice off') ||
      lowerText.includes('voice status') ||
      lowerText.includes('check voice') ||
      lowerText.includes('voice help') ||
      lowerText.includes('stop talking') ||
      lowerText.includes('start talking') ||
      lowerText.includes('speak to me') ||
      lowerText.includes('dont speak') ||
      lowerText.includes('no voice') ||
      lowerText.includes('mute voice') ||
      lowerText.includes('unmute voice') ||
      lowerText.includes('i want voice') ||
      lowerText.includes('i dont want voice') ||
      lowerText.includes('text only') ||
      lowerText.includes('no audio') ||
      lowerText === 'voice' ||
      lowerText === 'voicenote' ||
      lowerText === 'voice note' ||
      lowerText === 'audio' ||
      lowerText === 'speech' ||
      lowerText === 'tts'
    ) {
      // Extract specific voice action if present
      const args: any = {};

      if (
        lowerText.includes('voice on') ||
        lowerText.includes('turn on') ||
        lowerText.includes('enable voice') ||
        lowerText.includes('activate voice') ||
        lowerText.includes('start talking')
      ) {
        args.action = 'on';
      } else if (
        lowerText.includes('voice off') ||
        lowerText.includes('turn off') ||
        lowerText.includes('disable voice') ||
        lowerText.includes('deactivate voice') ||
        lowerText.includes('stop talking') ||
        lowerText.includes('no voice') ||
        lowerText.includes('mute voice') ||
        lowerText.includes('text only')
      ) {
        args.action = 'off';
      } else if (
        lowerText.includes('voice only') ||
        lowerText.includes('only voice') ||
        lowerText.includes('just voice')
      ) {
        args.action = 'only';
      } else if (lowerText.includes('voice status') || lowerText.includes('check voice')) {
        args.action = 'status';
      } else if (lowerText.includes('voice list')) {
        args.action = 'list';
      } else if (lowerText === 'voice' || !lowerText.includes(' ')) {
        // Default to status for just "voice"
        args.action = 'status';
      }

      return { type: CommandType.VOICE, args, rawText: text };
    }

    // Pending payments variations
    if (
      lowerText.includes('pending payments') ||
      lowerText.includes('pending transactions') ||
      lowerText.includes('unclaimed payments') ||
      lowerText.includes('unclaimed money') ||
      lowerText.includes('waiting payments') ||
      lowerText.includes('outstanding payments') ||
      lowerText.includes('claim payment') ||
      lowerText.includes('claim money') ||
      lowerText.includes('claim funds') ||
      lowerText.includes('collect pending') ||
      lowerText.includes('pending sent') ||
      lowerText.includes('pending received') ||
      lowerText.includes('payments i sent') ||
      lowerText.includes('payments i received') ||
      lowerText.includes('check pending') ||
      lowerText.includes('view pending') ||
      lowerText.includes('see pending') ||
      lowerText.includes('show pending') ||
      lowerText.includes('list pending') ||
      lowerText.includes('my pending') ||
      lowerText.includes('pending balance') ||
      lowerText.includes('pending funds') ||
      lowerText.includes('uncollected payments') ||
      lowerText.includes('unredeemed payments') ||
      lowerText.includes('payments waiting') ||
      lowerText.includes('money waiting') ||
      lowerText === 'pending' ||
      lowerText === 'claim' ||
      lowerText === 'unclaimed'
    ) {
      return { type: CommandType.PENDING, args: {}, rawText: text };
    }

    // Pay/confirmation variations
    if (
      lowerText.includes('confirm payment') ||
      lowerText.includes('cancel payment') ||
      lowerText.includes('confirm transaction') ||
      lowerText.includes('cancel transaction') ||
      lowerText.includes('approve payment') ||
      lowerText.includes('reject payment') ||
      lowerText.includes('pay confirm') ||
      lowerText.includes('pay cancel') ||
      lowerText.includes('payment confirmation') ||
      lowerText.includes('transaction confirmation') ||
      lowerText.includes('verify payment') ||
      lowerText.includes('verify transaction') ||
      lowerText.includes('complete payment') ||
      lowerText.includes('finish payment') ||
      lowerText.includes('finalize payment') ||
      lowerText.includes('abort payment') ||
      lowerText.includes('stop payment') ||
      lowerText.includes('yes confirm') ||
      lowerText.includes('no cancel') ||
      lowerText === 'pay' ||
      lowerText === 'confirm' ||
      lowerText === 'cancel' ||
      lowerText === 'approve' ||
      lowerText === 'reject'
    ) {
      return { type: CommandType.PAY, args: {}, rawText: text };
    }

    // Unlink variations
    if (
      lowerText.includes('unlink account') ||
      lowerText.includes('disconnect account') ||
      lowerText.includes('remove account') ||
      lowerText.includes('delete account') ||
      lowerText.includes('logout') ||
      lowerText.includes('log out') ||
      lowerText.includes('sign out') ||
      lowerText.includes('signout') ||
      lowerText.includes('disconnect me') ||
      lowerText.includes('unlink me') ||
      lowerText.includes('remove me') ||
      lowerText.includes('i want to unlink') ||
      lowerText.includes('i need to unlink') ||
      lowerText.includes('help me unlink') ||
      lowerText.includes('can you unlink me') ||
      lowerText.includes('please unlink') ||
      lowerText.includes('deactivate account') ||
      lowerText.includes('close account') ||
      lowerText === 'unlink' ||
      lowerText === 'disconnect' ||
      lowerText === 'logout' ||
      lowerText === 'signout'
    ) {
      return { type: CommandType.UNLINK, args: {}, rawText: text };
    }

    // Refresh variations
    if (
      lowerText === 'refresh' ||
      lowerText === 'reload' ||
      lowerText === 'update' ||
      lowerText === 'sync' ||
      lowerText.includes('refresh balance') ||
      lowerText.includes('update balance') ||
      lowerText.includes('sync balance') ||
      lowerText.includes('reload balance') ||
      lowerText.includes('refresh data') ||
      lowerText.includes('update data') ||
      lowerText.includes('sync data') ||
      lowerText.includes('reload data')
    ) {
      return { type: CommandType.REFRESH, args: {}, rawText: text };
    }

    // Admin variations (be careful with these)
    // Skip this special case handling and let the normal command parsing handle it
    // This was causing admin status and other commands to not work properly
    if (
      lowerText === 'admin' ||
      lowerText === 'admin help' ||
      lowerText === 'admin mode' ||
      lowerText === 'admin panel' ||
      lowerText === 'admin commands'
    ) {
      return { type: CommandType.ADMIN, args: {}, rawText: text };
    }

    // Settings variations
    if (
      lowerText === 'settings' ||
      lowerText === 'setting' ||
      lowerText === 'preferences' ||
      lowerText === 'preference' ||
      lowerText === 'config' ||
      lowerText === 'configuration' ||
      lowerText.includes('my settings') ||
      lowerText.includes('show settings') ||
      lowerText.includes('view settings') ||
      lowerText.includes('check settings') ||
      lowerText.includes('current settings') ||
      lowerText.includes('my preferences') ||
      lowerText.includes('show preferences') ||
      lowerText.includes('view preferences') ||
      lowerText.includes('my configuration') ||
      lowerText.includes('show configuration') ||
      lowerText.includes('what are my settings') ||
      lowerText.includes('show me my settings') ||
      lowerText.includes('i want to see my settings') ||
      lowerText.includes('display my settings') ||
      lowerText.includes('list my settings')
    ) {
      return { type: CommandType.SETTINGS, args: {}, rawText: text };
    }

    // Undo variations
    if (
      lowerText === 'undo' ||
      lowerText === 'undo that' ||
      lowerText === 'undo last' ||
      lowerText === 'undo payment' ||
      lowerText === 'undo transaction' ||
      lowerText === 'cancel that' ||
      lowerText === 'cancel last payment' ||
      lowerText === 'reverse payment' ||
      lowerText === 'reverse transaction' ||
      lowerText === 'take it back' ||
      lowerText === 'i made a mistake' ||
      lowerText === 'wrong amount' ||
      lowerText === 'wrong person' ||
      lowerText === 'sent by mistake' ||
      lowerText.includes('undo the payment') ||
      lowerText.includes('undo my last') ||
      lowerText.includes('cancel the payment') ||
      lowerText.includes('reverse the payment') ||
      lowerText.includes('get it back') ||
      lowerText.includes('want it back')
    ) {
      return { type: CommandType.UNDO, args: {}, rawText: text };
    }

    // Template variations
    if (
      lowerText.includes('template') ||
      lowerText.includes('saved payment') ||
      lowerText.includes('payment shortcut') ||
      lowerText.includes('recurring payment') ||
      lowerText.includes('quick payment') ||
      lowerText.includes('favorite payment') ||
      lowerText.includes('payment preset') ||
      lowerText === 'templates' ||
      lowerText === 'shortcuts' ||
      lowerText === 'presets'
    ) {
      return { type: CommandType.TEMPLATE, args: {}, rawText: text };
    }

    // Skip onboarding
    if (
      lowerText === 'skip' ||
      lowerText === 'skip onboarding' ||
      lowerText === 'skip tutorial' ||
      lowerText === 'skip intro' ||
      lowerText === 'skip introduction' ||
      lowerText === 'no tutorial' ||
      lowerText === 'no onboarding' ||
      lowerText.includes('skip the onboarding') ||
      lowerText.includes('skip the tutorial') ||
      lowerText.includes('already know') ||
      lowerText.includes("i'm a pro") ||
      lowerText.includes('i am a pro')
    ) {
      return { type: CommandType.SKIP, args: {}, rawText: text };
    }

    // Learn variations
    if (
      lowerText === 'learn' ||
      lowerText === 'teach' ||
      lowerText === 'ask me' ||
      lowerText === 'ask me something' ||
      lowerText === 'ask a question' ||
      lowerText === 'random question' ||
      lowerText === 'knowledge' ||
      lowerText === 'my knowledge' ||
      lowerText === 'what have i taught' ||
      lowerText === 'what did i teach' ||
      lowerText.includes('teach me') ||
      lowerText.includes('learn from me') ||
      lowerText.includes('ask me a question') ||
      lowerText.includes('random question') ||
      lowerText.includes('knowledge base') ||
      lowerText.includes('my answers')
    ) {
      return { type: CommandType.LEARN, args: {}, rawText: text };
    }

    return { type: CommandType.UNKNOWN, args: {}, rawText: text };
  }

  /**
   * Parse instructional questions (how do I, what is, where can I find, etc.)
   */
  private parseInstructionalQuestion(text: string): ParsedCommand {
    const lowerText = text.toLowerCase();

    // Question patterns - be specific to avoid catching simple commands
    const questionPatterns = [
      /how (?:do i|can i|to|should i)\s+(.+)/i,
      /what (?:is|are) (?:the )?(?:way|process|method|procedure) (?:to|for)\s+(.+)/i,
      /where (?:can i|do i|should i)\s+(?:find|get|see)\s+(.+)/i,
      /when (?:can i|should i|do i)\s+(.+)/i,
      /why (?:should i|would i|do i)\s+(.+)/i,
      /can (?:i|you|someone)\s+(.+)/i,
      /could (?:i|you)\s+(.+)/i,
      /would (?:you|someone)\s+(.+)/i,
      /is it possible to\s+(.+)/i,
      /do you know how to\s+(.+)/i,
      /show me how to\s+(.+)/i,
      /teach me how to\s+(.+)/i,
      /explain how to\s+(.+)/i,
      /tell me how to\s+(.+)/i,
      /help me\s+(.+)/i,
      /i want to know how to\s+(.+)/i,
      /i need to know how to\s+(.+)/i,
      /how does (.+) work/i,
      /what does (.+) mean/i,
      /what\'s the (?:way|process|method) to\s+(.+)/i,
    ];

    for (const pattern of questionPatterns) {
      const match = text.match(pattern);
      if (match) {
        const questionContent = match[1].toLowerCase();

        // Check what they're asking about
        if (
          questionContent.includes('send') ||
          questionContent.includes('pay') ||
          questionContent.includes('transfer')
        ) {
          // They're asking how to send money
          return {
            type: CommandType.HELP,
            args: {
              category: 'send',
              isQuestion: 'true',
              originalQuestion: text,
            },
            rawText: text,
          };
        } else if (
          questionContent.includes('receive') ||
          questionContent.includes('get paid') ||
          questionContent.includes('accept money')
        ) {
          return {
            type: CommandType.HELP,
            args: {
              category: 'receive',
              isQuestion: 'true',
              originalQuestion: text,
            },
            rawText: text,
          };
        } else if (
          questionContent.includes('balance') ||
          questionContent.includes('check') ||
          questionContent.includes('money')
        ) {
          return {
            type: CommandType.HELP,
            args: {
              category: 'wallet',
              isQuestion: 'true',
              originalQuestion: text,
            },
            rawText: text,
          };
        } else if (
          questionContent.includes('link') ||
          questionContent.includes('connect') ||
          questionContent.includes('account')
        ) {
          return {
            type: CommandType.HELP,
            args: {
              category: 'link',
              isQuestion: 'true',
              originalQuestion: text,
            },
            rawText: text,
          };
        } else if (questionContent.includes('contact')) {
          return {
            type: CommandType.HELP,
            args: {
              category: 'contacts',
              isQuestion: 'true',
              originalQuestion: text,
            },
            rawText: text,
          };
        } else if (questionContent.includes('voice') || questionContent.includes('audio')) {
          return {
            type: CommandType.HELP,
            args: {
              category: 'voice',
              isQuestion: 'true',
              originalQuestion: text,
            },
            rawText: text,
          };
        } else if (
          questionContent.includes('game') ||
          questionContent.includes('play') ||
          questionContent.includes('trivia') ||
          questionContent.includes('fun')
        ) {
          return {
            type: CommandType.HELP,
            args: {
              category: 'games',
              isQuestion: 'true',
              originalQuestion: text,
            },
            rawText: text,
          };
        } else {
          // General help question
          return {
            type: CommandType.HELP,
            args: {
              isQuestion: 'true',
              originalQuestion: text,
            },
            rawText: text,
          };
        }
      }
    }

    return { type: CommandType.UNKNOWN, args: {}, rawText: text };
  }

  /**
   * Extract command details based on the match
   */
  private extractCommand(
    type: CommandType,
    match: RegExpMatchArray,
    rawText: string,
  ): ParsedCommand {
    const args: Record<string, string> = {};

    switch (type) {
      case CommandType.HELP:
        // Extract help category if provided
        if (match[1]) {
          args.category = match[1];
        }
        break;

      case CommandType.VERIFY:
        // Extract OTP code
        if (match[1]) {
          args.otp = match[1];
        }
        break;

      case CommandType.CONSENT:
        // Extract consent choice
        if (match[1]) {
          args.choice = match[1].toLowerCase();
        }
        break;

      case CommandType.LINK:
        // Extract link type (group) or code
        if (match[1]) {
          if (match[1].toLowerCase() === 'group') {
            args.type = 'group';
          } else {
            args.code = match[1].toUpperCase();
          }
        }
        break;

      case CommandType.UNLINK:
        // Extract confirmation if provided
        if (match[1]) {
          args.confirm = match[1].toLowerCase();
        }
        break;

      case CommandType.USERNAME:
        // Extract username if provided
        if (match[1]) {
          args.username = match[1].trim();
        }
        break;

      case CommandType.SEND:
        // Extract amount and recipient (username, phone, or contact name)
        if (match[1]) {
          args.amount = match[1];
        }
        if (match[2]) {
          // Username (with or without @)
          args.username = match[2];
        } else if (match[3]) {
          // Phone number
          args.phoneNumber = match[3];
        } else if (match[4]) {
          // Contact name or Lightning address
          args.recipient = match[4];
        }
        if (match[5]) {
          // Optional memo/note
          args.memo = match[5].trim();
        }
        break;

      case CommandType.RECEIVE:
        // Extract amount and memo if provided
        if (match[1]) {
          args.amount = match[1];
        }
        if (match[2]) {
          // Limit memo length at parsing stage to prevent issues
          const rawMemo = match[2].trim();
          args.memo = rawMemo.substring(0, 1000); // Generous limit at parse stage
        }
        break;

      case CommandType.HISTORY:
        // Extract transaction ID if provided
        if (match[1]) {
          args.transactionId = match[1].replace('#', ''); // Remove # if present
        }
        break;

      case CommandType.REQUEST:
        // Extract amount and either username or phone number
        if (match[1]) {
          args.amount = match[1];
        }
        if (match[2]) {
          // Username was provided
          args.username = match[2];
        } else if (match[3]) {
          // Phone number was provided instead of username
          args.phoneNumber = match[3];
        }
        if (match[4]) {
          // Additional phone number (when username was provided)
          args.phoneNumber = match[4].trim();
        }
        break;

      case CommandType.CONTACTS:
        // Extract action, name, and phone number
        if (match[1]) {
          args.action = match[1].toLowerCase(); // add, list, remove
        }
        if (match[2]) {
          args.name = match[2];
        }
        if (match[3]) {
          args.phoneNumber = match[3].trim();
        }
        break;

      case CommandType.PAY:
        // Extract action: confirm, cancel, list, or a number
        if (match[1]) {
          args.action = match[1].toLowerCase();
        }
        // Check for "all" modifier (e.g., "pay cancel all")
        if (match[2]) {
          args.modifier = match[2].toLowerCase();
        }
        break;

      case CommandType.VYBZ:
        // Extract status/check action
        if (match[1]) {
          args.action = match[1].toLowerCase();
        }
        break;

      case CommandType.ADMIN:
        // Extract admin action
        if (match[1]) {
          args.action = match[1].toLowerCase().trim();
        }
        // Extract additional parameters for admin commands
        if (match[2]) {
          // For "add support" or "add admin", the phone number is in match[2]
          if (args.action === 'add' && rawText.includes('support')) {
            args.subAction = 'support';
            args.phoneNumber = match[2].trim();
          } else if (args.action === 'add' && rawText.includes('admin')) {
            args.subAction = 'admin';
            args.phoneNumber = match[2].trim();
          } else if (args.action === 'find') {
            args.searchTerm = match[2].trim();
          } else if (args.action === 'remove' && rawText.includes('support')) {
            args.subAction = 'support';
            args.phoneNumber = match[2].trim();
          } else if (args.action === 'remove' && rawText.includes('admin')) {
            args.subAction = 'admin';
            args.phoneNumber = match[2].trim();
          } else if (args.action === 'lockdown') {
            args.mode = match[2].trim().toLowerCase();
          } else if (args.action === 'group') {
            args.mode = match[2].trim().toLowerCase();
          } else if (args.action === 'voice') {
            // Parse voice subcommands more carefully
            const voiceParams = match[2].trim();
            const voiceParts = voiceParams.split(/\s+/);
            
            if (voiceParts[0]) {
              args.mode = voiceParts[0].toLowerCase();
              
              // For 'default' command, capture the voice name
              if (args.mode === 'default' && voiceParts[1]) {
                args.extra = voiceParts.slice(1).join(' ');
              }
            }
          } else if (args.action === 'analytics') {
            args.period = match[2]?.trim().toLowerCase() || 'daily';
          }
        }
        break;

      case CommandType.PENDING:
        // Extract action: sent, received, or claim
        if (match[1]) {
          args.action = match[1].toLowerCase();
        }
        // Extract claim code for claim action
        if (match[2]) {
          args.claimCode = match[2].trim();
        }
        break;

      case CommandType.VOICE:
        // Extract voice command arguments
        if (match[1]) {
          const voiceArgs = match[1].trim().toLowerCase();
          const parts = voiceArgs.split(/\s+/);

          // Check for special commands
          if (['on', 'off', 'only', 'status', 'help', 'list'].includes(parts[0])) {
            args.action = parts[0];
          } else if (parts[0] === 'add' && parts.length >= 2) {
            args.action = 'add';
            // Check if voice name was provided
            if (parts.length >= 3) {
              args.voiceName = parts[1];
              // Voice ID might contain uppercase, so get it from original match
              const originalParts = match[1].trim().split(/\s+/);
              args.voiceId = originalParts.slice(2).join(' '); // Join in case ID has spaces
            } else {
              // Only voice ID provided, name will be generated
              const originalParts = match[1].trim().split(/\s+/);
              args.voiceId = originalParts.slice(1).join(' '); // Join in case ID has spaces
            }
          } else if (parts[0] === 'remove' && parts.length >= 2) {
            args.action = 'remove';
            args.voiceName = parts.slice(1).join(' ');
          } else {
            // Assume it's a voice name selection
            args.action = 'select';
            args.voiceName = voiceArgs;
          }
        } else {
          // No arguments, check if we already have action from natural language parsing
          if (!args.action) {
            args.action = 'status'; // Default to status when no args
          }
        }
        break;

      case CommandType.TEMPLATE:
        // Extract template action and parameters
        if (match[1]) {
          args.action = match[1].toLowerCase();
          // Parse remaining text based on action
          if (match[2]) {
            const remainingText = match[2].trim();
            if (args.action === 'add') {
              // template add [name] [amount] to [recipient] "[memo]"
              const addMatch = remainingText.match(
                /^(\w+)\s+(\d+(?:\.\d+)?)\s+to\s+(\w+)(?:\s+"([^"]+)")?/,
              );
              if (addMatch) {
                args.name = addMatch[1];
                args.amount = addMatch[2];
                args.recipient = addMatch[3];
                if (addMatch[4]) {
                  args.memo = addMatch[4];
                }
              }
            } else if (args.action === 'remove') {
              args.name = remainingText;
            }
          }
        } else {
          args.action = 'list';
        }
        break;

      case CommandType.UNDO:
        // No additional args needed for undo
        break;

      case CommandType.LEARN:
        // Extract learn action and parameters
        if (match[1]) {
          args.action = match[1].toLowerCase();
          if (match[2]) {
            args.query = match[2].trim();
          }
        } else {
          args.action = 'ask'; // Default action is to ask a question
        }
        break;

      case CommandType.SKIP:
        // No additional args needed for skip
        break;
    }

    return { type, args, rawText };
  }

  /**
   * Apply smart command corrections for common typos and shortcuts
   */
  private applyCommandCorrections(text: string): string {
    const lowerText = text.toLowerCase();

    // Common typos and corrections
    const corrections: Record<string, string> = {
      // Send command variations
      sent: 'send',
      snd: 'send',
      sen: 'send',
      sedn: 'send',
      sned: 'send',
      sand: 'send',
      sed: 'send',
      sende: 'send',
      sendd: 'send',
      transfer: 'send',
      wire: 'send',
      zap: 'send',

      // Receive command variations
      recieve: 'receive',
      recive: 'receive',
      recv: 'receive',
      rec: 'receive',
      receve: 'receive',
      receiv: 'receive',
      invoice: 'receive',
      inv: 'receive',
      qr: 'receive',
      collect: 'receive',

      // Balance shortcuts
      bal: 'balance',
      balnce: 'balance',
      balanc: 'balance',
      balalce: 'balance',
      ballance: 'balance',
      balence: 'balance',
      blance: 'balance',
      blaance: 'balance',
      money: 'balance',
      funds: 'balance',
      wallet: 'balance',
      $: 'balance',
      $$: 'balance',
      $$$: 'balance',

      // History shortcuts
      hist: 'history',
      histry: 'history',
      histroy: 'history',
      txs: 'history',
      tx: 'history',
      transactions: 'history',
      trans: 'history',
      log: 'history',
      logs: 'history',
      activity: 'history',
      activities: 'history',
      records: 'history',

      // Price shortcuts
      btc: 'price',
      bitcoin: 'price',
      rate: 'price',
      rates: 'price',
      exchange: 'price',
      market: 'price',
      value: 'price',
      cost: 'price',
      worth: 'price',

      // Contact variations
      contact: 'contacts',
      contacs: 'contacts',
      contcts: 'contacts',
      cntacts: 'contacts',
      conts: 'contacts',
      addressbook: 'contacts',
      phonebook: 'contacts',
      directory: 'contacts',

      // Link variations
      conect: 'link',
      connect: 'link',
      lnk: 'link',
      llink: 'link',
      linnk: 'link',
      setup: 'link',
      auth: 'link',
      authenticate: 'link',
      register: 'link',
      join: 'link',

      // Request variations
      req: 'request',
      requst: 'request',
      rquest: 'request',
      requets: 'request',
      requeset: 'request',

      // Help variations
      hlp: 'help',
      halp: 'help',
      hepl: 'help',
      hellp: 'help',
      hhelp: 'help',
      info: 'help',
      information: 'help',
      commands: 'help',
      menu: 'help',
      options: 'help',
      '?': 'help',
      '??': 'help',
      h: 'help',

      // Username variations
      user: 'username',
      usrname: 'username',
      uname: 'username',
      usernme: 'username',
      usrnam: 'username',
      name: 'username',
      handle: 'username',
      alias: 'username',

      // Voice variations
      audio: 'voice',
      speech: 'voice',
      tts: 'voice',
      speak: 'voice',
      sound: 'voice',
      vocie: 'voice',
      voic: 'voice',
      vioce: 'voice',

      // Pending variations
      pendng: 'pending',
      pnding: 'pending',
      pendign: 'pending',
      claim: 'pending',
      unclaimed: 'pending',
      waiting: 'pending',
      outstanding: 'pending',

      // Refresh variations
      reload: 'refresh',
      update: 'refresh',
      sync: 'refresh',
      refesh: 'refresh',
      refrsh: 'refresh',
      refres: 'refresh',

      // Unlink variations
      logout: 'unlink',
      signout: 'unlink',
      disconnect: 'unlink',
      unlnk: 'unlink',
      unlik: 'unlink',
      remove: 'unlink',

      // Help navigation
      more: 'help more',
      '1': 'help 1',
      '2': 'help 2',
      '3': 'help 3',
    };

    // Check if the entire command matches a correction
    if (corrections[lowerText]) {
      return corrections[lowerText];
    }

    // Check if the first word needs correction
    const words = text.split(/\s+/);
    const firstWord = words[0].toLowerCase();

    if (corrections[firstWord]) {
      words[0] = corrections[firstWord];
      return words.join(' ');
    }

    // Special case: handle case-insensitive commands
    const commandWords = [
      'send',
      'receive',
      'balance',
      'link',
      'unlink',
      'verify',
      'username',
      'price',
      'history',
      'request',
      'contacts',
      'pay',
      'vybz',
      'admin',
      'pending',
      'voice',
      'help',
      'refresh',
    ];

    if (commandWords.includes(firstWord)) {
      words[0] = firstWord;
      return words.join(' ');
    }

    return text;
  }
}
