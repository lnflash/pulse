#!/usr/bin/env ts-node
import Redis from 'ioredis';

async function migrateRedisKeys() {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  });

  console.log('Redis migration: whatsappId -> userId');
  console.log('Implementation: Scan and update session keys');
  
  await redis.quit();
}

migrateRedisKeys().catch(console.error);
