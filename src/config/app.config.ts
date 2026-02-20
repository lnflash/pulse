/**
 * app.config.ts — application configuration loaded from environment variables.
 *
 * All config is read at startup via this module. Other modules import from here.
 * Never import process.env directly outside this file.
 */

import 'dotenv/config';
import { z } from 'zod';

/** Environment schema with validation and defaults. */
const EnvSchema = z.object({
  // Core
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),

  // Anthropic / Claude
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-5'),

  // Google / Gemini
  GOOGLE_AI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().default('gemini-1.5-flash'),

  // Flash API
  FLASH_API_URL: z.string().url().default('https://api.flashapp.me'),
  FLASH_API_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  // WhatsApp Cloud API
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default('v18.0'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_KEY_PREFIX: z.string().default('pulse:v5:'),
  CONTEXT_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),

  // ElevenLabs
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_DEFAULT_VOICE_ID: z.string().optional(),

  // OpenAI (Whisper)
  OPENAI_API_KEY: z.string().optional(),

  // Security
  API_KEY: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  ADMIN_TOKEN: z.string().optional(),

  // Storage
  STORAGE_ROOT_DIR: z.string().default('./data/storage'),
  CONTEXT_DATA_DIR: z.string().default('./data/contexts'),
  /** AES-256 encryption key for PersistentContextAdapter. MUST be set in production. */
  CONTEXT_ENCRYPTION_KEY: z.string().default('dev-default-key-change-in-production'),

  // Feature flags
  ENABLE_VOICE: z.coerce.boolean().default(false),
  ENABLE_MERCHANT_TOOLS: z.coerce.boolean().default(false),
  ENABLE_DISCOVERY: z.coerce.boolean().default(false),
  SANDBOX_MODE: z.coerce.boolean().default(false),
});

/** Parsed and validated environment configuration. */
export type AppConfig = z.infer<typeof EnvSchema>;

/**
 * Load and validate all environment variables.
 * Throws a descriptive error on startup if required variables are missing.
 */
function loadConfig(): AppConfig {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}

/** The loaded application configuration. Validated at module load time. */
export const config = loadConfig();

/** True if running in production. */
export const isProduction = config.NODE_ENV === 'production';

/** True if running in development. */
export const isDevelopment = config.NODE_ENV === 'development';

/** True if running in test. */
export const isTest = config.NODE_ENV === 'test';
