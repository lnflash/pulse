# Test Coverage Report

Generated: 2025-08-13T23:37:52.828Z

## Summary

- **Total Source Files**: 140
- **Files with Tests**: 27
- **Coverage**: 19%
- **Goal**: 80%

## Module Coverage

| Module | Coverage | Files Tested | Total Files |
|--------|----------|--------------|-------------|
| ✅ speech | 100% | 2 | 2 |
| ✅ tts | 100% | 1 | 1 |
| ❌ auth | 50% | 3 | 6 |
| ❌ gemini-ai | 50% | 1 | 2 |
| ❌ whatsapp | 28% | 12 | 43 |
| ❌ events | 25% | 1 | 4 |
| ❌ redis | 25% | 1 | 4 |
| ❌ flash-api | 15% | 2 | 13 |
| ❌ messaging | 13% | 1 | 8 |
| ❌ plugins | 13% | 1 | 8 |
| ❌ common | 9% | 2 | 23 |
| ❌ config | 0% | 0 | 2 |
| ❌ health.controller.ts | 0% | 0 | 1 |
| ❌ admin-dashboard | 0% | 0 | 11 |
| ❌ dialect-ai | 0% | 0 | 7 |
| ❌ notifications | 0% | 0 | 3 |
| ❌ telegram | 0% | 0 | 1 |
| ❌ shared | 0% | 0 | 1 |

## Files Needing Tests

### High Priority (Services & Handlers)

- [ ] common/services/security-audit.service.ts
- [ ] modules/admin-dashboard/services/admin-auth.service.ts
- [ ] modules/admin-dashboard/services/admin-dashboard.service.ts
- [ ] modules/admin-dashboard/services/admin-facade.service.ts
- [ ] modules/admin-dashboard/services/admin-health.service.ts
- [ ] modules/auth/services/group-auth.service.ts
- [ ] modules/common/services/cache-manager.service.ts
- [ ] modules/common/services/cache-warmer.service.ts
- [ ] modules/common/services/metrics.service.ts
- [ ] modules/dialect-ai/services/conversation-manager.service.ts
- [ ] modules/dialect-ai/services/dialect-classifier.service.ts
- [ ] modules/dialect-ai/services/dialect-message.handler.ts
- [ ] modules/dialect-ai/services/dialect-normalizer.service.ts
- [ ] modules/dialect-ai/services/enhanced-payment-flow.service.ts
- [ ] modules/dialect-ai/services/enhanced-whatsapp.service.ts
- [ ] modules/dialect-ai/services/intent-recognizer.service.ts
- [ ] modules/events/services/event-dispatcher.service.ts
- [ ] modules/events/services/event-replay.service.ts
- [ ] modules/events/services/queue-monitor.service.ts
- [ ] modules/flash-api/services/balance.service.ts
- [ ] modules/flash-api/services/invoice.service.ts
- [ ] modules/flash-api/services/pending-payment.service.ts
- [ ] modules/flash-api/services/price.service.ts
- [ ] modules/flash-api/services/subscription.service.ts
- [ ] modules/flash-api/services/transaction.service.ts
- [ ] modules/flash-api/services/user.service.ts
- [ ] modules/flash-api/services/username.service.ts
- [ ] modules/messaging/handlers/base-message.handler.ts
- [ ] modules/messaging/handlers/command-message.handler.ts
- [ ] modules/messaging/handlers/general-message.handler.ts
- [ ] modules/messaging/services/messaging-orchestrator.service.ts
- [ ] modules/messaging/services/platform-command-executor.service.ts
- [ ] modules/notifications/services/notification.service.ts
- [ ] modules/notifications/services/payment-notification.service.ts
- [ ] modules/redis/services/redis-batch.service.ts
- [ ] modules/redis/services/redis-pool.service.ts
- [ ] modules/redis/services/whatsapp-redis.service.ts
- [ ] modules/whatsapp/commands/base/base-command.handler.ts
- [ ] modules/whatsapp/commands/command-executor.service.ts
- [ ] modules/whatsapp/commands/command-registry.service.ts
- [ ] modules/whatsapp/commands/handlers/balance.handler.ts
- [ ] modules/whatsapp/commands/handlers/help.handler.ts
- [ ] modules/whatsapp/commands/handlers/link.handler.ts
- [ ] modules/whatsapp/commands/handlers/send.handler.ts
- [ ] modules/whatsapp/services/admin-analytics.service.ts
- [ ] modules/whatsapp/services/admin-settings.service.ts
- [ ] modules/whatsapp/services/command-validator.service.ts
- [ ] modules/whatsapp/services/contextual-help.service.ts
- [ ] modules/whatsapp/services/invoice-tracker.service.ts
- [ ] modules/whatsapp/services/message-batcher.service.ts
- [ ] modules/whatsapp/services/onboarding.service.ts
- [ ] modules/whatsapp/services/payment-templates.service.ts
- [ ] modules/whatsapp/services/qr-code.service.ts
- [ ] modules/whatsapp/services/random-question.service.ts
- [ ] modules/whatsapp/services/undo-transaction.service.ts
- [ ] modules/whatsapp/services/user-knowledge-base.service.ts
- [ ] modules/whatsapp/services/voice-management.service.ts
- [ ] modules/whatsapp/services/whatsapp-cloud.service.ts
- [ ] modules/whatsapp/services/whatsapp-instance-manager.service.ts
- [ ] modules/whatsapp/services/whatsapp-messaging.service.ts
- [ ] modules/whatsapp/services/whatsapp-web.service.ts
- [ ] shared/services/galoy.service.ts

### Other Files

- [ ] common/controllers/catch-all.controller.ts
- [ ] common/decorators/require-api-key.decorator.ts
- [ ] common/decorators/webhook-signature.decorator.ts
- [ ] common/filters/global-exception.filter.ts
- [ ] common/filters/http-exception.filter.ts
- [ ] common/guards/api-key.guard.ts
- [ ] common/guards/enhanced-rate-limiter.guard.ts
- [ ] common/guards/rate-limit.guard.ts
- [ ] common/guards/rate-limiter.guard.ts
- [ ] common/interceptors/logging.interceptor.ts
- [ ] common/interceptors/sanitize.interceptor.ts
- [ ] common/middleware/api-rate-limit.middleware.ts
- [ ] common/middleware/metrics.middleware.ts
- [ ] common/middleware/security.middleware.ts
- [ ] common/utils/chrome-cleanup.util.ts
- [ ] common/utils/whatsapp/whatsapp-id-normalizer.ts
- [ ] common/validators/custom-validators.ts
- [ ] config/configuration.ts
- [ ] config/env.validation.ts
- [ ] health.controller.ts
