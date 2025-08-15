import { Injectable } from '@nestjs/common';
import { DialectClassifierService } from './dialect-classifier.service';
import { DialectNormalizerService } from './dialect-normalizer.service';
import { IntentRecognizerService } from './intent-recognizer.service';
import { GeminiAiService } from '../../gemini-ai/gemini-ai.service';
import { WhisperService } from '../../speech/whisper.service';

export interface UserContext {
  dialect: string;
  lastIntent: string | null;
  conversationHistory: ConversationEntry[];
  preferences: Record<string, any>;
  pendingTransaction?: PendingTransaction;
  lastActivity: Date;
}

export interface ConversationEntry {
  original: string;
  normalized: string;
  intent: string;
  timestamp: number;
  response?: string;
}

export interface PendingTransaction {
  type: 'send' | 'request';
  amount?: number;
  currency?: string;
  recipient?: string;
  payer?: string;
  confirmed: boolean;
  timestamp: number;
}

export interface ConversationResponse {
  response: string;
  intent: string;
  confidence: number;
  dialect: string;
  needsConfirmation: boolean;
  suggestedActions?: string[];
  voiceResponse?: boolean;
}

@Injectable()
export class ConversationManagerService {
  private contexts: Map<string, UserContext> = new Map();
  private readonly contextTimeout = 30 * 60 * 1000; // 30 minutes

  constructor(
    private dialectClassifier: DialectClassifierService,
    private dialectNormalizer: DialectNormalizerService,
    private intentRecognizer: IntentRecognizerService,
    private geminiService: GeminiAiService,
    private whisperService: WhisperService
  ) {
    // Clean up old contexts periodically
    setInterval(() => this.cleanupOldContexts(), 5 * 60 * 1000); // Every 5 minutes
  }

  async processMessage(
    userId: string, 
    message: string | Buffer, 
    messageType: 'text' | 'voice' = 'text'
  ): Promise<ConversationResponse> {
    try {
      // Get or create user context
      const context = this.getContext(userId);
      
      // Process voice messages
      let textMessage = message as string;
      if (messageType === 'voice' && Buffer.isBuffer(message)) {
        const transcribed = await this.transcribeVoice(message);
        if (!transcribed) {
          return this.createErrorResponse("Mi cyaa hear yuh properly. Please try again.", context.dialect);
        }
        textMessage = transcribed;
      }

      // Detect dialect and normalize
      const dialectResult = this.dialectClassifier.detectDialect(textMessage);
      const normalization = this.dialectNormalizer.normalize(textMessage, dialectResult.dialect);
      
      // Recognize intent
      const intentResult = this.intentRecognizer.recognize(normalization.normalized);
      
      // Update context
      this.updateContext(context, dialectResult.dialect, intentResult, normalization);

      // Check for pending transactions
      if (context.pendingTransaction) {
        return await this.handlePendingTransaction(userId, intentResult, context);
      }

      // Route to appropriate handler
      let response: ConversationResponse;
      if (intentResult.intent !== 'unknown' && intentResult.confidence > 0.7) {
        response = await this.handleIntent(userId, intentResult, context);
      } else if (intentResult.intent !== 'unknown' && intentResult.confidence > 0.4) {
        // Low confidence - ask for clarification
        response = await this.handleClarification(userId, intentResult, context);
      } else {
        response = await this.handleConversational(userId, normalization.normalized, context);
      }

      // Style response to match user's dialect
      response.response = await this.styleResponse(response.response, context.dialect);
      response.dialect = dialectResult.dialect;
      
      // Add to conversation history
      context.conversationHistory[context.conversationHistory.length - 1].response = response.response;
      
      return response;

    } catch (error) {
      console.error('Conversation processing error:', error);
      return this.createErrorResponse(
        "Sorry, something went wrong. Please try again or type 'help' for assistance.",
        'standard'
      );
    }
  }

  private async transcribeVoice(audioBuffer: Buffer): Promise<string | null> {
    try {
      const transcription = await this.whisperService.transcribeAudio(audioBuffer);
      return transcription;
    } catch (error) {
      console.error('Voice transcription error:', error);
      return null;
    }
  }

  private updateContext(
    context: UserContext,
    dialect: string,
    intentResult: any,
    normalization: any
  ): void {
    context.dialect = dialect;
    context.lastIntent = intentResult.intent;
    context.lastActivity = new Date();
    
    // Keep conversation history limited
    if (context.conversationHistory.length > 10) {
      context.conversationHistory.shift();
    }
    
    context.conversationHistory.push({
      original: normalization.original,
      normalized: normalization.normalized,
      intent: intentResult.intent,
      timestamp: Date.now()
    });
  }

  private async handleIntent(
    userId: string, 
    intentResult: any, 
    context: UserContext
  ): Promise<ConversationResponse> {
    const response: ConversationResponse = {
      response: '',
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      dialect: context.dialect,
      needsConfirmation: false
    };

    switch (intentResult.intent) {
      case 'sendFunds':
        if (intentResult.needsClarification) {
          const suggestion = this.intentRecognizer.getSuggestedResponse(
            intentResult.intent, 
            intentResult.entities
          );
          response.response = suggestion;
          response.needsConfirmation = true;
          
          // Store pending transaction
          context.pendingTransaction = {
            type: 'send',
            amount: intentResult.entities.amount,
            currency: intentResult.entities.currency,
            recipient: intentResult.entities.recipient,
            confirmed: false,
            timestamp: Date.now()
          };
        } else {
          response.response = await this.createPaymentConfirmation(intentResult.entities, context);
          response.needsConfirmation = true;
        }
        break;
      
      case 'checkBalance':
        response.response = "Let me check your balance for you...";
        response.suggestedActions = ['Check Flash balance', 'Show recent transactions'];
        break;
      
      case 'requestPayment':
        response.response = await this.createPaymentRequest(intentResult.entities, context);
        response.needsConfirmation = intentResult.needsClarification;
        break;
      
      case 'linkAccount':
        response.response = "I'll help you link your Flash account. Please follow these steps...";
        response.suggestedActions = ['Start linking process'];
        break;
      
      case 'help':
        response.response = await this.getHelpMessage(context.dialect);
        break;
      
      case 'greeting':
        response.response = await this.getGreeting(context.dialect);
        break;
      
      case 'confirmation':
        if (context.pendingTransaction) {
          response.response = "Processing your transaction...";
          response.needsConfirmation = false;
        } else {
          response.response = "Nothing to confirm right now.";
        }
        break;
      
      case 'rejection':
        if (context.pendingTransaction) {
          context.pendingTransaction = undefined;
          response.response = "Transaction cancelled.";
        } else {
          response.response = "Okay, no problem.";
        }
        break;
      
      default:
        response.response = "I understand you want to do something. Can you be more specific?";
        response.needsConfirmation = true;
    }

    return response;
  }

  private async handlePendingTransaction(
    userId: string,
    intentResult: any,
    context: UserContext
  ): Promise<ConversationResponse> {
    const response: ConversationResponse = {
      response: '',
      intent: 'pending_transaction',
      confidence: 1,
      dialect: context.dialect,
      needsConfirmation: false
    };

    // Check if user confirmed or rejected
    if (intentResult.intent === 'confirmation') {
      context.pendingTransaction!.confirmed = true;
      response.response = `Great! Processing your ${context.pendingTransaction!.type} transaction...`;
      response.suggestedActions = ['Process payment'];
      
      // Clear pending transaction
      context.pendingTransaction = undefined;
    } else if (intentResult.intent === 'rejection') {
      response.response = "Transaction cancelled. How else can I help you?";
      context.pendingTransaction = undefined;
    } else {
      // User said something else - check if it's additional info
      if (context.pendingTransaction!.type === 'send') {
        // Check for missing entities
        if (!context.pendingTransaction!.amount && intentResult.entities.amount) {
          context.pendingTransaction!.amount = intentResult.entities.amount;
        }
        if (!context.pendingTransaction!.recipient && intentResult.entities.recipient) {
          context.pendingTransaction!.recipient = intentResult.entities.recipient;
        }
        
        // Check if we have all info now
        if (context.pendingTransaction!.amount && context.pendingTransaction!.recipient) {
          response.response = await this.createPaymentConfirmation(
            context.pendingTransaction as any,
            context
          );
          response.needsConfirmation = true;
        } else {
          response.response = this.intentRecognizer.getSuggestedResponse(
            'sendFunds',
            context.pendingTransaction as any
          );
          response.needsConfirmation = true;
        }
      }
    }

    return response;
  }

  private async handleClarification(
    userId: string,
    intentResult: any,
    context: UserContext
  ): Promise<ConversationResponse> {
    const response: ConversationResponse = {
      response: '',
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      dialect: context.dialect,
      needsConfirmation: true
    };

    const clarifications: Record<string, string> = {
      sendFunds: "It looks like you want to send money. Could you specify the amount and recipient?",
      checkBalance: "Do you want to check your Flash wallet balance?",
      requestPayment: "Are you trying to request money from someone?",
      linkAccount: "Do you want to link your Flash account to WhatsApp?",
      help: "Do you need help with using Flash?"
    };

    response.response = clarifications[intentResult.intent] || 
      "I'm not quite sure what you need. Could you rephrase that?";

    return response;
  }

  private async handleConversational(
    userId: string,
    normalizedMessage: string,
    context: UserContext
  ): Promise<ConversationResponse> {
    // Use Gemini for conversational AI with Caribbean context
    const prompt = this.buildConversationalPrompt(normalizedMessage, context);
    
    try {
      const geminiResponse = await this.geminiService.generateContent(prompt);
      
      return {
        response: geminiResponse,
        intent: 'conversational',
        confidence: 0.8,
        dialect: context.dialect,
        needsConfirmation: false
      };
    } catch (error) {
      console.error('Gemini AI error:', error);
      return {
        response: "I understand, but I'm not sure how to help with that. Try 'help' to see what I can do.",
        intent: 'unknown',
        confidence: 0,
        dialect: context.dialect,
        needsConfirmation: false
      };
    }
  }

  private buildConversationalPrompt(message: string, context: UserContext): string {
    const dialectContext = context.dialect !== 'standard' 
      ? `The user speaks ${context.dialect} dialect. Respond in a friendly, natural way that resonates with Caribbean users.`
      : '';

    const recentContext = context.conversationHistory
      .slice(-3)
      .map(h => `User: ${h.original}\nIntent: ${h.intent}`)
      .join('\n');

    return `You are Pulse, a friendly AI assistant for Flash, a Caribbean Bitcoin wallet app. 
${dialectContext}

The user said: "${message}"

Recent conversation context:
${recentContext}

Respond helpfully about Bitcoin, Lightning payments, or general questions. 
Keep responses concise (2-3 sentences max) and friendly. 
If it's about payments, suggest specific commands like "send 50 dollars to John" or "check my balance".
Do not use excessive slang or stereotypes, but be warm and approachable.

Response:`;
  }

  private async styleResponse(response: string, dialect: string): Promise<string> {
    if (dialect === 'standard') return response;

    const styleMap: Record<string, Record<string, string>> = {
      jamaican: {
        'I will': 'Mi ago',
        'I am': 'Mi a',
        'you are': 'yuh a',
        'your': 'yuh',
        'cannot': 'cyaa',
        'do not': 'nuh',
        'for you': 'fi yuh',
        'Let me': 'Mek mi'
      },
      trinidadian: {
        'you all': 'allyuh',
        'cannot': 'cyah',
        'do not': 'doh',
        'Let me': 'Lemme',
        'for you': 'for yuh'
      },
      barbadian: {
        'you all': 'wunna',
        'about': 'bout',
        'around here': 'bout here',
        'really': 'real'
      },
      haitian: {
        'I will': 'Mwen pral',
        'I need': 'Mwen bezwen',
        'you': 'ou',
        'for you': 'pou ou'
      }
    };

    let styled = response;
    const mappings = styleMap[dialect] || {};
    
    // Apply selective styling - not every phrase needs to be changed
    Object.keys(mappings).forEach(english => {
      // Only replace at the beginning of sentences or in specific contexts
      const regex = new RegExp(`(^|\\. )${english}\\b`, 'gi');
      styled = styled.replace(regex, `$1${mappings[english]}`);
    });

    return styled;
  }

  private async createPaymentConfirmation(entities: any, context: UserContext): Promise<string> {
    const amount = entities.amount || 0;
    const recipient = entities.recipient || 'unknown';
    const currency = entities.currency || 'USD';

    const confirmations: Record<string, string> = {
      jamaican: `Yuh want fi send ${amount} ${currency} to ${recipient}? Reply "yes" fi confirm.`,
      trinidadian: `Allyuh sending ${amount} ${currency} to ${recipient}? Say "yes" to confirm.`,
      barbadian: `Wunna sending ${amount} ${currency} to ${recipient}? Say "yes" to confirm.`,
      haitian: `Ou vle voye ${amount} ${currency} bay ${recipient}? Di "wi" pou konfime.`,
      standard: `Send ${amount} ${currency} to ${recipient}? Reply "yes" to confirm.`
    };

    return confirmations[context.dialect] || confirmations.standard;
  }

  private async createPaymentRequest(entities: any, context: UserContext): Promise<string> {
    const amount = entities.amount || 0;
    const payer = entities.payer || 'someone';
    const currency = entities.currency || 'USD';

    const requests: Record<string, string> = {
      jamaican: `Mi ago create a request fi ${amount} ${currency} from ${payer}.`,
      trinidadian: `Creating a request for ${amount} ${currency} from ${payer}.`,
      barbadian: `Making a request for ${amount} ${currency} from ${payer}.`,
      haitian: `Map kreye yon demann pou ${amount} ${currency} nan men ${payer}.`,
      standard: `I'll create a payment request for ${amount} ${currency} from ${payer}.`
    };

    return requests[context.dialect] || requests.standard;
  }

  private async getHelpMessage(dialect: string): Promise<string> {
    const helpMessages: Record<string, string> = {
      jamaican: `Mi can help yuh with:
📱 *link* - Connect yuh Flash wallet
💰 *balance* - Check how much yuh have
💸 *send [amount] to [person]* - Send money
📥 *request [amount] from [person]* - Ask fi money
🔊 Send voice notes too!`,
      
      trinidadian: `Meh could help allyuh with:
📱 *link* - Connect yuh Flash wallet
💰 *balance* - Check yuh money
💸 *send [amount] to [person]* - Send money
📥 *request [amount] from [person]* - Request money
🔊 Voice notes working too!`,
      
      barbadian: `Wunna can do:
📱 *link* - Connect yuh Flash wallet
💰 *balance* - Check yuh balance
💸 *send [amount] to [person]* - Send money
📥 *request [amount] from [person]* - Request money
🔊 Voice notes available!`,
      
      standard: `I can help you with:
📱 *link* - Connect your Flash wallet
💰 *balance* - Check your balance
💸 *send [amount] to [person]* - Send money
📥 *request [amount] from [person]* - Request payment
🔊 Voice messages supported!`
    };

    return helpMessages[dialect] || helpMessages.standard;
  }

  private async getGreeting(dialect: string): Promise<string> {
    const greetings: Record<string, string[]> = {
      jamaican: [
        "Wah gwaan! How mi can help yuh today?",
        "Bless up! Ready fi help with yuh Flash wallet.",
        "Respect! What yuh need fi do today?"
      ],
      trinidadian: [
        "Wah happening! How meh could help allyuh?",
        "Bless! Ready to help with yuh Flash wallet.",
        "Aye! What allyuh need today?"
      ],
      barbadian: [
        "Wah gine on! How can I help wunna?",
        "Morning! Ready to help with yuh Flash wallet.",
        "Hey! What wunna need today?"
      ],
      haitian: [
        "Bonjou! Kijan mwen ka ede ou?",
        "Sak pase! Ready pou ede ou ak Flash.",
        "Alo! Kisa ou bezwen jodi a?"
      ],
      standard: [
        "Hello! How can I help you today?",
        "Hi there! Ready to help with your Flash wallet.",
        "Welcome! What can I do for you?"
      ]
    };

    const options = greetings[dialect] || greetings.standard;
    return options[Math.floor(Math.random() * options.length)];
  }

  private getContext(userId: string): UserContext {
    if (!this.contexts.has(userId)) {
      this.contexts.set(userId, {
        dialect: 'standard',
        lastIntent: null,
        conversationHistory: [],
        preferences: {},
        lastActivity: new Date()
      });
    }
    
    const context = this.contexts.get(userId)!;
    context.lastActivity = new Date();
    return context;
  }

  private cleanupOldContexts(): void {
    const now = Date.now();
    for (const [userId, context] of this.contexts.entries()) {
      if (now - context.lastActivity.getTime() > this.contextTimeout) {
        this.contexts.delete(userId);
      }
    }
  }

  private createErrorResponse(message: string, dialect: string): ConversationResponse {
    return {
      response: message,
      intent: 'error',
      confidence: 0,
      dialect,
      needsConfirmation: false
    };
  }

  // Public methods for external use
  getUserDialect(userId: string): string {
    const context = this.contexts.get(userId);
    return context?.dialect || 'standard';
  }

  clearUserContext(userId: string): void {
    this.contexts.delete(userId);
  }

  getPendingTransaction(userId: string): PendingTransaction | undefined {
    const context = this.contexts.get(userId);
    return context?.pendingTransaction;
  }
}