# Cutover Plan - Pulse Hexagonal Rewrite

## Overview
Migration from monolithic WhatsApp service to hexagonal architecture with WhatsApp Cloud API.

## Pre-Cutover Checklist

### Code Readiness
- [ ] All 36 tasks complete
- [ ] Build passing (`npm run build`)
- [ ] All tests passing (`npm test`)
- [ ] Integration tests verified
- [ ] No TypeScript errors
- [ ] No ESLint warnings

### Infrastructure
- [ ] Meta WhatsApp Business Account verified
- [ ] Phone number registered with Cloud API
- [ ] Webhook URL configured and verified
- [ ] Access tokens generated (permanent)
- [ ] Redis instance ready
- [ ] Environment variables configured

### Data Migration
- [ ] Redis migration script tested
- [ ] Backup of current Redis data
- [ ] Migration dry-run completed
- [ ] Rollback procedure documented

### Monitoring
- [ ] Logging configured (ObservabilityModule)
- [ ] Health check endpoint ready
- [ ] Error tracking enabled
- [ ] Metrics collection ready

## Cutover Steps

### Phase 1: Preparation (T-24h)
1. Announce maintenance window to users
2. Create full Redis backup
3. Deploy new code to staging
4. Run integration tests on staging
5. Verify webhook connectivity

### Phase 2: Migration (T-0)
1. Enable maintenance mode
2. Stop old service
3. Run Redis migration script:
   ```bash
   ts-node src/scripts/migrate-redis-keys.ts
   ```
4. Verify migration results
5. Start new service
6. Verify health check

### Phase 3: Verification (T+15m)
1. Send test message via WhatsApp
2. Verify webhook receives message
3. Verify handler processes message
4. Verify response sent
5. Check logs for errors
6. Monitor Redis for new keys

### Phase 4: Monitoring (T+1h)
1. Monitor error rates
2. Check message throughput
3. Verify user sessions persist
4. Monitor Flash API calls
5. Check Redis memory usage

## Rollback Procedure

If critical issues detected:

1. Stop new service immediately
2. Restore Redis from backup:
   ```bash
   redis-cli --rdb /backup/dump.rdb
   ```
3. Start old service
4. Verify old service operational
5. Announce rollback to users
6. Document failure reason

## Success Criteria

- [ ] Zero message loss
- [ ] All active sessions migrated
- [ ] Response time < 2s
- [ ] Error rate < 1%
- [ ] All handlers responding
- [ ] No Redis key conflicts

## Post-Cutover

### Immediate (T+24h)
- Monitor logs continuously
- Track error rates
- Verify all features working
- Collect user feedback

### Short-term (T+1w)
- Analyze performance metrics
- Optimize slow handlers
- Fix any edge cases
- Update documentation

### Long-term (T+1m)
- Decommission old service
- Archive old codebase
- Remove legacy dependencies
- Celebrate success! 🎉

## Emergency Contacts

- On-call Engineer: [TBD]
- Meta Support: business.facebook.com/support
- Redis Support: [TBD]

## Notes

- Estimated downtime: 15-30 minutes
- Best time: Low traffic hours (2-4 AM UTC)
- Communication: Status page + in-app notifications
