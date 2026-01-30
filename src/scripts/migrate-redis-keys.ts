#!/usr/bin/env ts-node
/**
 * Redis Migration Script: whatsappId-based keys -> UserId-based identity + session
 *
 * Usage:
 *   npm run migrate:redis -- --dry-run   # Preview changes
 *   npm run migrate:redis                 # Execute migration
 *
 * Environment: REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
 * Idempotent. Old keys are NOT deleted.
 */

import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

export interface MigrationStats {
  scanned: number;
  migrated: number;
  skipped: number;
  errors: number;
  identitiesCreated: number;
}

export interface SessionData {
  sessionId?: string;
  whatsappId?: string;
  phoneNumber?: string;
  flashUserId?: string;
  flashAuthToken?: string;
  isVerified?: boolean;
  createdAt?: string;
  expiresAt?: string;
  lastActivity?: string;
  mfaVerified?: boolean;
  mfaExpiresAt?: string;
  consentGiven?: boolean;
  consentTimestamp?: string;
  [key: string]: unknown;
}

export interface MigrationOptions {
  dryRun: boolean;
  scanCount: number;
  redis: RedisLike;
}

export interface RedisLike {
  scan(cursor: string | number, ...args: Array<string | number>): Promise<[string, string[]]>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: Array<string | number>): Promise<unknown>;
  ttl(key: string): Promise<number>;
  quit(): Promise<unknown>;
}

const SESSION_PATTERN = 'session:*';
const IDENTITY_PREFIX = 'identity:whatsapp-cloud:';
const MIGRATION_MAP_PREFIX = 'pulse:migration:id-map:';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function extractPhoneNumber(whatsappId: string): string | null {
  if (!whatsappId || typeof whatsappId !== 'string') return null;
  const phone = whatsappId.split('@')[0];
  if (!phone || !/^\d+$/.test(phone)) return null;
  return phone;
}

export function safeJsonParse(raw: string): SessionData | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as SessionData;
  } catch {
    return null;
  }
}

export async function scanKeys(
  redis: RedisLike,
  pattern: string,
  count: number,
): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';

  do {
    const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', count);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== '0');

  return keys;
}

export async function migrateRedisKeys(options: MigrationOptions): Promise<MigrationStats> {
  const { dryRun, scanCount, redis } = options;

  const stats: MigrationStats = {
    scanned: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
    identitiesCreated: 0,
  };

  const mode = dryRun ? '[DRY-RUN]' : '[LIVE]';
  console.log(`${mode} Starting Redis migration (whatsappId -> userId)...`);

  // Step 1: Scan all session:* keys
  const sessionKeys = await scanKeys(redis, SESSION_PATTERN, scanCount);
  console.log(`${mode} Found ${sessionKeys.length} session keys`);

  // Step 2: Build identity map (phoneNumber -> userId)
  const identityMap = new Map<string, string>();

  for (const key of sessionKeys) {
    stats.scanned++;

    const sessionId = key.replace('session:', '');
    if (isUuid(sessionId)) {
      stats.skipped++;
      continue;
    }

    let raw: string | null;
    try {
      raw = await redis.get(key);
    } catch (err) {
      console.error(`${mode} Error reading ${key}: ${(err as Error).message}`);
      stats.errors++;
      continue;
    }

    if (!raw) {
      console.warn(`${mode} Skipping ${key}: empty/expired`);
      stats.skipped++;
      continue;
    }

    const session = safeJsonParse(raw);
    if (!session) {
      console.warn(`${mode} Skipping ${key}: unable to parse (possibly encrypted)`);
      stats.skipped++;
      continue;
    }

    const whatsappId = session.whatsappId || '';
    const phoneNumber = session.phoneNumber || extractPhoneNumber(whatsappId);

    if (!phoneNumber) {
      console.warn(`${mode} Skipping ${key}: no whatsappId or phoneNumber found`);
      stats.skipped++;
      continue;
    }

    // Step 3: Resolve or create userId for this phone number
    let userId: string;

    if (identityMap.has(phoneNumber)) {
      userId = identityMap.get(phoneNumber)!;
    } else {
      const existingIdentity = await redis.get(`${IDENTITY_PREFIX}${phoneNumber}`);
      if (existingIdentity) {
        userId = existingIdentity;
        identityMap.set(phoneNumber, userId);
      } else {
        userId = uuidv4();
        identityMap.set(phoneNumber, userId);

        if (!dryRun) {
          await redis.set(`${IDENTITY_PREFIX}${phoneNumber}`, userId);
          await redis.set(`${MIGRATION_MAP_PREFIX}${phoneNumber}`, userId);
        }
        stats.identitiesCreated++;
        console.log(`${mode} Created identity: ${IDENTITY_PREFIX}${phoneNumber} -> ${userId}`);
      }
    }

    // Step 4: Write session data under new key session:{userId}
    const newSessionKey = `session:${userId}`;

    const existingNewSession = await redis.get(newSessionKey);
    if (existingNewSession) {
      console.log(`${mode} Skipping ${key}: new key ${newSessionKey} already exists`);
      stats.skipped++;
      continue;
    }

    const ttl = await redis.ttl(key);

    if (!dryRun) {
      if (ttl > 0) {
        await redis.set(newSessionKey, raw, 'EX', ttl);
      } else {
        await redis.set(newSessionKey, raw);
      }
    }

    stats.migrated++;
    console.log(
      `${mode} Migrated: ${key} -> ${newSessionKey} (phone: ${phoneNumber}, ttl: ${ttl}s)`,
    );
  }

  console.log(`\n${mode} Migration complete:`);
  console.log(`  Scanned:            ${stats.scanned}`);
  console.log(`  Migrated:           ${stats.migrated}`);
  console.log(`  Skipped:            ${stats.skipped}`);
  console.log(`  Errors:             ${stats.errors}`);
  console.log(`  Identities created: ${stats.identitiesCreated}`);

  return stats;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const dryRun = argv.includes('--dry-run');

  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  });

  try {
    await migrateRedisKeys({ dryRun, scanCount: 100, redis: redis as unknown as RedisLike });
  } finally {
    await redis.quit();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
