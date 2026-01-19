import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // App Configuration
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),
  PORT: Joi.number().default(3000),

  // Redis Configuration
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().required(),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().default(0),

  // RabbitMQ Configuration
  RABBITMQ_URL: Joi.string().required(),

  // Security Keys - Required in production
  JWT_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().optional(),
  }),
  ENCRYPTION_KEY: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().optional(),
  }),
  ENCRYPTION_SALT: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(16).required(),
    otherwise: Joi.string().optional(),
  }),
  SESSION_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().optional(),
  }),
  HASH_SALT: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(16).required(),
    otherwise: Joi.string().optional(),
  }),
  WEBHOOK_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().optional(),
  }),

  // API Keys
  FLASH_API_URL: Joi.string().uri().optional(),
  FLASH_API_KEY: Joi.string().optional(),
  GEMINI_API_KEY: Joi.string().optional(),

  // Security Settings
  JWT_EXPIRES_IN: Joi.string().default('24h'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  SESSION_EXPIRES_IN: Joi.number().default(86400),
  SESSION_ROTATION_INTERVAL: Joi.number().default(3600),
  OTP_LENGTH: Joi.number().min(4).max(8).default(6),
  OTP_EXPIRES_IN: Joi.number().default(300),
  OTP_MAX_ATTEMPTS: Joi.number().default(3),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(60000),
  RATE_LIMIT_MAX: Joi.number().default(20),
  AUTH_RATE_LIMIT_WINDOW_MS: Joi.number().default(300000),
  AUTH_RATE_LIMIT_MAX: Joi.number().default(5),
  PAYMENT_RATE_LIMIT_WINDOW_MS: Joi.number().default(60000),
  PAYMENT_RATE_LIMIT_MAX: Joi.number().default(5),

  // Webhook Configuration
  WEBHOOK_TOLERANCE: Joi.number().default(300),

  // Admin Configuration
  ADMIN_PHONE_NUMBERS: Joi.string().optional(),
  ADMIN_REQUIRE_MFA: Joi.boolean().default(false),
  ADMIN_SESSION_TIMEOUT: Joi.number().default(3600),

  // Nostr Configuration (optional)
  NOSTR_PRIVATE_KEY: Joi.string().optional(),
  NOSTR_RELAYS: Joi.string().optional(),
  NOSTR_PULSE_NPUB: Joi.string().optional(),

  // Telegram Configuration (optional)
  TELEGRAM_BOT_TOKEN: Joi.string().optional(),
}).unknown(true); // Allow other env vars
