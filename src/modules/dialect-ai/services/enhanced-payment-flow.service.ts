import { Injectable } from '@nestjs/common';
import { FlashApiService } from '../../flash-api/flash-api.service';
import { ConversationManagerService, UserContext } from './conversation-manager.service';
import { DialectClassifierService } from './dialect-classifier.service';

export interface PaymentFlowResult {
  success: boolean;
  message: string;
  transactionId?: string;
  needsConfirmation?: boolean;
  suggestedActions?: string[];
}

export interface PaymentValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

@Injectable()
export class EnhancedPaymentFlowService {
  private readonly largeAmountThreshold = 100;
  private readonly criticalAmountThreshold = 500;

  constructor(
    private flashApiService: FlashApiService,
    private conversationManager: ConversationManagerService,
    private dialectClassifier: DialectClassifierService
  ) {}

  async handleSendFunds(
    userId: string,
    entities: any,
    context: UserContext
  ): Promise<PaymentFlowResult> {
    const { amount, recipient, currency = 'USD' } = entities;
    
    // Validation
    const validation = await this.validatePayment(userId, amount, recipient, currency);
    if (!validation.isValid) {
      return {
        success: false,
        message: this.getValidationMessage(validation.errors[0], context.dialect),
        needsConfirmation: false
      };
    }

    // Check for warnings (large amounts)
    if (validation.warnings.length > 0) {
      return {
        success: false,
        message: this.getWarningMessage(amount, recipient, context.dialect),
        needsConfirmation: true,
        suggestedActions: ['Confirm transaction', 'Cancel']
      };
    }

    // Check balance
    const balanceCheck = await this.checkSufficientBalance(userId, amount, currency);
    if (!balanceCheck.sufficient) {
      return {
        success: false,
        message: this.getInsufficientFundsMessage(
          balanceCheck.available,
          amount,
          currency,
          context.dialect
        ),
        needsConfirmation: false
      };
    }

    // Process payment
    try {
      const result = await this.processPayment(userId, recipient, amount, currency);
      
      if (result.success) {
        return {
          success: true,
          message: this.getSuccessMessage(amount, recipient, currency, context.dialect),
          transactionId: result.transactionId,
          suggestedActions: ['Check balance', 'Send another payment']
        };
      } else {
        return {
          success: false,
          message: this.getErrorMessage(result.error, context.dialect),
          needsConfirmation: false
        };
      }
    } catch (error) {
      console.error('Payment processing error:', error);
      return {
        success: false,
        message: this.getErrorMessage('processing_failed', context.dialect),
        needsConfirmation: false
      };
    }
  }

  async handleRequestPayment(
    userId: string,
    entities: any,
    context: UserContext
  ): Promise<PaymentFlowResult> {
    const { amount, payer, currency = 'USD' } = entities;
    
    // Validation
    if (!amount || amount <= 0) {
      return {
        success: false,
        message: this.getAmountClarification(context.dialect),
        needsConfirmation: true
      };
    }
    
    if (!payer) {
      return {
        success: false,
        message: this.getPayerClarification(context.dialect),
        needsConfirmation: true
      };
    }

    try {
      // Create invoice/payment request
      const invoice = await this.createPaymentRequest(userId, payer, amount, currency);
      
      if (invoice.success) {
        return {
          success: true,
          message: this.getRequestSuccessMessage(amount, payer, currency, context.dialect),
          transactionId: invoice.invoiceId,
          suggestedActions: ['Check request status', 'Create another request']
        };
      } else {
        return {
          success: false,
          message: this.getRequestErrorMessage(invoice.error, context.dialect),
          needsConfirmation: false
        };
      }
    } catch (error) {
      console.error('Payment request error:', error);
      return {
        success: false,
        message: this.getErrorMessage('request_failed', context.dialect),
        needsConfirmation: false
      };
    }
  }

  async handleCheckBalance(userId: string, context: UserContext): Promise<PaymentFlowResult> {
    try {
      const balance = await this.flashApiService.getBalance(userId);
      
      if (balance !== null && balance !== undefined) {
        const currency = this.dialectClassifier.getDialectCurrency(context.dialect);
        const formattedBalance = this.formatBalance(balance, currency);
        
        return {
          success: true,
          message: this.getBalanceMessage(formattedBalance, context.dialect),
          suggestedActions: ['Send money', 'Request payment', 'View transactions']
        };
      } else {
        return {
          success: false,
          message: this.getBalanceErrorMessage(context.dialect),
          needsConfirmation: false,
          suggestedActions: ['Link account', 'Try again']
        };
      }
    } catch (error) {
      console.error('Balance check error:', error);
      return {
        success: false,
        message: this.getErrorMessage('balance_check_failed', context.dialect),
        needsConfirmation: false
      };
    }
  }

  private async validatePayment(
    userId: string,
    amount: number,
    recipient: string,
    currency: string
  ): Promise<PaymentValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate amount
    if (!amount || amount <= 0) {
      errors.push('invalid_amount');
    }

    // Validate recipient
    if (!recipient || recipient.trim().length === 0) {
      errors.push('invalid_recipient');
    }

    // Check for large amounts
    if (amount > this.largeAmountThreshold) {
      warnings.push('large_amount');
    }

    if (amount > this.criticalAmountThreshold) {
      warnings.push('critical_amount');
    }

    // Validate recipient exists (if possible)
    try {
      const recipientExists = await this.checkRecipientExists(recipient);
      if (!recipientExists) {
        warnings.push('unknown_recipient');
      }
    } catch (error) {
      // Log but don't fail validation
      console.warn('Could not verify recipient:', error);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async checkSufficientBalance(
    userId: string,
    amount: number,
    currency: string
  ): Promise<{ sufficient: boolean; available: number }> {
    try {
      const balance = await this.flashApiService.getBalance(userId);
      
      // Convert amount if needed based on currency
      const requiredAmount = this.convertToSats(amount, currency);
      
      return {
        sufficient: balance >= requiredAmount,
        available: balance
      };
    } catch (error) {
      console.error('Balance check error:', error);
      return { sufficient: false, available: 0 };
    }
  }

  private async processPayment(
    userId: string,
    recipient: string,
    amount: number,
    currency: string
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      // Convert amount to sats if needed
      const satsAmount = this.convertToSats(amount, currency);
      
      // Process through Flash API
      const result = await this.flashApiService.sendPayment(
        userId,
        recipient,
        satsAmount,
        `Payment of ${amount} ${currency} to ${recipient}`
      );
      
      return {
        success: true,
        transactionId: result.paymentHash || 'pending'
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'payment_failed'
      };
    }
  }

  private async createPaymentRequest(
    userId: string,
    payer: string,
    amount: number,
    currency: string
  ): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
    try {
      // Convert amount to sats if needed
      const satsAmount = this.convertToSats(amount, currency);
      
      // Create invoice through Flash API
      const invoice = await this.flashApiService.createInvoice(
        satsAmount,
        `Payment request from ${userId} to ${payer} for ${amount} ${currency}`
      );
      
      return {
        success: true,
        invoiceId: invoice.paymentRequest
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'request_failed'
      };
    }
  }

  private async checkRecipientExists(recipient: string): Promise<boolean> {
    try {
      // Check if recipient is a valid username or wallet
      const exists = await this.flashApiService.checkUsernameExists(recipient);
      return exists;
    } catch (error) {
      return false;
    }
  }

  private convertToSats(amount: number, currency: string): number {
    // Simplified conversion - in production, use real exchange rates
    const rates: Record<string, number> = {
      'USD': 30000, // 1 USD = 30000 sats (example)
      'JMD': 200,    // 1 JMD = 200 sats
      'TTD': 4500,   // 1 TTD = 4500 sats
      'BBD': 15000,  // 1 BBD = 15000 sats
      'HTG': 250,    // 1 HTG = 250 sats
      'GYD': 150     // 1 GYD = 150 sats
    };
    
    const rate = rates[currency] || rates['USD'];
    return Math.round(amount * rate);
  }

  private formatBalance(balanceSats: number, currency: string): string {
    // Convert sats to local currency for display
    const rates: Record<string, number> = {
      'USD': 30000,
      'JMD': 200,
      'TTD': 4500,
      'BBD': 15000,
      'HTG': 250,
      'GYD': 150
    };
    
    const rate = rates[currency] || rates['USD'];
    const localAmount = (balanceSats / rate).toFixed(2);
    
    return `${localAmount} ${currency}`;
  }

  // Message generation methods
  private getValidationMessage(error: string, dialect: string): string {
    const messages: Record<string, Record<string, string>> = {
      invalid_amount: {
        jamaican: "Mi need fi know di exact amount yuh waan send.",
        trinidadian: "Tell meh exactly how much yuh want to send.",
        barbadian: "Wunna need to say the exact amount.",
        haitian: "Mwen bezwen konnen kantite egzak ou vle voye.",
        standard: "Please specify a valid amount to send."
      },
      invalid_recipient: {
        jamaican: "Mi need fi know who yuh sending di money to.",
        trinidadian: "Who yuh sending di money to?",
        barbadian: "Who wunna sending money to?",
        haitian: "Ki moun ki ap resevwa kob la?",
        standard: "Please specify who you want to send money to."
      }
    };
    
    return messages[error]?.[dialect] || messages[error]?.standard || "Invalid payment details.";
  }

  private getWarningMessage(amount: number, recipient: string, dialect: string): string {
    const messages: Record<string, string> = {
      jamaican: `Yuh sure yuh waan send ${amount} to ${recipient}? Dat a nuff money. Reply "yes" fi confirm.`,
      trinidadian: `Yuh sure yuh want to send ${amount} to ${recipient}? That real money. Say "yes" to confirm.`,
      barbadian: `Wunna sure bout sending ${amount} to ${recipient}? That's real money. Say "yes" to confirm.`,
      haitian: `Ou sèten ou vle voye ${amount} bay ${recipient}? Sa se anpil kob. Di "wi" pou konfime.`,
      standard: `Are you sure you want to send ${amount} to ${recipient}? This is a large amount. Reply "yes" to confirm.`
    };
    
    return messages[dialect] || messages.standard;
  }

  private getInsufficientFundsMessage(
    available: number,
    requested: number,
    currency: string,
    dialect: string
  ): string {
    const availableFormatted = this.formatBalance(available, currency);
    
    const messages: Record<string, string> = {
      jamaican: `Yuh nuh have enough money. Yuh have ${availableFormatted} but need ${requested} ${currency}.`,
      trinidadian: `Yuh ain't have enough money. Yuh have ${availableFormatted} but need ${requested} ${currency}.`,
      barbadian: `Wunna ain't got enough money. Got ${availableFormatted} but need ${requested} ${currency}.`,
      haitian: `Ou pa gen ase kob. Ou gen ${availableFormatted} men ou bezwen ${requested} ${currency}.`,
      standard: `Insufficient funds. You have ${availableFormatted} but need ${requested} ${currency}.`
    };
    
    return messages[dialect] || messages.standard;
  }

  private getSuccessMessage(
    amount: number,
    recipient: string,
    currency: string,
    dialect: string
  ): string {
    const messages: Record<string, string> = {
      jamaican: `Done! Mi send ${amount} ${currency} to ${recipient}. Check yuh wallet fi confirm.`,
      trinidadian: `All good! Meh send ${amount} ${currency} to ${recipient}. Check yuh wallet.`,
      barbadian: `Real nice! Sent ${amount} ${currency} to ${recipient}. Check yuh wallet.`,
      haitian: `Bon! Mwen voye ${amount} ${currency} bay ${recipient}. Gade nan wallet ou.`,
      standard: `Success! Sent ${amount} ${currency} to ${recipient}. Check your wallet for confirmation.`
    };
    
    return messages[dialect] || messages.standard;
  }

  private getErrorMessage(error: string, dialect: string): string {
    const messages: Record<string, Record<string, string>> = {
      processing_failed: {
        jamaican: "Something gaan wrong. Try again likkle bit.",
        trinidadian: "Something went wrong. Try again in a bit.",
        barbadian: "Something went wrong. Try again later.",
        haitian: "Gen yon pwoblèm. Eseye ankò.",
        standard: "Payment processing failed. Please try again."
      },
      payment_failed: {
        jamaican: "Di payment neva go through. Check and try again.",
        trinidadian: "Di payment didn't work. Check and try again.",
        barbadian: "Payment didn't go through. Check and try again.",
        haitian: "Peman an pa pase. Verifye epi eseye ankò.",
        standard: "Payment failed. Please check and try again."
      }
    };
    
    return messages[error]?.[dialect] || messages[error]?.standard || "An error occurred. Please try again.";
  }

  private getAmountClarification(dialect: string): string {
    const messages: Record<string, string> = {
      jamaican: "How much yuh waan send? Tell mi di amount.",
      trinidadian: "How much yuh want to send? Tell meh di amount.",
      barbadian: "How much wunna want to send? Tell me the amount.",
      haitian: "Konbyen ou vle voye? Di mwen kantite a.",
      standard: "How much would you like to send? Please specify the amount."
    };
    
    return messages[dialect] || messages.standard;
  }

  private getPayerClarification(dialect: string): string {
    const messages: Record<string, string> = {
      jamaican: "Who yuh requesting di money from?",
      trinidadian: "Who yuh requesting money from?",
      barbadian: "Who wunna requesting money from?",
      haitian: "Ki moun ou ap mande kob la?",
      standard: "Who would you like to request money from?"
    };
    
    return messages[dialect] || messages.standard;
  }

  private getRequestSuccessMessage(
    amount: number,
    payer: string,
    currency: string,
    dialect: string
  ): string {
    const messages: Record<string, string> = {
      jamaican: `Payment request fi ${amount} ${currency} sent to ${payer}. Dem wi get di message.`,
      trinidadian: `Payment request for ${amount} ${currency} sent to ${payer}. They go get it.`,
      barbadian: `Payment request for ${amount} ${currency} sent to ${payer}. They getting it.`,
      haitian: `Demann peman ${amount} ${currency} voye bay ${payer}. Yap resevwa li.`,
      standard: `Payment request for ${amount} ${currency} sent to ${payer}. They'll receive the notification.`
    };
    
    return messages[dialect] || messages.standard;
  }

  private getRequestErrorMessage(error: string | undefined, dialect: string): string {
    const messages: Record<string, string> = {
      jamaican: "Couldn't create di payment request. Try again.",
      trinidadian: "Couldn't create di payment request. Try again.",
      barbadian: "Couldn't create the payment request. Try again.",
      haitian: "Pa kapab kreye demann peman an. Eseye ankò.",
      standard: "Could not create payment request. Please try again."
    };
    
    return messages[dialect] || messages.standard;
  }

  private getBalanceMessage(balance: string, dialect: string): string {
    const messages: Record<string, string> = {
      jamaican: `Yuh Flash wallet balance: ${balance}`,
      trinidadian: `Yuh Flash wallet balance: ${balance}`,
      barbadian: `Yuh Flash wallet balance: ${balance}`,
      haitian: `Balans Flash wallet ou: ${balance}`,
      standard: `Your Flash wallet balance: ${balance}`
    };
    
    return messages[dialect] || messages.standard;
  }

  private getBalanceErrorMessage(dialect: string): string {
    const messages: Record<string, string> = {
      jamaican: "Mi cyaa check yuh balance right now. Make sure yuh account link up.",
      trinidadian: "Cyah check yuh balance right now. Make sure yuh account linked.",
      barbadian: "Can't check yuh balance right now. Make sure yuh account linked.",
      haitian: "Mwen pa ka tcheke balans ou kounye a. Asire w ke kont ou konekte.",
      standard: "Cannot check your balance right now. Please ensure your account is linked."
    };
    
    return messages[dialect] || messages.standard;
  }
}