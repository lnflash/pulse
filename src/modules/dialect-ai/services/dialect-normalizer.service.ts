import { Injectable } from '@nestjs/common';

export interface NormalizationResult {
  original: string;
  normalized: string;
  dialect: string;
  changes: string[];
}

@Injectable()
export class DialectNormalizerService {
  private translations: Record<string, string> = {
    // Jamaican Patois -> Standard English
    'mi waa': 'I want',
    'mi waan': 'I want',
    'mi need': 'I need',
    'mi have': 'I have',
    'mi cyaa': 'I cannot',
    'mi nuh': 'I do not',
    'yuh have': 'you have',
    'yuh know': 'you know',
    'yuh see': 'you see',
    'dem seh': 'they said',
    'dem have': 'they have',
    'weh mi': 'where is my',
    'weh yuh': 'where are you',
    'weh di': 'where is the',
    'how much': 'how much',
    'sen mi': 'send me',
    'sen to': 'send to',
    'sen fi': 'send for',
    'check mi': 'check my',
    'fi mi': 'for me',
    'fi yuh': 'for you',
    'fi dem': 'for them',
    'pon di': 'on the',
    'pon mi': 'on my',
    'nuh worry': 'do not worry',
    'nuh bother': 'do not bother',
    'gwaan good': 'going well',
    
    // Common bills terminology
    'two bills': '200 dollars',
    'one bill': '100 dollars',
    'five bills': '500 dollars',
    'ten bills': '1000 dollars',
    
    // Wallet terminology
    'bitcoin ting': 'bitcoin wallet',
    'flash ting': 'flash wallet',
    'wallet ting': 'wallet',
    'money ting': 'money transfer',
    
    // Trinidadian
    'allyuh': 'you all',
    'cyah': 'cannot',
    'doh worry': 'do not worry',
    'doh mind': 'do not mind',
    'lime': 'hang out',
    'send meh': 'send me',
    'check meh': 'check my',
    'for meh': 'for me',
    'real talk': 'seriously',
    
    // Barbadian
    'wunna': 'you all',
    'bout here': 'around here',
    'bout ya': 'around here',
    'cuh dear': 'look here',
    'cuh look': 'look at',
    'pun di': 'on the',
    'pun mi': 'on my',
    
    // Haitian Kreyòl
    'mwen vle': 'I want',
    'mwen bezwen': 'I need',
    'mwen gen': 'I have',
    'ou vle': 'you want',
    'ou gen': 'you have',
    'kijan': 'how',
    'poukisa': 'why',
    'voye': 'send',
    'kob': 'money',
    'lajan': 'money',
    'bay mwen': 'give me',
    'bay ou': 'give you',
    
    // Guyanese
    'wah happen': 'what happened',
    'wah yuh': 'what are you',
    'meh wan': 'I want',
    'meh need': 'I need',
    'meh gah': 'I have to',
    'nah worry': 'do not worry',
    'ah wan': 'I want',
    'ah need': 'I need',
    'ah go': 'I will'
  };

  private currencyMappings: Record<string, string> = {
    'bills': 'dollars',
    'JMD': 'Jamaican dollars',
    'TTD': 'Trinidad dollars',
    'BBD': 'Barbados dollars',
    'HTG': 'Haitian gourdes',
    'GYD': 'Guyana dollars',
    'USD': 'US dollars',
    'jay': 'JMD',
    'trini': 'TTD',
    'bajan': 'BBD',
    'goud': 'HTG',
    'guy': 'GYD'
  };

  private amountWords: Record<string, number> = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
    'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
    'hundred': 100, 'thousand': 1000
  };

  normalize(text: string, dialect: string = 'standard'): NormalizationResult {
    let normalized = text.toLowerCase();
    const changes: string[] = [];

    // Apply phrase translations
    Object.keys(this.translations).forEach(phrase => {
      const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
      if (regex.test(normalized)) {
        normalized = normalized.replace(regex, this.translations[phrase]);
        changes.push(`"${phrase}" -> "${this.translations[phrase]}"`);
      }
    });

    // Normalize currency terms
    Object.keys(this.currencyMappings).forEach(curr => {
      const regex = new RegExp(`\\b${curr}\\b`, 'gi');
      if (regex.test(normalized)) {
        normalized = normalized.replace(regex, this.currencyMappings[curr]);
        changes.push(`"${curr}" -> "${this.currencyMappings[curr]}"`);
      }
    });

    // Normalize amount expressions
    normalized = this.normalizeAmounts(normalized);

    // Clean up grammar and structure
    normalized = this.improveGrammar(normalized);

    // Capitalize first letter
    normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);

    return {
      original: text,
      normalized,
      dialect,
      changes
    };
  }

  private normalizeAmounts(text: string): string {
    let normalized = text;

    // Handle "X bills" pattern (e.g., "five bills" -> "500 dollars")
    const billsPattern = /(\w+)\s+bills?\b/gi;
    normalized = normalized.replace(billsPattern, (match, amount) => {
      const numValue = this.amountWords[amount.toLowerCase()];
      if (numValue) {
        return `${numValue * 100} dollars`;
      }
      const parsed = parseInt(amount);
      if (!isNaN(parsed)) {
        return `${parsed * 100} dollars`;
      }
      return match;
    });

    // Handle word numbers
    Object.keys(this.amountWords).forEach(word => {
      const regex = new RegExp(`\\b${word}\\s+(dollar|JMD|TTD|BBD|HTG|GYD)`, 'gi');
      normalized = normalized.replace(regex, `${this.amountWords[word]} $1`);
    });

    return normalized;
  }

  private improveGrammar(text: string): string {
    let improved = text
      // Fix spacing
      .replace(/\s+/g, ' ')
      // Fix common grammar patterns
      .replace(/\bi\b/g, 'I')
      .replace(/\bim\b/g, "I'm")
      .replace(/\bdont\b/g, "don't")
      .replace(/\bcant\b/g, "can't")
      .replace(/\bwont\b/g, "won't")
      // Fix possessives
      .replace(/\byous\b/g, "your")
      .replace(/\burs\b/g, "our")
      // Remove redundant words
      .replace(/\b(di|de)\s+(the|a)\b/g, '$2')
      .trim();

    return improved;
  }

  extractAmount(text: string): number | null {
    const normalized = text.toLowerCase();
    
    // Check for numeric amounts
    const numericMatch = normalized.match(/(\d+(?:\.\d+)?)/);
    if (numericMatch) {
      return parseFloat(numericMatch[1]);
    }

    // Check for word amounts
    for (const [word, value] of Object.entries(this.amountWords)) {
      if (normalized.includes(word)) {
        // Check if it's bills
        if (normalized.includes('bill')) {
          return value * 100;
        }
        return value;
      }
    }

    return null;
  }

  extractRecipient(text: string): string | null {
    const patterns = [
      /send\s+.*?\s+to\s+(\w+)/i,
      /pay\s+(\w+)/i,
      /transfer\s+.*?\s+to\s+(\w+)/i,
      /voye\s+.*?\s+bay\s+(\w+)/i,
      /sen\s+.*?\s+to\s+(\w+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }
}