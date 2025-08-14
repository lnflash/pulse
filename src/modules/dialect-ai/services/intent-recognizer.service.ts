import { Injectable } from '@nestjs/common';
import { DialectNormalizerService } from './dialect-normalizer.service';

export interface IntentPattern {
  patterns: RegExp[];
  entities: string[];
  examples: string[];
}

export interface IntentResult {
  intent: string;
  confidence: number;
  entities: Record<string, any>;
  matchedPattern?: string;
  needsClarification: boolean;
}

@Injectable()
export class IntentRecognizerService {
  private intents: Record<string, IntentPattern> = {
    sendFunds: {
      patterns: [
        /send\s+(\d+|\w+)\s+(dollars?|bills?|JMD|USD|TTD|BBD|HTG|GYD)\s+to\s+(\w+)/i,
        /transfer\s+(\d+|\w+)\s+(dollars?|bills?)\s+to\s+(\w+)/i,
        /pay\s+(\w+)\s+(\d+|\w+)\s+(dollars?|bills?)/i,
        /voye\s+(\d+|\w+)\s+kob\s+bay\s+(\w+)/i,
        /sen\s+(\d+|\w+)\s+to\s+(\w+)/i,
        /send\s+(\w+)\s+(\d+|\w+)/i,
        /(\d+|\w+)\s+(dollars?|bills?)\s+for\s+(\w+)/i
      ],
      entities: ['amount', 'currency', 'recipient'],
      examples: [
        "send 200 dollars to Sean",
        "transfer two bills to Maria",
        "pay John 50 USD",
        "voye 100 kob bay Marie",
        "sen 50 to Peter",
        "send Sarah 100"
      ]
    },
    checkBalance: {
      patterns: [
        /check\s+(mi|my|meh|mwen)\s+(money|balance|wallet|flash)/i,
        /how\s+much\s+(mi|I|mwen)\s+(have|got)/i,
        /balance\s*(check|please)?/i,
        /show\s+(mi|my|meh)\s+(money|balance|wallet)/i,
        /kijan\s+kob\s+mwen\s+gen/i,
        /what'?s?\s+my\s+balance/i,
        /wallet\s+balance/i,
        /flash\s+balance/i
      ],
      entities: [],
      examples: [
        "check mi money",
        "how much I have",
        "show my balance",
        "kijan kob mwen gen",
        "balance check",
        "wallet balance"
      ]
    },
    requestPayment: {
      patterns: [
        /request\s+(\d+|\w+)\s+(dollars?|bills?)\s+from\s+(\w+)/i,
        /ask\s+(\w+)\s+for\s+(\d+|\w+)\s+(dollars?|bills?)/i,
        /(\w+)\s+owe\s+(mi|me|mwen)\s+(\d+|\w+)/i,
        /charge\s+(\w+)\s+(\d+|\w+)/i,
        /invoice\s+(\w+)\s+for\s+(\d+|\w+)/i,
        /need\s+(\d+|\w+)\s+from\s+(\w+)/i
      ],
      entities: ['amount', 'currency', 'payer'],
      examples: [
        "request 100 dollars from John",
        "ask Maria for two bills",
        "Sean owe mi 50 dollars",
        "charge Peter 30",
        "invoice Sarah for 100"
      ]
    },
    linkAccount: {
      patterns: [
        /link\s+(mi|my|meh|mwen)\s+(account|wallet|flash)/i,
        /connect\s+(mi|my|meh)\s+(account|wallet)/i,
        /setup\s+(mi|my)\s+(account|wallet)/i,
        /register\s+(mi|me|mwen)/i,
        /sign\s+up/i,
        /create\s+(account|wallet)/i
      ],
      entities: [],
      examples: [
        "link mi account",
        "connect my wallet",
        "setup my flash",
        "register me",
        "sign up"
      ]
    },
    help: {
      patterns: [
        /help/i,
        /what\s+can\s+you\s+do/i,
        /commands?/i,
        /how\s+(to|do|does)/i,
        /kisa\s+ou\s+ka\s+fe/i,
        /show\s+commands/i,
        /menu/i,
        /options/i,
        /guide/i
      ],
      entities: [],
      examples: [
        "help",
        "what can you do",
        "show commands",
        "how to send money",
        "guide"
      ]
    },
    greeting: {
      patterns: [
        /^(hi|hello|hey|yo|greetings|good\s+(morning|afternoon|evening|night))/i,
        /^(wah\s+gwaan|wagwan|wagwaan)/i,
        /^(bless\s+up|blessed|respect)/i,
        /^(aye|ayy|yow)/i,
        /^(bonjou|bonswa)/i,
        /^(morning|evening|afternoon)/i
      ],
      entities: [],
      examples: [
        "hello",
        "wah gwaan",
        "bless up",
        "good morning",
        "bonjou"
      ]
    },
    cancel: {
      patterns: [
        /cancel/i,
        /stop/i,
        /nevermind/i,
        /forget\s+it/i,
        /no\s+thanks/i,
        /abort/i
      ],
      entities: [],
      examples: [
        "cancel",
        "stop",
        "nevermind",
        "forget it"
      ]
    },
    confirmation: {
      patterns: [
        /^(yes|yeah|yea|yup|sure|ok|okay|confirm|correct|right)/i,
        /^(go\s+ahead|proceed|do\s+it)/i,
        /^(send\s+it|sen\s+it)/i,
        /^(wi|oui)/i
      ],
      entities: [],
      examples: [
        "yes",
        "go ahead",
        "send it",
        "confirm"
      ]
    },
    rejection: {
      patterns: [
        /^(no|nope|nah|never)/i,
        /^(cancel|stop)/i,
        /^(not\s+now|maybe\s+later)/i,
        /^(non)/i
      ],
      entities: [],
      examples: [
        "no",
        "cancel",
        "not now"
      ]
    }
  };

  constructor(
    private normalizerService: DialectNormalizerService
  ) {}

  recognize(text: string): IntentResult {
    const normalizedText = text.toLowerCase();
    const results: IntentResult[] = [];

    Object.keys(this.intents).forEach(intentName => {
      const intent = this.intents[intentName];
      
      intent.patterns.forEach((pattern, index) => {
        const match = normalizedText.match(pattern);
        if (match) {
          const entities = this.extractEntities(match, intent.entities, normalizedText);
          results.push({
            intent: intentName,
            confidence: this.calculateConfidence(intentName, index, match),
            entities,
            matchedPattern: pattern.toString(),
            needsClarification: false
          });
        }
      });
    });

    // Return highest confidence match
    if (results.length > 0) {
      const bestMatch = results.sort((a, b) => b.confidence - a.confidence)[0];
      
      // Check if clarification is needed
      bestMatch.needsClarification = this.needsClarification(bestMatch);
      
      return bestMatch;
    }

    // Check for partial matches or fuzzy intent
    const fuzzyIntent = this.detectFuzzyIntent(normalizedText);
    if (fuzzyIntent) {
      return fuzzyIntent;
    }

    return {
      intent: 'unknown',
      confidence: 0,
      entities: {},
      needsClarification: true
    };
  }

  private calculateConfidence(intent: string, patternIndex: number, match: RegExpMatchArray): number {
    let confidence = 0.9 - (patternIndex * 0.05);
    
    // Boost confidence for exact matches
    if (match[0].length === match.input?.length) {
      confidence += 0.05;
    }
    
    // Boost confidence for critical intents
    if (['sendFunds', 'checkBalance'].includes(intent)) {
      confidence += 0.03;
    }
    
    return Math.min(confidence, 1);
  }

  private extractEntities(
    match: RegExpMatchArray, 
    entityTypes: string[], 
    originalText: string
  ): Record<string, any> {
    const entities: Record<string, any> = {};
    
    if (entityTypes.includes('amount')) {
      // Try to extract amount from match groups or use normalizer
      const amountText = match[1] || match[2];
      if (amountText) {
        entities.amount = this.normalizerService.extractAmount(originalText) || 
                         this.parseAmount(amountText);
      }
    }
    
    if (entityTypes.includes('currency')) {
      const currencyText = match[2] || match[3];
      entities.currency = this.normalizeCurrency(currencyText) || 'USD';
    }
    
    if (entityTypes.includes('recipient')) {
      // Look for recipient in various positions
      const recipient = match[3] || match[2] || match[1];
      if (recipient && isNaN(parseInt(recipient))) {
        entities.recipient = recipient;
      } else {
        // Try to extract from original text
        entities.recipient = this.normalizerService.extractRecipient(originalText);
      }
    }
    
    if (entityTypes.includes('payer')) {
      const payer = match[3] || match[1];
      if (payer && isNaN(parseInt(payer))) {
        entities.payer = payer;
      }
    }

    return entities;
  }

  private parseAmount(amountText: string): number {
    const amountMap: Record<string, number> = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
      'twenty': 20, 'fifty': 50, 'hundred': 100, 'thousand': 1000
    };

    const normalized = amountText.toLowerCase();
    
    // Handle "bills" (hundreds)
    if (normalized.includes('bill')) {
      const number = normalized.replace(/\s*bills?\s*/, '');
      const multiplier = amountMap[number] || parseInt(number) || 1;
      return multiplier * 100;
    }

    return amountMap[normalized] || parseInt(amountText) || 0;
  }

  private normalizeCurrency(currencyText: string | undefined): string | null {
    if (!currencyText) return null;
    
    const currencyMap: Record<string, string> = {
      'dollars': 'USD',
      'dollar': 'USD',
      'bills': 'USD',
      'bill': 'USD',
      'jmd': 'JMD',
      'ttd': 'TTD',
      'bbd': 'BBD',
      'htg': 'HTG',
      'gyd': 'GYD',
      'usd': 'USD'
    };
    
    return currencyMap[currencyText.toLowerCase()] || null;
  }

  private needsClarification(result: IntentResult): boolean {
    // Send funds needs clarification for large amounts or missing entities
    if (result.intent === 'sendFunds') {
      if (!result.entities.amount || !result.entities.recipient) {
        return true;
      }
      if (result.entities.amount > 100) {
        return true;
      }
    }
    
    // Request payment needs recipient
    if (result.intent === 'requestPayment') {
      if (!result.entities.amount || !result.entities.payer) {
        return true;
      }
    }
    
    return false;
  }

  private detectFuzzyIntent(text: string): IntentResult | null {
    const lowerText = text.toLowerCase();
    
    // Check for money-related keywords
    if (lowerText.includes('send') || lowerText.includes('pay') || lowerText.includes('transfer')) {
      return {
        intent: 'sendFunds',
        confidence: 0.4,
        entities: {},
        needsClarification: true
      };
    }
    
    if (lowerText.includes('balance') || lowerText.includes('money') || lowerText.includes('wallet')) {
      return {
        intent: 'checkBalance',
        confidence: 0.5,
        entities: {},
        needsClarification: false
      };
    }
    
    if (lowerText.includes('help') || lowerText.includes('how')) {
      return {
        intent: 'help',
        confidence: 0.6,
        entities: {},
        needsClarification: false
      };
    }
    
    return null;
  }

  getSuggestedResponse(intent: string, entities: Record<string, any>): string {
    switch (intent) {
      case 'sendFunds':
        if (!entities.amount) {
          return "How much would you like to send?";
        }
        if (!entities.recipient) {
          return "Who would you like to send money to?";
        }
        return `Confirm: Send ${entities.amount} ${entities.currency || 'USD'} to ${entities.recipient}?`;
      
      case 'requestPayment':
        if (!entities.amount) {
          return "How much would you like to request?";
        }
        if (!entities.payer) {
          return "Who would you like to request money from?";
        }
        return `Request ${entities.amount} ${entities.currency || 'USD'} from ${entities.payer}?`;
      
      default:
        return "";
    }
  }
}