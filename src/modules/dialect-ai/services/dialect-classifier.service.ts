import { Injectable } from '@nestjs/common';

export interface DialectPattern {
  keywords: string[];
  patterns: RegExp[];
  currency: string[];
}

export interface DialectResult {
  dialect: string;
  confidence: number;
  scores: Record<string, number>;
}

@Injectable()
export class DialectClassifierService {
  private dialectPatterns: Record<string, DialectPattern> = {
    jamaican: {
      keywords: ['mi', 'seh', 'yuh', 'dem', 'weh', 'nuh', 'mek', 'ting', 'yaad', 'gwaan', 'waan', 'cyaa', 'fi', 'pon', 'deh'],
      patterns: [
        /mi\s+(a|waa|nah|cyaa|need|want)/i,
        /yuh\s+(know|see|hear|have)/i,
        /weh\s+(yuh|dem|mi|di)/i,
        /nuh\s+(worry|stress|bother)/i,
        /fi\s+(do|send|check|get)/i,
        /pon\s+(di|my|yuh)/i
      ],
      currency: ['JMD', 'jamaican dollar', 'bills', 'jay']
    },
    trinidadian: {
      keywords: ['allyuh', 'cyah', 'doh', 'gyul', 'lime', 'tabanca', 'bacchanal', 'meh', 'fete', 'vex', 'steups'],
      patterns: [
        /allyuh\s+/i,
        /cyah\s+(believe|understand|take)/i,
        /doh\s+(worry|stress|mind)/i,
        /real\s+(talk|ting)/i,
        /meh\s+(want|need|go)/i
      ],
      currency: ['TTD', 'trinidad dollar', 'trini', 'tt']
    },
    barbadian: {
      keywords: ['wunna', 'bout', 'bout here', 'real', 'lime', 'cuh dear', 'cheese on', 'nuff', 'pun'],
      patterns: [
        /wunna\s+/i,
        /bout\s+(here|ya|dey)/i,
        /real\s+(talk|ting|good)/i,
        /cuh\s+(dear|look)/i,
        /pun\s+(di|my|yuh)/i
      ],
      currency: ['BBD', 'bajan dollar', 'barbados', 'bds']
    },
    haitian: {
      keywords: ['mwen', 'ou', 'nou', 'li', 'yo', 'kijan', 'poukisa', 'voye', 'kob', 'bay', 'gen', 'vle', 'bezwen'],
      patterns: [
        /mwen\s+(vle|bezwen|gen|ka)/i,
        /kijan\s+(ou|w|li)/i,
        /poukisa\s+/i,
        /voye\s+(kob|lajan)/i,
        /bay\s+(mwen|ou|li)/i
      ],
      currency: ['HTG', 'gourde', 'haitian', 'goud']
    },
    guyanese: {
      keywords: ['bai', 'gyal', 'rass', 'wah', 'deh', 'meh', 'nah', 'pon', 'abbie', 'ah'],
      patterns: [
        /wah\s+(yuh|happen|goin)/i,
        /meh\s+(wan|need|gah)/i,
        /nah\s+(worry|stress)/i,
        /ah\s+(go|come|wan)/i
      ],
      currency: ['GYD', 'guyana dollar', 'guy']
    }
  };

  detectDialect(text: string): DialectResult {
    const scores: Record<string, number> = {};
    const normalizedText = text.toLowerCase();

    Object.keys(this.dialectPatterns).forEach(dialect => {
      let score = 0;
      const config = this.dialectPatterns[dialect];

      // Keyword matching with weighted scoring
      config.keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = normalizedText.match(regex);
        if (matches) {
          score += matches.length * 2;
        }
      });

      // Pattern matching with higher weight
      config.patterns.forEach(pattern => {
        if (pattern.test(normalizedText)) {
          score += 3;
        }
      });

      // Currency context detection
      config.currency.forEach(curr => {
        if (normalizedText.includes(curr.toLowerCase())) {
          score += 1;
        }
      });

      scores[dialect] = score;
    });

    // Find the highest scoring dialect
    let topDialect = 'standard';
    let maxScore = 0;
    
    Object.keys(scores).forEach(dialect => {
      if (scores[dialect] > maxScore) {
        maxScore = scores[dialect];
        topDialect = dialect;
      }
    });

    // Calculate confidence based on score threshold
    const confidence = maxScore > 0 ? Math.min(maxScore / 10, 1) : 0;

    return {
      dialect: maxScore > 2 ? topDialect : 'standard',
      confidence,
      scores
    };
  }

  getDialectCurrency(dialect: string): string {
    const currencyMap: Record<string, string> = {
      jamaican: 'JMD',
      trinidadian: 'TTD',
      barbadian: 'BBD',
      haitian: 'HTG',
      guyanese: 'GYD',
      standard: 'USD'
    };

    return currencyMap[dialect] || 'USD';
  }

  isCaribbean(text: string): boolean {
    const result = this.detectDialect(text);
    return result.dialect !== 'standard' && result.confidence > 0.5;
  }
}