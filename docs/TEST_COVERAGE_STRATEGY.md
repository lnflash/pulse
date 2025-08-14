# Test Coverage Strategy - Path to 80%

## Current State
- **Current Coverage**: 19% (27/140 files)
- **Target Coverage**: 80% (112/140 files)
- **Gap**: 85 files need tests

## Priority Ranking

### 🔴 Critical Priority (Core Business Logic)
These files handle money and must be tested first:

#### Payment & Transaction Services (10 files)
- [ ] `modules/flash-api/services/balance.service.ts`
- [ ] `modules/flash-api/services/invoice.service.ts`
- [ ] `modules/flash-api/services/transaction.service.ts`
- [ ] `modules/flash-api/services/payment.service.ts` ✅
- [ ] `modules/flash-api/services/pending-payment.service.ts`
- [ ] `modules/dialect-ai/services/enhanced-payment-flow.service.ts`
- [ ] `modules/flash-api/services/price.service.ts`
- [ ] `modules/flash-api/services/subscription.service.ts`
- [ ] `modules/flash-api/services/user.service.ts`
- [ ] `modules/flash-api/services/username.service.ts`

#### Security & Authentication (6 files)
- [ ] `modules/auth/services/group-auth.service.ts`
- [ ] `modules/admin-dashboard/services/admin-auth.service.ts`
- [ ] `common/services/security-audit.service.ts`
- [ ] `modules/admin-dashboard/services/admin-health.service.ts`
- [ ] `modules/auth/services/auth.service.ts` ✅
- [ ] `modules/auth/services/session.service.ts` ✅

### 🟡 High Priority (User-Facing Features)

#### Dialect AI (7 files)
- [ ] `modules/dialect-ai/services/conversation-manager.service.ts`
- [ ] `modules/dialect-ai/services/dialect-classifier.service.ts`
- [ ] `modules/dialect-ai/services/dialect-normalizer.service.ts`
- [ ] `modules/dialect-ai/services/intent-recognizer.service.ts`
- [ ] `modules/dialect-ai/services/dialect-message.handler.ts`
- [ ] `modules/dialect-ai/services/enhanced-whatsapp.service.ts`
- [ ] `modules/dialect-ai/tests/dialect-ai.integration.spec.ts` ✅

#### Messaging Platform (8 files)
- [ ] `modules/messaging/services/messaging-orchestrator.service.ts`
- [ ] `modules/messaging/handlers/command-message.handler.ts`
- [ ] `modules/messaging/handlers/general-message.handler.ts`
- [ ] `modules/messaging/adapters/whatsapp-web.adapter.ts`
- [ ] `modules/messaging/services/platform-command-executor.service.ts`
- [ ] `modules/messaging/handlers/base-message.handler.ts`
- [ ] `modules/messaging/messaging.service.spec.ts` ✅
- [ ] `modules/messaging/tests/messaging-platform.spec.ts` ✅

#### WhatsApp Services (31 remaining files)
Already have 12/43 tested. Priority for remaining:
- [ ] `modules/whatsapp/services/whatsapp-cloud.service.ts`
- [ ] `modules/whatsapp/services/whatsapp-web.service.ts`
- [ ] `modules/whatsapp/services/whatsapp-instance-manager.service.ts`
- [ ] `modules/whatsapp/services/invoice-tracker.service.ts`
- [ ] `modules/whatsapp/services/onboarding.service.ts`
- [ ] `modules/whatsapp/services/contextual-help.service.ts`

### 🟢 Medium Priority (Support Services)

#### Common Services (21 files)
- [ ] `modules/common/services/cache-manager.service.ts`
- [ ] `modules/common/services/cache-warmer.service.ts`
- [ ] `modules/common/services/metrics.service.ts`
- [ ] `modules/common/services/request-deduplicator.service.ts` ✅

#### Event & Notification Services (7 files)
- [ ] `modules/events/services/event-dispatcher.service.ts`
- [ ] `modules/events/services/event-replay.service.ts`
- [ ] `modules/events/services/queue-monitor.service.ts`
- [ ] `modules/notifications/services/notification.service.ts`
- [ ] `modules/notifications/services/payment-notification.service.ts`

## Implementation Plan

### Phase 1: Critical Services (Week 1)
**Goal**: 35% coverage (+16%)
- Payment services: 10 tests
- Security services: 6 tests
- Estimated effort: 3 days

### Phase 2: Dialect AI (Week 2)
**Goal**: 50% coverage (+15%)
- Dialect processing: 7 tests
- Messaging platform: 8 tests
- Estimated effort: 3 days

### Phase 3: WhatsApp Services (Week 3)
**Goal**: 70% coverage (+20%)
- Core WhatsApp services: 20 tests
- Estimated effort: 4 days

### Phase 4: Support Services (Week 4)
**Goal**: 80% coverage (+10%)
- Common services: 10 tests
- Event services: 4 tests
- Estimated effort: 2 days

## Test Quality Standards

### Each Test File Must Include:
1. **Unit Tests**
   - Happy path scenarios
   - Error handling
   - Edge cases
   - Input validation

2. **Mock Coverage**
   - All dependencies mocked
   - Mock return values tested
   - Error scenarios simulated

3. **Assertions**
   - Minimum 3 assertions per test
   - Test both success and failure
   - Verify side effects

### Test Template
```typescript
describe('ServiceName', () => {
  let service: ServiceName;
  let mockDependency: jest.Mocked<Dependency>;

  beforeEach(() => {
    // Setup
  });

  describe('methodName', () => {
    it('should handle success case', () => {
      // Arrange, Act, Assert
    });

    it('should handle error case', () => {
      // Test error handling
    });

    it('should validate input', () => {
      // Test validation
    });
  });
});
```

## Automation Tools

### 1. Test Generator Script
```bash
npm run generate:tests
```
Generates boilerplate tests for untested files.

### 2. Coverage Reporter
```bash
npm run test:cov
```
Shows current coverage with detailed report.

### 3. Coverage Analyzer
```bash
npx ts-node scripts/analyze-coverage.ts
```
Shows progress toward 80% goal.

## Success Metrics

### Coverage Targets
- Line Coverage: ≥ 80%
- Branch Coverage: ≥ 75%
- Function Coverage: ≥ 80%
- Statement Coverage: ≥ 80%

### Quality Metrics
- Test execution time: < 30 seconds
- No flaky tests
- All tests pass in CI/CD
- Mock coverage: 100%

## Testing Best Practices

### DO:
- ✅ Test business logic thoroughly
- ✅ Mock external dependencies
- ✅ Use descriptive test names
- ✅ Follow AAA pattern (Arrange, Act, Assert)
- ✅ Test error scenarios
- ✅ Keep tests independent
- ✅ Use beforeEach for common setup

### DON'T:
- ❌ Test implementation details
- ❌ Make real API calls
- ❌ Use hardcoded values
- ❌ Write tests that depend on order
- ❌ Skip error handling tests
- ❌ Leave console.logs in tests

## Continuous Integration

### Pre-commit Hook
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run test:changed"
    }
  }
}
```

### GitHub Actions
```yaml
- name: Run Tests
  run: |
    npm run test:cov
    npm run test:e2e
```

### Coverage Gates
- PR must not decrease coverage
- New files must have tests
- Critical paths require 90% coverage

## Monitoring Progress

### Weekly Review
- [ ] Week 1: 35% coverage achieved
- [ ] Week 2: 50% coverage achieved
- [ ] Week 3: 70% coverage achieved
- [ ] Week 4: 80% coverage achieved

### Daily Targets
- Minimum 3 test files per day
- Average 10 tests per file
- 30 tests per day

## Resources

### Documentation
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

### Team Support
- Code reviews for all test PRs
- Pair programming for complex tests
- Knowledge sharing sessions

## Conclusion

Achieving 80% test coverage requires:
- **85 new test files**
- **~850 individual tests**
- **4 weeks of focused effort**
- **Team commitment**

The investment will result in:
- 🛡️ Reduced production bugs
- 🚀 Faster development cycles
- 📈 Improved code quality
- 💪 Greater confidence in deployments