export default () => ({
  // Application
  node_env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  app_url: process.env.APP_URL || 'http://localhost:3000',

  // WhatsApp Cloud API Settings
  whatsappCloud: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET,
    webhookUrl: process.env.WHATSAPP_WEBHOOK_URL || 'https://whatsapp.flashapp.me/whatsapp/webhook',
  },

  // WhatsApp Web Multi-Instance Configuration
  whatsappWeb: {
    instances: (() => {
      // Try to parse as JSON first (new format)
      if (process.env.WHATSAPP_INSTANCES) {
        try {
          const parsed = JSON.parse(process.env.WHATSAPP_INSTANCES);
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          // Fall back to comma-separated format
          return process.env.WHATSAPP_INSTANCES.split(',').map((phone) => ({
            phoneNumber: phone.trim(),
            enabled: true,
          }));
        }
      }
      // Check for default phone as fallback
      if (process.env.WHATSAPP_DEFAULT_PHONE) {
        return [{
          phoneNumber: process.env.WHATSAPP_DEFAULT_PHONE,
          enabled: true,
        }];
      }
      return [];
    })(),
    defaultSessionPath: process.env.WHATSAPP_SESSION_PATH || './whatsapp-sessions',
    chromeDebugPortStart: parseInt(process.env.CHROME_DEBUG_PORT_START || '9222', 10),
    autoReconnect: process.env.WHATSAPP_AUTO_RECONNECT !== 'false',
    maxReconnectAttempts: parseInt(process.env.WHATSAPP_MAX_RECONNECT_ATTEMPTS || '5', 10),
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),

    // Connection pool configuration
    pool: {
      enabled: process.env.REDIS_POOL_ENABLED !== 'false',
      min: parseInt(process.env.REDIS_POOL_MIN || '2', 10),
      max: parseInt(process.env.REDIS_POOL_MAX || '10', 10),
      acquireTimeout: parseInt(process.env.REDIS_POOL_ACQUIRE_TIMEOUT || '3000', 10),
      idleTimeout: parseInt(process.env.REDIS_POOL_IDLE_TIMEOUT || '30000', 10),
      connectionName: process.env.REDIS_POOL_CONNECTION_NAME || 'pulse-pool',
      enableReadReplicas: process.env.REDIS_ENABLE_READ_REPLICAS === 'true',
    },
  },

  // Flash API Configuration
  flashApi: {
    url: process.env.FLASH_API_URL || 'https://api.flashapp.me/graphql',
    apiKey: process.env.FLASH_AUTH_TOKEN || process.env.FLASH_API_KEY,
    apiSecret: process.env.FLASH_API_SECRET,
  },

  // RabbitMQ Configuration
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    queueName: process.env.RABBITMQ_QUEUE_NAME || 'flash_whatsapp_events',
  },

  // Google Gemini AI Configuration
  geminiAi: {
    apiKey: process.env.GEMINI_API_KEY,
  },

  // ElevenLabs TTS Configuration
  elevenLabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    voices: {
      'terri-ann': process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL', // Voice 1: Terri-Ann
      patience: process.env.ELEVENLABS_VOICE_ID2 || 'EXAVITQu4vr4xnSDxMaL', // Voice 2: Patience
      dean: process.env.ELEVENLABS_VOICE_ID3 || 'EXAVITQu4vr4xnSDxMaL', // Voice 3: Dean
    },
    defaultVoice: 'terri-ann', // Default voice option
  },

  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET,
    sessionExpiry: parseInt(process.env.SESSION_EXPIRY || '86400', 10), // 24 hours in seconds
    mfaExpiry: parseInt(process.env.MFA_EXPIRY || '300', 10), // 5 minutes in seconds
  },

  // Caching
  cache: {
    balanceTtl: parseInt(process.env.BALANCE_CACHE_TTL || '300', 10), // 5 minutes in seconds
    priceTtl: parseInt(process.env.PRICE_CACHE_TTL || '900', 10), // 15 minutes in seconds
    usernameTtl: parseInt(process.env.USERNAME_CACHE_TTL || '3600', 10), // 1 hour in seconds
    exchangeRateTtl: parseInt(process.env.EXCHANGE_RATE_CACHE_TTL || '1800', 10), // 30 minutes in seconds
    transactionTtl: parseInt(process.env.TRANSACTION_CACHE_TTL || '86400', 10), // 24 hours in seconds
    sessionTtl: parseInt(process.env.SESSION_CACHE_TTL || '1800', 10), // 30 minutes in seconds

    // Cache warming configuration
    warmup: {
      enabled: process.env.CACHE_WARMUP_ENABLED !== 'false',
      onStartup: process.env.CACHE_WARMUP_ON_STARTUP !== 'false',
      schedule: process.env.CACHE_WARMUP_SCHEDULE || '0 * * * *', // Every hour
      currencies: process.env.CACHE_WARMUP_CURRENCIES
        ? process.env.CACHE_WARMUP_CURRENCIES.split(',').map((c) => c.trim())
        : ['USD', 'JMD'], // Only warm currencies used in the application
      items: [
        { type: 'price', enabled: process.env.CACHE_WARMUP_PRICE !== 'false' },
        { type: 'session', enabled: process.env.CACHE_WARMUP_SESSION !== 'false' },
      ],
    },
  },
  // Legacy support
  balanceCacheTtl: parseInt(process.env.BALANCE_CACHE_TTL || '300', 10), // 5 minutes in seconds

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX || '10', 10), // 10 requests per minute
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Notifications
  notifications: {
    enableWebSocket: process.env.ENABLE_WEBSOCKET_NOTIFICATIONS !== 'false',
    enableIntraledgerPolling: process.env.ENABLE_INTRALEDGER_POLLING !== 'false',
    pollingInterval: parseInt(process.env.PAYMENT_POLLING_INTERVAL || '10000', 10), // 10 seconds default
  },
});
