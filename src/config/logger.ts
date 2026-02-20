/**
 * logger.ts — Pino structured logger configuration for Pulse v5.
 *
 * Usage:
 *   import { logger } from './config/logger.js';
 *   logger.info({ userId: '123' }, 'User logged in');
 *
 * Log levels (in order of verbosity):
 *   trace → debug → info → warn → error → fatal
 *
 * In production: JSON output, info level, no pretty-printing.
 * In development: pretty-printed, colorized, debug level.
 */

import pino from 'pino';

const isDev =
  process.env['NODE_ENV'] !== 'production' && process.env['NODE_ENV'] !== 'test';
const isTest = process.env['NODE_ENV'] === 'test';

/** Log level from environment, defaulting by environment. */
const logLevel = process.env['LOG_LEVEL'] ?? (isTest ? 'silent' : isDev ? 'debug' : 'info');

/** Pino options for development (pretty-printed). */
const devOptions: pino.LoggerOptions = {
  level: logLevel,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
      messageFormat: '{msg}',
    },
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
};

/** Pino options for production (structured JSON). */
const prodOptions: pino.LoggerOptions = {
  level: logLevel,
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  // Redact sensitive fields before logging
  redact: {
    paths: [
      'phoneNumber',
      'phone',
      '*.phoneNumber',
      '*.phone',
      'accessToken',
      'apiKey',
      'password',
      'secret',
      '*.accessToken',
      '*.apiKey',
    ],
    censor: '[REDACTED]',
  },
  base: {
    service: 'pulse',
    version: process.env['npm_package_version'] ?? '5.0.0',
    env: process.env['NODE_ENV'] ?? 'development',
  },
};

/** Test options — silent by default to avoid noisy test output. */
const testOptions: pino.LoggerOptions = {
  level: 'silent',
};

/** The application-wide logger instance. */
export const logger = pino(
  isTest ? testOptions : isDev ? devOptions : prodOptions,
);

/**
 * Create a child logger with additional bound context fields.
 * Useful for per-request or per-module logging.
 *
 * @example
 * const log = childLogger({ requestId: 'abc-123', phoneHash: 'deadbeef' });
 * log.info('Processing payment');
 */
export function childLogger(bindings: Record<string, unknown>): pino.Logger {
  return logger.child(bindings);
}
