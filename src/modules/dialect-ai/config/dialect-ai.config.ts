export interface DialectAiConfig {
  enabled: boolean;
  features: {
    dialectDetection: boolean;
    normalization: boolean;
    intentRecognition: boolean;
    conversationalAI: boolean;
    voiceTranscription: boolean;
    contextTracking: boolean;
    paymentFlows: boolean;
  };
  dialect: {
    confidenceThreshold: number;
    enableStyler: boolean;
    fallbackDialect: string;
    supportedDialects: string[];
  };
  intent: {
    confidenceThreshold: number;
    requireConfirmation: string[];
    confirmationAmountThreshold: number;
    maxRetries: number;
  };
  conversation: {
    contextTimeout: number; // in minutes
    maxHistorySize: number;
    enableVoiceResponses: boolean;
  };
  payment: {
    largeAmountThreshold: number;
    criticalAmountThreshold: number;
    requireConfirmationAbove: number;
    defaultCurrency: string;
  };
  analytics: {
    enabled: boolean;
    trackDialects: boolean;
    trackIntents: boolean;
    trackConversions: boolean;
  };
}

export const defaultDialectAiConfig: DialectAiConfig = {
  enabled: true,
  features: {
    dialectDetection: true,
    normalization: true,
    intentRecognition: true,
    conversationalAI: true,
    voiceTranscription: true,
    contextTracking: true,
    paymentFlows: true
  },
  dialect: {
    confidenceThreshold: 0.6,
    enableStyler: true,
    fallbackDialect: 'standard',
    supportedDialects: [
      'jamaican',
      'trinidadian',
      'barbadian',
      'haitian',
      'guyanese',
      'standard'
    ]
  },
  intent: {
    confidenceThreshold: 0.7,
    requireConfirmation: ['sendFunds', 'requestPayment'],
    confirmationAmountThreshold: 100,
    maxRetries: 3
  },
  conversation: {
    contextTimeout: 30, // 30 minutes
    maxHistorySize: 10,
    enableVoiceResponses: true
  },
  payment: {
    largeAmountThreshold: 100,
    criticalAmountThreshold: 500,
    requireConfirmationAbove: 50,
    defaultCurrency: 'USD'
  },
  analytics: {
    enabled: true,
    trackDialects: true,
    trackIntents: true,
    trackConversions: true
  }
};

/**
 * Environment-based configuration overrides
 */
export function getDialectAiConfig(): DialectAiConfig {
  const config = { ...defaultDialectAiConfig };

  // Override with environment variables if present
  if (process.env.DIALECT_AI_ENABLED !== undefined) {
    config.enabled = process.env.DIALECT_AI_ENABLED === 'true';
  }

  if (process.env.DIALECT_CONFIDENCE_THRESHOLD) {
    config.dialect.confidenceThreshold = parseFloat(process.env.DIALECT_CONFIDENCE_THRESHOLD);
  }

  if (process.env.INTENT_CONFIDENCE_THRESHOLD) {
    config.intent.confidenceThreshold = parseFloat(process.env.INTENT_CONFIDENCE_THRESHOLD);
  }

  if (process.env.PAYMENT_CONFIRMATION_THRESHOLD) {
    config.payment.requireConfirmationAbove = parseFloat(process.env.PAYMENT_CONFIRMATION_THRESHOLD);
  }

  if (process.env.DIALECT_AI_ANALYTICS_ENABLED !== undefined) {
    config.analytics.enabled = process.env.DIALECT_AI_ANALYTICS_ENABLED === 'true';
  }

  return config;
}