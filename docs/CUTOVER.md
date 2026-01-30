# Cutover Plan - Pulse Hexagonal Rewrite

## Overview

Migration from monolithic WhatsApp service to hexagonal architecture with WhatsApp Cloud API. This plan ensures a safe transition with minimal downtime and a clear path for rollback.

## Pre-Cutover Checklist

### Code Readiness

- [ ] All 36 tasks complete (Core wallet operations + 24/37 handlers)
- [ ] Build passing (`npm run build`)
- [ ] All tests passing (`npm test`)
- [ ] Integration tests verified with mocked WhatsApp Cloud API
- [ ] No TypeScript errors (`npm run lint` / `tsc`)
- [ ] No ESLint warnings

### Infrastructure & Meta API

- [ ] Meta Developer account created at developers.facebook.com
- [ ] Meta Business verified (Required for production limits)
- [ ] WhatsApp Business app created in Meta dashboard
- [ ] Phone number registered with Cloud API
- [ ] Permanent access token generated (System User token)
- [ ] Webhook URL configured (HTTPS required)
- [ ] Webhook verify token set (matches `WHATSAPP_VERIFY_TOKEN`)
- [ ] Webhook subscriptions enabled: `messages`, `message_deliveries`, `message_reads`
- [ ] App secret noted (for `X-Hub-Signature-256` verification)
- [ ] Redis instance ready with authentication enabled

### Data Migration

- [ ] Redis migration script tested (`src/scripts/migrate-redis-keys.ts`)
- [ ] Full backup of current Redis data (`SAVE` or `BGSAVE`)
- [ ] Migration dry-run completed on staging environment
- [ ] Rollback procedure documented and verified

### Monitoring

- [ ] Logging configured (ObservabilityModule)
- [ ] Health check endpoint ready (`/health`)
- [ ] Sentry/Error tracking enabled (Optional but recommended)
- [ ] Metrics collection ready (Prometheus/Grafana if applicable)

## Cutover Procedure (Step-by-Step)

### Phase 1: Preparation (T-24h)

1. Announce maintenance window to users (Low traffic hours: 2-4 AM UTC recommended).
2. Create full Redis backup: `redis-cli SAVE && cp /var/lib/redis/dump.rdb /backup/pre-cutover-dump.rdb`.
3. Deploy new code to production server (but do not start yet).
4. Run `npm install --production` and `npm run build`.
5. Verify `.env.production` is fully populated with new variables.

### Phase 2: Migration (T-0)

1. Enable maintenance mode (Nginx splash page or bot auto-reply).
2. Stop old service: `pm2 stop pulse-production`.
3. Run Redis migration script:
   ```bash
   NODE_ENV=production npx ts-node src/scripts/migrate-redis-keys.ts
   ```
4. Verify migration results (Check for new key patterns in Redis).
5. Start new service in Monolith mode:
   ```bash
   pm2 start ecosystem.prod.config.js --only pulse-monolith
   ```
6. Verify health check: `curl http://localhost:3000/health`.

### Phase 3: Verification (T+15m)

1. Send test message "ping" or "help" via WhatsApp to the production number.
2. Verify webhook receives message (Check `logs/pulse-out.log`).
3. Verify handler processes message and sends response.
4. Verify response received on WhatsApp.
5. Check logs for any `ERROR` or `CRITICAL` level entries.
6. Monitor Redis for new session keys.

### Phase 4: Post-Cutover Monitoring (First 24 Hours)

1. **T+1h**: Monitor error rates and message throughput.
2. **T+4h**: Verify user sessions are persisting correctly.
3. **T+12h**: Check Redis memory usage and connection pool health.
4. **T+24h**: Review Sentry/Logs for edge cases or unhandled exceptions.

## Rollback Plan

If critical issues are detected (e.g., >5% error rate, message loss, or system instability):

1. **Stop new service**: `pm2 stop pulse-monolith`.
2. **Revert Code**: Switch back to the `main` branch (or previous stable tag).
   ```bash
   git checkout main
   npm install
   npm run build
   ```
3. **Restore Redis**: Restore from the pre-cutover backup.
   ```bash
   pm2 stop all
   sudo service redis-server stop
   sudo cp /backup/pre-cutover-dump.rdb /var/lib/redis/dump.rdb
   sudo service redis-server start
   ```
4. **Start old service**: `pm2 start ecosystem.config.js` (or previous PM2 config).
5. **Verify**: Confirm the old bot is responding correctly.
6. **Communicate**: Inform users that the update was rolled back and service is restored.

## 24-Hour Monitoring Checklist

- [ ] Error rate remains below 1%
- [ ] Average response time < 2 seconds
- [ ] Webhook delivery success rate > 99%
- [ ] Redis memory usage stable
- [ ] No "unhandledRejection" or "uncaughtException" in logs
- [ ] Flash API authentication remains valid
- [ ] WhatsApp Cloud API token remains valid

## Emergency Contacts

- **Lead Engineer**: [Name/Phone]
- **Infrastructure**: [Name/Phone]
- **Meta Support**: [Link to Business Support]

## Notes

- Estimated downtime: 15-30 minutes.
- The migration is non-destructive to old Redis keys, but a backup is mandatory.
- Multi-process mode (RabbitMQ) can be enabled later by starting `pulse-gateway` and `pulse-worker` instead of `pulse-monolith`.
