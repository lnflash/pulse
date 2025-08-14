import { Test, TestingModule } from '@nestjs/testing';
import { DialectClassifierService } from '../services/dialect-classifier.service';
import { DialectNormalizerService } from '../services/dialect-normalizer.service';
import { IntentRecognizerService } from '../services/intent-recognizer.service';
import { ConversationManagerService } from '../services/conversation-manager.service';
import { EnhancedPaymentFlowService } from '../services/enhanced-payment-flow.service';
import { FlashApiService } from '../../flash-api/flash-api.service';
import { GeminiAiService } from '../../gemini-ai/gemini-ai.service';
import { WhisperService } from '../../speech/whisper.service';

describe('Dialect AI Integration Tests', () => {
  let dialectClassifier: DialectClassifierService;
  let dialectNormalizer: DialectNormalizerService;
  let intentRecognizer: IntentRecognizerService;
  let conversationManager: ConversationManagerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DialectClassifierService,
        DialectNormalizerService,
        IntentRecognizerService,
        {
          provide: ConversationManagerService,
          useValue: {
            processMessage: jest.fn(),
            getContext: jest.fn(),
            getUserDialect: jest.fn(),
            clearUserContext: jest.fn(),
            getPendingTransaction: jest.fn()
          }
        },
        {
          provide: EnhancedPaymentFlowService,
          useValue: {
            handleSendFunds: jest.fn(),
            handleCheckBalance: jest.fn(),
            handleRequestPayment: jest.fn()
          }
        },
        {
          provide: FlashApiService,
          useValue: {
            getBalance: jest.fn(),
            sendPayment: jest.fn(),
            createInvoice: jest.fn(),
            checkUsernameExists: jest.fn()
          }
        },
        {
          provide: GeminiAiService,
          useValue: {
            generateContent: jest.fn()
          }
        },
        {
          provide: WhisperService,
          useValue: {
            transcribeAudio: jest.fn()
          }
        }
      ]
    }).compile();

    dialectClassifier = module.get<DialectClassifierService>(DialectClassifierService);
    dialectNormalizer = module.get<DialectNormalizerService>(DialectNormalizerService);
    intentRecognizer = module.get<IntentRecognizerService>(IntentRecognizerService);
    conversationManager = module.get<ConversationManagerService>(ConversationManagerService);
  });

  describe('Dialect Classification', () => {
    it('should detect Jamaican Patois', () => {
      const testPhrases = [
        'Mi waan send two bills to Sean',
        'Check mi money fi mi',
        'Weh yuh deh pon?',
        'Mi cyaa understand dat'
      ];

      testPhrases.forEach(phrase => {
        const result = dialectClassifier.detectDialect(phrase);
        expect(result.dialect).toBe('jamaican');
        expect(result.confidence).toBeGreaterThan(0.5);
      });
    });

    it('should detect Trinidadian dialect', () => {
      const testPhrases = [
        'Allyuh send meh 100 dollars',
        'Cyah believe di price',
        'Doh worry bout dat'
      ];

      testPhrases.forEach(phrase => {
        const result = dialectClassifier.detectDialect(phrase);
        expect(result.dialect).toBe('trinidadian');
        expect(result.confidence).toBeGreaterThan(0.5);
      });
    });

    it('should detect Haitian Kreyòl', () => {
      const testPhrases = [
        'Mwen vle voye kob bay Marie',
        'Kijan ou ye?',
        'Mwen bezwen 50 dola'
      ];

      testPhrases.forEach(phrase => {
        const result = dialectClassifier.detectDialect(phrase);
        expect(result.dialect).toBe('haitian');
        expect(result.confidence).toBeGreaterThan(0.5);
      });
    });

    it('should detect standard English', () => {
      const testPhrases = [
        'Send 100 dollars to John',
        'Check my balance',
        'How much do I have?'
      ];

      testPhrases.forEach(phrase => {
        const result = dialectClassifier.detectDialect(phrase);
        expect(result.dialect).toBe('standard');
      });
    });
  });

  describe('Dialect Normalization', () => {
    it('should normalize Jamaican Patois to standard English', () => {
      const testCases = [
        {
          input: 'mi waan send two bills to Maria',
          expected: 'I want send 200 dollars to Maria'
        },
        {
          input: 'check mi money',
          expected: 'Check my money'
        },
        {
          input: 'sen mi 50 dollars',
          expected: 'Send me 50 dollars'
        }
      ];

      testCases.forEach(test => {
        const result = dialectNormalizer.normalize(test.input, 'jamaican');
        expect(result.normalized.toLowerCase()).toContain(test.expected.toLowerCase());
      });
    });

    it('should normalize currency expressions', () => {
      const testCases = [
        { input: 'five bills', expected: '500 dollars' },
        { input: '100 JMD', expected: '100 Jamaican dollars' },
        { input: 'two TTD', expected: '2 Trinidad dollars' }
      ];

      testCases.forEach(test => {
        const result = dialectNormalizer.normalize(test.input);
        expect(result.normalized.toLowerCase()).toContain(test.expected.toLowerCase());
      });
    });

    it('should extract amounts correctly', () => {
      expect(dialectNormalizer.extractAmount('send two bills')).toBe(200);
      expect(dialectNormalizer.extractAmount('transfer 50 dollars')).toBe(50);
      expect(dialectNormalizer.extractAmount('five hundred')).toBe(500);
    });

    it('should extract recipients correctly', () => {
      expect(dialectNormalizer.extractRecipient('send money to John')).toBe('John');
      expect(dialectNormalizer.extractRecipient('pay Sarah 100')).toBe('Sarah');
      expect(dialectNormalizer.extractRecipient('voye kob bay Pierre')).toBe('Pierre');
    });
  });

  describe('Intent Recognition', () => {
    it('should recognize send funds intent', () => {
      const testPhrases = [
        'send 100 dollars to John',
        'transfer two bills to Maria',
        'pay Sean 50 USD',
        'voye 100 kob bay Marie'
      ];

      testPhrases.forEach(phrase => {
        const result = intentRecognizer.recognize(phrase);
        expect(result.intent).toBe('sendFunds');
        expect(result.confidence).toBeGreaterThan(0.7);
      });
    });

    it('should recognize check balance intent', () => {
      const testPhrases = [
        'check my balance',
        'how much I have',
        'show mi money',
        'wallet balance'
      ];

      testPhrases.forEach(phrase => {
        const result = intentRecognizer.recognize(phrase);
        expect(result.intent).toBe('checkBalance');
        expect(result.confidence).toBeGreaterThan(0.7);
      });
    });

    it('should extract entities from send commands', () => {
      const result = intentRecognizer.recognize('send 200 dollars to Sarah');
      expect(result.entities.amount).toBe(200);
      expect(result.entities.currency).toBe('USD');
      expect(result.entities.recipient).toBe('Sarah');
    });

    it('should handle fuzzy intent detection', () => {
      const result = intentRecognizer.recognize('money to John');
      expect(result.intent).toBe('sendFunds');
      expect(result.confidence).toBeLessThan(0.7);
      expect(result.needsClarification).toBe(true);
    });

    it('should recognize greeting intent', () => {
      const greetings = [
        'hello',
        'wah gwaan',
        'bless up',
        'good morning',
        'bonjou'
      ];

      greetings.forEach(greeting => {
        const result = intentRecognizer.recognize(greeting);
        expect(result.intent).toBe('greeting');
      });
    });
  });

  describe('Caribbean Context Integration', () => {
    it('should handle complete Jamaican conversation flow', () => {
      const conversation = [
        { input: 'wah gwaan', expectedIntent: 'greeting' },
        { input: 'mi waan send two bills to Sean', expectedIntent: 'sendFunds' },
        { input: 'yes', expectedIntent: 'confirmation' },
        { input: 'check mi balance now', expectedIntent: 'checkBalance' }
      ];

      conversation.forEach(turn => {
        const dialectResult = dialectClassifier.detectDialect(turn.input);
        const normalized = dialectNormalizer.normalize(turn.input, dialectResult.dialect);
        const intent = intentRecognizer.recognize(normalized.normalized);
        
        expect(intent.intent).toBe(turn.expectedIntent);
      });
    });

    it('should handle mixed dialect conversation', () => {
      const mixedPhrases = [
        { input: 'Allyuh help meh send money', dialect: 'trinidadian' },
        { input: 'Mwen bezwen voye kob', dialect: 'haitian' },
        { input: 'Wunna got my balance?', dialect: 'barbadian' }
      ];

      mixedPhrases.forEach(phrase => {
        const result = dialectClassifier.detectDialect(phrase.input);
        expect(result.dialect).toBe(phrase.dialect);
      });
    });
  });

  describe('Payment Flow Validation', () => {
    it('should require confirmation for large amounts', () => {
      const result = intentRecognizer.recognize('send 500 dollars to John');
      expect(result.intent).toBe('sendFunds');
      expect(result.entities.amount).toBe(500);
      expect(result.needsClarification).toBe(true); // Large amount
    });

    it('should handle bills conversion correctly', () => {
      const result = intentRecognizer.recognize('send five bills to Maria');
      expect(result.intent).toBe('sendFunds');
      expect(result.entities.amount).toBe(500);
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown intent gracefully', () => {
      const result = intentRecognizer.recognize('random gibberish text');
      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBe(0);
      expect(result.needsClarification).toBe(true);
    });

    it('should handle empty input', () => {
      const result = intentRecognizer.recognize('');
      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBe(0);
    });
  });
});

describe('Dialect Currency Mapping', () => {
  let dialectClassifier: DialectClassifierService;

  beforeEach(() => {
    dialectClassifier = new DialectClassifierService();
  });

  it('should map dialects to correct currencies', () => {
    expect(dialectClassifier.getDialectCurrency('jamaican')).toBe('JMD');
    expect(dialectClassifier.getDialectCurrency('trinidadian')).toBe('TTD');
    expect(dialectClassifier.getDialectCurrency('barbadian')).toBe('BBD');
    expect(dialectClassifier.getDialectCurrency('haitian')).toBe('HTG');
    expect(dialectClassifier.getDialectCurrency('guyanese')).toBe('GYD');
    expect(dialectClassifier.getDialectCurrency('standard')).toBe('USD');
    expect(dialectClassifier.getDialectCurrency('unknown')).toBe('USD');
  });
});