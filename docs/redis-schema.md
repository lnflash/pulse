# Redis Schema Documentation

> **Generated**: 2026-01-29  
> **Branch**: `rewrite/hexagonal`  
> **Purpose**: Exhaustive documentation of all Redis key patterns in the Pulse codebase, plus migration strategy for hexagonal architecture.  
> **Consumers**: Task 6 (Identity + Session modules), Task 20 (Redis Migration Script)

---

## Table of Contents

1. [Key Patterns Overview](#key-patterns-overview)
2. [Session Schema](#session-schema)
3. [Cache Keys](#cache-keys)
4. [Rate Limiting Keys](#rate-limiting-keys)
5. [Deduplication Keys](#deduplication-keys)
6. [Feature Flag / Admin Keys](#feature-flag--admin-keys)
7. [Plugin State Keys](#plugin-state-keys)
8. [Messaging State Keys](#messaging-state-keys)
9. [WhatsApp ID Normalization Layer](#whatsapp-id-normalization-layer)
10. [Migration Strategy](#migration-strategy)

---

## Key Patterns Overview

| #   | Key Pattern                                       | Data Type               | TTL                         | Owner Module (Write)                                                | Reader Module(s)                                                | Description                                        | Example Value                                           |
| --- | ------------------------------------------------- | ----------------------- | --------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------- |
| 1   | `session:{sessionId}`                             | string (encrypted JSON) | 86400s (24h, configurable)  | `auth/session.service`                                              | `auth/session.service`, admin, notifications                    | User session object                                | `{encrypted(UserSession)}`                              |
| 2   | `whatsapp:{hash(whatsappId)}`                     | string                  | 86400s (24h)                | `auth/session.service`                                              | `auth/session.service`                                          | WhatsApp ID → sessionId mapping (hashed key)       | `"a1b2c3d4e5f6..."`                                     |
| 3   | `username:{username}`                             | string                  | 86400s (24h)                | `auth/session.service`                                              | `auth/session.service`                                          | Username → whatsappId mapping                      | `"18765551234@c.us"`                                    |
| 4   | `otp:{sessionId}`                                 | string (encrypted JSON) | 300s (5min, configurable)   | `auth/otp.service`                                                  | `auth/otp.service`                                              | OTP hash for verification                          | `{encrypted({hash: "sha256..."})}`                      |
| 5   | `balance:{userId}`                                | string (encrypted JSON) | 30s (configurable)          | `flash-api/balance.service`                                         | `flash-api/balance.service`, commands                           | Cached user balance                                | `{encrypted(BalanceInfo)}`                              |
| 6   | `price:btc:{currency}`                            | string (JSON)           | 900s (15min, configurable)  | `flash-api/price.service`                                           | `flash-api/price.service`, commands                             | Bitcoin price cache                                | `{"btcPrice":97000,"currency":"USD","timestamp":"..."}` |
| 7   | `rate-limit:{clientId}`                           | string (counter)        | 60s (configurable)          | `guards/rate-limiter.guard`                                         | `guards/rate-limiter.guard`                                     | HTTP rate limit counter                            | `"5"`                                                   |
| 8   | `rate_limit:whatsapp:{phoneNumber}`               | string (counter)        | auto via INCR+EXPIRE        | `guards/rate-limit.guard`                                           | `guards/rate-limit.guard`                                       | WhatsApp webhook rate limit                        | `"12"`                                                  |
| 9   | `rate_limit:{ip}:{method}:{path}`                 | string (counter)        | auto via INCR+EXPIRE        | `guards/rate-limit.guard`                                           | `guards/rate-limit.guard`                                       | Per-IP/endpoint rate limit                         | `"45"`                                                  |
| 10  | `rate-limit:{ip}:{method}:{path}`                 | string (counter)        | configurable windowMs       | `guards/enhanced-rate-limiter.guard`                                | `guards/enhanced-rate-limiter.guard`                            | Enhanced per-IP/endpoint rate limit                | `"8"`                                                   |
| 11  | `rate-limit:webhook:{webhookId}`                  | string (counter)        | 1s                          | `guards/enhanced-rate-limiter.guard`                                | `guards/enhanced-rate-limiter.guard`                            | Webhook rate limit                                 | `"3"`                                                   |
| 12  | `rate-limit:whatsapp:{whatsappId}`                | string (counter)        | 60s                         | `guards/enhanced-rate-limiter.guard`                                | `guards/enhanced-rate-limiter.guard`                            | WhatsApp message rate limit                        | `"15"`                                                  |
| 13  | `admin:ratelimit:{identifier}:{handlerName}`      | string (counter)        | configurable windowMs       | `admin/admin-rate-limit.guard`                                      | `admin/admin-rate-limit.guard`                                  | Admin endpoint rate limit                          | `"2"`                                                   |
| 14  | `payment_notif_sent:{paymentHash}`                | string                  | 604800s (7 days)            | `notifications/payment-notification.service`                        | `notifications/payment-notification.service`                    | Payment notification dedup flag                    | `"1"`                                                   |
| 15  | `last_tx_id:{whatsappId}`                         | string                  | 2592000s (30 days)          | `notifications/payment-notification.service`                        | `notifications/payment-notification.service`                    | Last processed transaction ID                      | `"tx_abc123..."`                                        |
| 16  | `last_tx_id:timestamp:{whatsappId}`               | string                  | 2592000s (30 days)          | `notifications/payment-notification.service`                        | `notifications/payment-notification.service`                    | Timestamp of last tx processing                    | `"2026-01-29T10:30:00.000Z"`                            |
| 17  | `admin:settings`                                  | string (JSON)           | persistent                  | `whatsapp/admin-settings.service`                                   | `whatsapp/admin-settings.service`                               | Full admin settings object                         | `{"lockdown":false,"groupsEnabled":true,...}`           |
| 18  | `admin:lockdown`                                  | string                  | persistent                  | `whatsapp/admin-settings.service`                                   | `whatsapp/admin-settings.service`                               | Quick-access lockdown flag                         | `"0"` or `"1"`                                          |
| 19  | `admin:groups_enabled`                            | string                  | persistent                  | `whatsapp/admin-settings.service`                                   | `whatsapp/admin-settings.service`                               | Quick-access groups enabled flag                   | `"0"` or `"1"`                                          |
| 20  | `admin:voice_mode`                                | string                  | persistent                  | `whatsapp/admin-settings.service`                                   | `whatsapp/admin-settings.service`                               | Voice mode setting                                 | `"on"`, `"off"`, or `"always"`                          |
| 21  | `admin:command:history`                           | string (JSON array)     | persistent                  | `admin/admin-dashboard.service`                                     | `admin/admin-dashboard.service`                                 | Admin command history                              | `[{"command":"...", "timestamp":"..."}]`                |
| 22  | `admin:audit:log`                                 | list                    | persistent                  | `admin/admin-facade.service`                                        | `admin/admin-facade.service`                                    | Admin audit trail (LPUSH)                          | JSON-encoded log entries                                |
| 23  | `admin:temp:{sessionId}`                          | string (encrypted JSON) | varies                      | `admin/admin-auth.service`                                          | `admin/admin-auth.service`                                      | Temp admin session data                            | `{encrypted(...)}`                                      |
| 24  | `admin:session:{sessionId}`                       | string (encrypted JSON) | 604800s (7 days)            | `admin/admin-auth.service`                                          | `admin/admin-auth.service`                                      | Admin authenticated session                        | `{encrypted(...)}`                                      |
| 25  | `stats:messages`                                  | string (JSON)           | persistent                  | `admin/admin-dashboard.service`                                     | `admin/admin-dashboard.service`                                 | Message statistics                                 | `{"total":1234,...}`                                    |
| 26  | `system:errors`                                   | string (JSON)           | persistent                  | `admin/admin-health.service`                                        | `admin/admin-health.service`, dashboard                         | System error logs                                  | `[{"error":"...", "timestamp":"..."}]`                  |
| 27  | `contacts:{whatsappId}`                           | string (JSON)           | 31536000s (1 year)          | `whatsapp/whatsapp.service`                                         | `whatsapp/whatsapp.service`                                     | User's saved contacts                              | `{"alice":"18765551234@c.us",...}`                      |
| 28  | `contact_history:{whatsappId}:{contactName}`      | string (JSON)           | 31536000s (1 year)          | `whatsapp/whatsapp.service`                                         | `whatsapp/whatsapp.service`                                     | Contact transaction history                        | `[{"amount":100,"date":"..."}]`                         |
| 29  | `pending_send:{whatsappId}`                       | string (JSON)           | 300s (5min)                 | `whatsapp/whatsapp.service`                                         | `whatsapp/whatsapp.service`, telegram                           | Pending send confirmation data                     | `{"amount":100,"recipient":"alice",...}`                |
| 30  | `pending_request:{whatsappId}`                    | string (JSON)           | 300s (5min)                 | `whatsapp/whatsapp.service`                                         | `whatsapp/whatsapp.service`                                     | Pending payment request data                       | `{"amount":50,"from":"bob",...}`                        |
| 31  | `pending_ai_question:{whatsappId}`                | string                  | varies                      | `whatsapp/whatsapp.service`                                         | `whatsapp/whatsapp.service`                                     | Pending AI question context                        | `"What is Bitcoin?"`                                    |
| 32  | `pending_payments:{whatsappId}`                   | string (JSON)           | varies                      | `whatsapp/whatsapp.service`                                         | `whatsapp/whatsapp.service`                                     | Pending payment list                               | `[{"paymentHash":"...","amount":100}]`                  |
| 33  | `vybz_waiting:{whatsappId}`                       | string                  | 300s (5min)                 | `whatsapp/whatsapp.service`                                         | `whatsapp/whatsapp.service`                                     | Vybz content waiting flag                          | `"true"`                                                |
| 34  | `vybz_queue:{whatsappId}`                         | string (JSON)           | 300s (5min)                 | `whatsapp/whatsapp.service`                                         | `whatsapp/whatsapp.service`                                     | Vybz content queue data                            | `{"type":"image","caption":"..."}`                      |
| 35  | `vybz_daily:{whatsappId}:{dateString}`            | string                  | 86400s (24h)                | `whatsapp/whatsapp.service`                                         | `whatsapp/whatsapp.service`                                     | Daily vybz post count                              | `"3"`                                                   |
| 36  | `vybz_posts:{whatsappId}`                         | string (JSON)           | varies                      | `whatsapp/whatsapp.service`                                         | `whatsapp/whatsapp.service`                                     | Vybz post history                                  | `[{"content":"...","timestamp":"..."}]`                 |
| 37  | `whatsapp:message:{messageId}`                    | string                  | varies                      | `whatsapp/whatsapp.service`                                         | `whatsapp/whatsapp.service`                                     | Message deduplication/tracking                     | `"processed"`                                           |
| 38  | `invoice:{paymentHash}`                           | string (JSON)           | 3600s (1h)                  | `whatsapp/whatsapp.service`, `notifications/payment-event.listener` | `whatsapp/whatsapp.service`, `whatsapp/invoice-tracker.service` | Invoice data cache                                 | `{"paymentHash":"...","amount":1000,...}`               |
| 39  | `user:{whatsappId}:invoices`                      | set                     | persistent                  | `whatsapp/whatsapp.service`                                         | `whatsapp/whatsapp.service`                                     | Set of user's invoice payment hashes               | `{"hash1", "hash2", ...}`                               |
| 40  | `payment_confirmation:{whatsappId}`               | string (JSON)           | varies                      | `whatsapp/payment-confirmation.service`                             | `whatsapp/payment-confirmation.service`                         | Payment requiring confirmation                     | `{"type":"SEND","args":{...}}`                          |
| 41  | `undo_tx:{whatsappId}`                            | string (JSON)           | 60s                         | `whatsapp/undo-transaction.service`                                 | `whatsapp/undo-transaction.service`                             | Undoable transaction data                          | `{"transactionId":"...","amount":100,...}`              |
| 42  | `user_voice_settings:{whatsappId}`                | string (JSON)           | configurable (SETTINGS_TTL) | `whatsapp/user-voice-settings.service`                              | `whatsapp/user-voice-settings.service`                          | Per-user voice preferences                         | `{"voiceMode":"on","voiceName":"nova"}`                 |
| 43  | `payment_templates:{whatsappId}`                  | string (JSON)           | persistent (TTL=0)          | `whatsapp/payment-templates.service`                                | `whatsapp/payment-templates.service`                            | User's payment templates                           | `[{"name":"rent","amount":500,...}]`                    |
| 44  | `elevenlabs:voices`                               | string (JSON)           | persistent (TTL=0)          | `whatsapp/voice-management.service`                                 | `whatsapp/voice-management.service`                             | Global voice list                                  | `{"nova":"voiceId1","echo":"voiceId2"}`                 |
| 45  | `elevenlabs:voice:{name}`                         | string (JSON)           | persistent (TTL=0)          | `whatsapp/voice-management.service`                                 | `whatsapp/voice-management.service`                             | Individual voice details                           | `{"name":"nova","voiceId":"...","addedAt":"..."}`       |
| 46  | `elevenlabs:default_voice`                        | string                  | persistent (TTL=0)          | `whatsapp/voice-management.service`                                 | `whatsapp/voice-management.service`                             | Default voice name                                 | `"nova"`                                                |
| 47  | `user:asked_questions:{whatsappId}`               | set                     | 604800s (7 days)            | `whatsapp/random-question.service`                                  | `whatsapp/random-question.service`                              | Set of asked question IDs                          | `{"pref_1", "fin_2", ...}`                              |
| 48  | `user:pending_question:{whatsappId}`              | string                  | 300s (5min)                 | `whatsapp/random-question.service`                                  | `whatsapp/random-question.service`                              | Currently pending question                         | `"pref_1"`                                              |
| 49  | `user:knowledge:{whatsappId}:{knowledgeId}`       | string (encrypted JSON) | 2592000s (30 days)          | `whatsapp/user-knowledge-base.service`                              | `whatsapp/user-knowledge-base.service`                          | Individual knowledge entry                         | `{encrypted(UserKnowledge)}`                            |
| 50  | `user:knowledge:{whatsappId}:index`               | set                     | 2592000s (30 days)          | `whatsapp/user-knowledge-base.service`                              | `whatsapp/user-knowledge-base.service`                          | Index of knowledge IDs                             | `{"k1", "k2", ...}`                                     |
| 51  | `user:knowledge:{whatsappId}:category:{category}` | set                     | 2592000s (30 days)          | `whatsapp/user-knowledge-base.service`                              | `whatsapp/user-knowledge-base.service`                          | Knowledge IDs by category                          | `{"k1", "k3"}`                                          |
| 52  | `user_activity:{whatsappId}`                      | string (JSON)           | 300s (5min)                 | `whatsapp/contextual-help.service`                                  | `whatsapp/contextual-help.service`                              | Recent user activity log                           | `[{"command":"balance","type":"BALANCE",...}]`          |
| 53  | `group-rate:{groupId}:{userId}:{commandType}`     | string (JSON)           | configurable windowMs       | `whatsapp/group-rate-limiter.service`                               | `whatsapp/group-rate-limiter.service`                           | Per-user group rate tracking                       | `[1706000000, 1706000001]` (timestamps)                 |
| 54  | `group-rate:{groupId}:all:{commandType}`          | string (JSON)           | configurable windowMs       | `whatsapp/group-rate-limiter.service`                               | `whatsapp/group-rate-limiter.service`                           | Group-wide rate tracking                           | `[1706000000, 1706000001]`                              |
| 55  | `group-rate:block:{groupId}:{userId}`             | string                  | configurable                | `whatsapp/group-rate-limiter.service`                               | `whatsapp/group-rate-limiter.service`                           | User block flag in group                           | `"1"`                                                   |
| 56  | `support_session:{userWhatsappId}`                | string (JSON)           | 7200s (2h)                  | `whatsapp/support-mode.service`                                     | `whatsapp/support-mode.service`                                 | Active support session data                        | `{"userId":"...","status":"active",...}`                |
| 57  | `support_mode:{whatsappId}`                       | string (JSON)           | 7200s (2h)                  | `whatsapp/support-mode.service`                                     | `whatsapp/support-mode.service`                                 | Support mode flag/data                             | `{"active":true,...}`                                   |
| 58  | `support_session:{userWhatsappId}:{timestamp}`    | string (JSON)           | 2592000s (30 days)          | `whatsapp/support-mode.service`                                     | `whatsapp/support-mode.service`                                 | Archived support session                           | `{"userId":"...","status":"ended",...}`                 |
| 59  | `support_log:{userWhatsappId}:{timestamp}`        | string (JSON)           | varies                      | `whatsapp/support-mode.service`                                     | `whatsapp/support-mode.service`                                 | Support interaction log                            | JSON log entry                                          |
| 60  | `tip_stats:group:{groupId}`                       | string (JSON)           | persistent                  | `whatsapp/anonymous-payment.service`                                | `whatsapp/anonymous-payment.service`                            | Group tip statistics                               | `{"totalTips":50,"totalAmount":10000}`                  |
| 61  | `tip_stats:user:{username}`                       | string (JSON)           | persistent                  | `whatsapp/anonymous-payment.service`                                | `whatsapp/anonymous-payment.service`                            | User tip statistics                                | `{"received":25,"totalAmount":5000}`                    |
| 62  | `ai:query:{hash}:{mode}`                          | string                  | configurable (cacheTtl)     | `gemini-ai/gemini-ai.service`                                       | `gemini-ai/gemini-ai.service`                                   | AI response cache                                  | `"Bitcoin is a decentralized..."`                       |
| 63  | `analytics:dialect:{whatsappId}:{timestamp}`      | string (JSON)           | varies                      | `dialect-ai/enhanced-whatsapp.service`                              | `dialect-ai/enhanced-whatsapp.service`                          | Dialect analytics data                             | `{"dialect":"jamaican","confidence":0.9}`               |
| 64  | `tg_pending_send:{callbackId}`                    | string (JSON)           | varies                      | `telegram/telegram.service`                                         | `telegram/telegram.service`                                     | Telegram pending payment data                      | `{"amount":100,"recipient":"alice"}`                    |
| 65  | `tg:{telegramUserId}`                             | string                  | —                           | `telegram/telegram.service`                                         | `telegram/telegram.service`                                     | Telegram user identifier (constructed, not stored) | N/A (used as prefix)                                    |
| 66  | `admin:analytics:{date}`                          | string (JSON)           | 2592000s (30 days)          | `whatsapp/admin-analytics.service`                                  | `whatsapp/admin-analytics.service`                              | Daily activity analytics                           | `[{"userId":"...","command":"balance",...}]`            |
| 67  | `admin:analytics:tx:{date}`                       | string (JSON)           | 2592000s (30 days)          | `whatsapp/admin-analytics.service`                                  | `whatsapp/admin-analytics.service`                              | Daily transaction analytics                        | `[{"userId":"...","amount":100,...}]`                   |
| 68  | `pending_payment:*`                               | string (JSON)           | varies                      | various                                                             | `whatsapp/admin-analytics.service`                              | Pending payment entries (scanned via KEYS)         | `{"amount":100,...}`                                    |
| 69  | `translate:{text}:{targetLang}`                   | string (JSON)           | 3600s (1h)                  | `plugins/translation.plugin`                                        | `plugins/translation.plugin`                                    | Translation cache                                  | `{"translated":"Hola","sourceLang":"en"}`               |
| 70  | `autotranslate:{groupId}`                         | string                  | 604800s (7 days)            | `plugins/translation.plugin`                                        | `plugins/translation.plugin`                                    | Auto-translate enabled flag                        | `"enabled"`                                             |
| 71  | `user:language:{userId}`                          | string                  | varies                      | `plugins/translation.plugin`                                        | `plugins/translation.plugin`                                    | User language preference                           | `"es"`                                                  |
| 72  | `anon:alias:{scope}:{userId}`                     | string                  | 86400s (24h)                | `plugins/anonymous-messaging.plugin`                                | `plugins/anonymous-messaging.plugin`                            | Anonymous alias for user                           | `"Shadow42"`                                            |
| 73  | `anon:message:{messageId}`                        | string (JSON)           | 3600s (1h)                  | `plugins/anonymous-messaging.plugin`                                | `plugins/anonymous-messaging.plugin`                            | Anonymous message content                          | `{"id":"...","from":"Shadow42","text":"..."}`           |
| 74  | `anon:last:{scope}`                               | string                  | 3600s (1h)                  | `plugins/anonymous-messaging.plugin`                                | `plugins/anonymous-messaging.plugin`                            | Last anon message ID (for reply)                   | `"msg_abc123"`                                          |
| 75  | `anon:convo:{convoId}`                            | string (JSON)           | 86400s (24h)                | `plugins/anonymous-messaging.plugin`                                | `plugins/anonymous-messaging.plugin`                            | Anonymous conversation data                        | `{"participants":["user1","user2"],...}`                |
| 76  | `anon:convo:active:{userId}`                      | string                  | 86400s (24h)                | `plugins/anonymous-messaging.plugin`                                | `plugins/anonymous-messaging.plugin`                            | Active conversation ID for user                    | `"convo_xyz789"`                                        |
| 77  | `decision:active:{groupId}`                       | string (JSON)           | 86400s (24h)                | `plugins/decision-making.plugin`                                    | `plugins/decision-making.plugin`                                | Active group decision/poll                         | `{"id":"...","question":"...","votes":{}}`              |
| 78  | `consensus:{decisionId}`                          | string (JSON)           | 86400s (24h)                | `plugins/decision-making.plugin`                                    | `plugins/decision-making.plugin`                                | Discussion thread for decision                     | `{"messages":[...],"participants":[...]}`               |
| 79  | `trivia:active:{userId}`                          | string (JSON)           | 300s (5min)                 | `plugins/trivia.plugin`                                             | `plugins/trivia.plugin`                                         | Active trivia game state                           | `{"question":"...","answer":"B","hints":0}`             |
| 80  | `trivia:answered:{userId}`                        | string (JSON)           | 2592000s (30 days)          | `plugins/trivia.plugin`                                             | `plugins/trivia.plugin`                                         | Set of answered trivia IDs                         | `["q1","q2","q3"]`                                      |
| 81  | `trivia:rewards:{userId}`                         | string                  | persistent                  | `plugins/trivia.plugin`                                             | `plugins/trivia.plugin`                                         | Cumulative trivia reward sats                      | `"1500"`                                                |
| 82  | `trivia:stats:{userId}`                           | string (JSON)           | persistent                  | `plugins/trivia.plugin`                                             | `plugins/trivia.plugin`                                         | Trivia statistics                                  | `{"correct":10,"total":15,"streak":3}`                  |
| 83  | `daily:progress:{userId}:{challengeId}`           | string (JSON)           | 86400s (24h)                | `plugins/daily-challenge.plugin`                                    | `plugins/daily-challenge.plugin`                                | Daily challenge progress                           | `{"completed":false,"steps":[...]}`                     |
| 84  | `daily:streak:{userId}`                           | string (JSON)           | persistent                  | `plugins/daily-challenge.plugin`                                    | `plugins/daily-challenge.plugin`                                | Daily challenge streak data                        | `{"current":5,"best":12,"lastDate":"..."}`              |
| 85  | `daily:stats:{userId}`                            | string (JSON)           | persistent                  | `plugins/daily-challenge.plugin`                                    | `plugins/daily-challenge.plugin`                                | Daily challenge stats                              | `{"completed":30,"totalPoints":450}`                    |
| 86  | `trivia:daily:{userId}:{date}`                    | string (JSON)           | varies                      | `plugins/daily-challenge.plugin`                                    | `plugins/daily-challenge.plugin`                                | Daily trivia stats                                 | `{"correct":3,"total":5}`                               |
| 87  | `poll:active:{groupId}`                           | string (JSON)           | varies                      | `plugins/group-games.plugin`                                        | `plugins/group-games.plugin`                                    | Active poll in group                               | `{"question":"...","options":[...],"votes":{}}`         |
| 88  | `game:active:{groupId}`                           | string (JSON)           | varies                      | `plugins/group-games.plugin`                                        | `plugins/group-games.plugin`                                    | Active game in group                               | `{"type":"wordchain","state":{...}}`                    |
| 89  | `{prefix}:{hash(identifier)}`                     | string                  | varies                      | `redis.service` (hashKey utility)                                   | any                                                             | Privacy-hashed key pattern                         | Depends on usage                                        |

---

## Session Schema

The `session:{sessionId}` key stores an encrypted JSON `UserSession` object with these fields:

| Field              | Type    | Description                                          |
| ------------------ | ------- | ---------------------------------------------------- |
| `sessionId`        | string  | Unique hex session ID (32 chars)                     |
| `whatsappId`       | string  | WhatsApp JID (e.g., `18765551234@c.us` or `...@lid`) |
| `phoneNumber`      | string  | User's phone number                                  |
| `flashUserId`      | string? | Flash API user ID (set after linking)                |
| `flashAuthToken`   | string? | Flash API auth token (set after linking)             |
| `isVerified`       | boolean | Whether Flash account is linked                      |
| `createdAt`        | Date    | Session creation timestamp                           |
| `expiresAt`        | Date    | Session expiry timestamp                             |
| `lastActivity`     | Date    | Last activity timestamp (refreshes TTL)              |
| `mfaVerified`      | boolean | MFA verification status                              |
| `mfaExpiresAt`     | Date?   | MFA verification expiry                              |
| `consentGiven`     | boolean | User consent status                                  |
| `consentTimestamp` | Date?   | When consent was given                               |

**Secondary indices:**

- `whatsapp:{hash(whatsappId)}` → `sessionId` (hashed for privacy)
- `username:{username}` → `whatsappId` (lowercase)

**Encryption:** All session data is stored using `RedisService.setEncrypted()` (AES-256 encryption via `CryptoService`). Decryption failures on session keys are NOT auto-deleted (kept for recovery). Non-session keys with decryption failures ARE auto-deleted.

---

## Cache Keys

### Balance Cache

- **Key**: `balance:{flashUserId}`
- **Type**: string (encrypted JSON `BalanceInfo`)
- **TTL**: 30s default (configurable via `cache.balanceTtl`)
- **Data**:
  ```json
  {
    "btcBalance": 50000,
    "fiatBalance": 125.5,
    "fiatCurrency": "USD",
    "lastUpdated": "2026-01-29T10:00:00Z",
    "exchangeRate": { "usdCentPrice": { "base": 9700000, "offset": 2 } }
  }
  ```

### Price Cache

- **Key**: `price:btc:{currency}`
- **Type**: string (plain JSON `PriceInfo`)
- **TTL**: 900s (15min, configurable via `cache.priceTtl`)
- **Data**:
  ```json
  {
    "btcPrice": 97000.0,
    "currency": "USD",
    "timestamp": "2026-01-29T10:00:00Z"
  }
  ```

### AI Response Cache

- **Key**: `ai:query:{sha256(query)}:{voice|text}`
- **Type**: string (plain text)
- **TTL**: configurable (service-level `cacheTtl`)
- **Data**: AI-generated response text

### Translation Cache

- **Key**: `translate:{text}:{targetLang}`
- **Type**: string (JSON)
- **TTL**: 3600s (1h)

### Cache Manager Service

The `CacheManagerService` provides a generic caching layer on top of `RedisService` with configurable prefixes. Default TTLs:

| Prefix        | Default TTL |
| ------------- | ----------- |
| `balance`     | from config |
| `price`       | from config |
| `username`    | from config |
| `transaction` | from config |
| `session`     | from config |
| `user`        | from config |

---

## Rate Limiting Keys

### RateLimiterGuard (basic)

- **Key**: `rate-limit:{clientId}`
- **clientId**: WhatsApp phone (from body `From`) or IP address
- **TTL**: `windowMs / 1000` (default 60s)
- **Mechanism**: GET → check count, SET/INCR → increment

### RateLimitGuard (decorator-based)

- **Key**: `rate_limit:whatsapp:{phoneNumber}` (for webhook requests)
- **Key**: `rate_limit:{ip}:{method}:{path}` (for other requests)
- **TTL**: `window / 1000` (set on first INCR)
- **Mechanism**: INCR → SET expiry on count=1

### EnhancedRateLimiterGuard

- **Key**: `rate-limit:{keyGenerator(req)}`
- **Pre-configured key generators**:
  - AUTH: `rate-limit:{ip}:{method}:{path}` (5 req / 5min)
  - PAYMENT: `rate-limit:{ip}:{method}:{path}` (5 req / 1min)
  - API: `rate-limit:{ip}:{method}:{path}` (100 req / 1min)
  - WEBHOOK: `rate-limit:webhook:{x-webhook-id}` (10 req / 1s)
  - WHATSAPP: `rate-limit:whatsapp:{whatsappId}` (20 req / 1min)

### AdminRateLimitGuard

- **Key**: `admin:ratelimit:{identifier}:{handlerName}`
- **identifier**: authenticated user phoneNumber or IP
- **TTL**: configurable per-handler via `@RateLimit(limit, windowMs)` decorator

### Group Rate Limiter

- **Key**: `group-rate:{groupId}:{userId}:{commandType}` (per-user in group)
- **Key**: `group-rate:{groupId}:all:{commandType}` (group-wide)
- **Key**: `group-rate:block:{groupId}:{userId}` (block flag)
- **Data**: JSON array of timestamps
- **TTL**: configurable window per command type

---

## Deduplication Keys

| Key Pattern                        | TTL    | Purpose                                 |
| ---------------------------------- | ------ | --------------------------------------- |
| `payment_notif_sent:{paymentHash}` | 7 days | Prevent duplicate payment notifications |
| `whatsapp:message:{messageId}`     | varies | Prevent duplicate message processing    |

---

## Feature Flag / Admin Keys

| Key                         | Type                | TTL              | Description                                |
| --------------------------- | ------------------- | ---------------- | ------------------------------------------ |
| `admin:settings`            | string (JSON)       | persistent       | Full admin settings blob                   |
| `admin:lockdown`            | string              | persistent       | Quick-access lockdown flag (`"0"` / `"1"`) |
| `admin:groups_enabled`      | string              | persistent       | Quick-access groups flag (`"0"` / `"1"`)   |
| `admin:voice_mode`          | string              | persistent       | Voice mode (`"on"`, `"off"`, `"always"`)   |
| `admin:command:history`     | string (JSON array) | persistent       | Command execution history                  |
| `admin:audit:log`           | list (LPUSH)        | persistent       | Audit log entries                          |
| `admin:temp:{sessionId}`    | string (encrypted)  | varies           | Temporary admin session                    |
| `admin:session:{sessionId}` | string (encrypted)  | 604800s (7 days) | Admin dashboard session                    |
| `stats:messages`            | string (JSON)       | persistent       | Message statistics                         |
| `system:errors`             | string (JSON)       | persistent       | System error log                           |

---

## Plugin State Keys

### Trivia Plugin

| Key                            | TTL        | Description             |
| ------------------------------ | ---------- | ----------------------- |
| `trivia:active:{userId}`       | 300s       | Current trivia question |
| `trivia:answered:{userId}`     | 30 days    | Answered question IDs   |
| `trivia:rewards:{userId}`      | persistent | Cumulative reward sats  |
| `trivia:stats:{userId}`        | persistent | Win/loss statistics     |
| `trivia:daily:{userId}:{date}` | varies     | Daily trivia stats      |

### Daily Challenge Plugin

| Key                                     | TTL        | Description        |
| --------------------------------------- | ---------- | ------------------ |
| `daily:progress:{userId}:{challengeId}` | 24h        | Challenge progress |
| `daily:streak:{userId}`                 | persistent | Streak counter     |
| `daily:stats:{userId}`                  | persistent | Overall stats      |

### Group Games Plugin

| Key                     | TTL    | Description       |
| ----------------------- | ------ | ----------------- |
| `poll:active:{groupId}` | varies | Active poll data  |
| `game:active:{groupId}` | varies | Active game state |

### Anonymous Messaging Plugin

| Key                           | TTL | Description                 |
| ----------------------------- | --- | --------------------------- |
| `anon:alias:{scope}:{userId}` | 24h | User's anonymous alias      |
| `anon:message:{messageId}`    | 1h  | Message content             |
| `anon:last:{scope}`           | 1h  | Last message ID for replies |
| `anon:convo:{convoId}`        | 24h | Conversation data           |
| `anon:convo:active:{userId}`  | 24h | Active conversation pointer |

### Decision Making Plugin

| Key                         | TTL | Description              |
| --------------------------- | --- | ------------------------ |
| `decision:active:{groupId}` | 24h | Active decision/proposal |
| `consensus:{decisionId}`    | 24h | Discussion thread        |

### Translation Plugin

| Key                             | TTL    | Description         |
| ------------------------------- | ------ | ------------------- |
| `translate:{text}:{targetLang}` | 1h     | Translation cache   |
| `autotranslate:{groupId}`       | 7 days | Auto-translate flag |
| `user:language:{userId}`        | varies | Language preference |

---

## Messaging State Keys

### WhatsApp Service (God Service) Keys

| Key                                          | TTL    | Description                     |
| -------------------------------------------- | ------ | ------------------------------- |
| `contacts:{whatsappId}`                      | 1 year | Saved contacts map              |
| `contact_history:{whatsappId}:{contactName}` | 1 year | Transaction history per contact |
| `pending_send:{whatsappId}`                  | 5min   | Pending send confirmation       |
| `pending_request:{whatsappId}`               | 5min   | Pending payment request         |
| `pending_ai_question:{whatsappId}`           | varies | Pending AI question             |
| `pending_payments:{whatsappId}`              | varies | Pending payments list           |
| `vybz_waiting:{whatsappId}`                  | 5min   | Vybz content waiting flag       |
| `vybz_queue:{whatsappId}`                    | 5min   | Vybz upload queue               |
| `vybz_daily:{whatsappId}:{dateString}`       | 24h    | Daily post counter              |
| `vybz_posts:{whatsappId}`                    | varies | Post history                    |

### Invoice Tracking

| Key                          | TTL        | Description           |
| ---------------------------- | ---------- | --------------------- |
| `invoice:{paymentHash}`      | 1h         | Invoice data          |
| `user:{whatsappId}:invoices` | persistent | Set of invoice hashes |

### Support Mode

| Key                                            | TTL     | Description            |
| ---------------------------------------------- | ------- | ---------------------- |
| `support_session:{userWhatsappId}`             | 2h      | Active support session |
| `support_mode:{whatsappId}`                    | 2h      | Support mode flag      |
| `support_session:{userWhatsappId}:{timestamp}` | 30 days | Archived session       |
| `support_log:{userWhatsappId}:{timestamp}`     | varies  | Interaction log        |

### Other

| Key                                 | TTL          | Description              |
| ----------------------------------- | ------------ | ------------------------ |
| `undo_tx:{whatsappId}`              | 60s          | Undoable transaction     |
| `payment_confirmation:{whatsappId}` | varies       | Payment pending confirm  |
| `payment_templates:{whatsappId}`    | persistent   | Payment templates        |
| `user_voice_settings:{whatsappId}`  | configurable | Voice preferences        |
| `user_activity:{whatsappId}`        | 5min         | Contextual help activity |

### Telegram

| Key                            | TTL    | Description              |
| ------------------------------ | ------ | ------------------------ |
| `tg_pending_send:{callbackId}` | varies | Pending Telegram payment |

### Analytics

| Key                                          | TTL     | Description            |
| -------------------------------------------- | ------- | ---------------------- |
| `admin:analytics:{date}`                     | 30 days | Daily activity logs    |
| `admin:analytics:tx:{date}`                  | 30 days | Daily transaction logs |
| `analytics:dialect:{whatsappId}:{timestamp}` | varies  | Dialect analysis data  |

---

## WhatsApp ID Normalization Layer

The `WhatsAppRedisService` wraps `RedisService` to handle WhatsApp's dual ID format problem:

- **@c.us format**: `18765551234@c.us` (classic)
- **@lid format**: `18765551234@lid` (newer linked ID format)

**How it works**: When reading a key, it tries the original ID first, then tries alternative formats via `WhatsAppIdNormalizer.getPossibleFormats()`. When writing, it normalizes to a canonical format.

**Key pattern template**: Uses `${whatsappId}` as placeholder in patterns like `user:${whatsappId}:data`.

**Impact on migration**: This layer must be removed in the new architecture since we'll use platform-agnostic `UserId` (UUID) as the canonical identifier.

---

## Migration Strategy

### Design Principles

1. **Platform-agnostic identity**: Replace all `{whatsappId}` segments with `{userId}` (UUID from Identity module)
2. **Namespace prefixing**: Add domain namespace prefixes (e.g., `pulse:session:`, `pulse:cache:`)
3. **Remove WhatsApp normalization**: Eliminate the dual-format ID lookup since UUID is canonical
4. **Maintain encryption**: Keep encrypted storage for sensitive data (sessions, balances, OTPs)

### Old Key → New Key Mapping

| #   | Old Key Pattern                                       | New Key Pattern                                             | Reason for Change                         |
| --- | ----------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| 1   | `session:{sessionId}`                                 | `pulse:session:{sessionId}`                                 | Add namespace prefix                      |
| 2   | `whatsapp:{hash(whatsappId)}`                         | `pulse:identity:platform:{platformType}:{hash(platformId)}` | Platform-agnostic identity lookup         |
| 3   | `username:{username}`                                 | `pulse:identity:username:{username}`                        | Namespace + maps to userId not whatsappId |
| 4   | `otp:{sessionId}`                                     | `pulse:auth:otp:{sessionId}`                                | Namespace prefix                          |
| 5   | `balance:{userId}`                                    | `pulse:cache:balance:{userId}`                              | Namespace prefix (userId already correct) |
| 6   | `price:btc:{currency}`                                | `pulse:cache:price:btc:{currency}`                          | Namespace prefix                          |
| 7   | `rate-limit:*` / `rate_limit:*`                       | `pulse:ratelimit:{scope}:{identifier}`                      | Normalize inconsistent prefixes           |
| 8   | `admin:ratelimit:*`                                   | `pulse:ratelimit:admin:{identifier}:{handler}`              | Merge into unified ratelimit namespace    |
| 9   | `payment_notif_sent:{paymentHash}`                    | `pulse:dedup:notification:{paymentHash}`                    | Namespace prefix                          |
| 10  | `last_tx_id:{whatsappId}`                             | `pulse:notification:last-tx:{userId}`                       | whatsappId → userId                       |
| 11  | `last_tx_id:timestamp:{whatsappId}`                   | `pulse:notification:last-tx-ts:{userId}`                    | whatsappId → userId                       |
| 12  | `admin:settings`                                      | `pulse:admin:settings`                                      | Namespace prefix                          |
| 13  | `admin:lockdown`                                      | `pulse:admin:flag:lockdown`                                 | Structured flags                          |
| 14  | `admin:groups_enabled`                                | `pulse:admin:flag:groups-enabled`                           | Structured flags                          |
| 15  | `admin:voice_mode`                                    | `pulse:admin:flag:voice-mode`                               | Structured flags                          |
| 16  | `admin:command:history`                               | `pulse:admin:command-history`                               | Namespace prefix                          |
| 17  | `admin:audit:log`                                     | `pulse:admin:audit-log`                                     | Namespace prefix                          |
| 18  | `admin:temp:{sessionId}`                              | `pulse:admin:temp-session:{sessionId}`                      | Namespace prefix                          |
| 19  | `admin:session:{sessionId}`                           | `pulse:admin:session:{sessionId}`                           | Namespace prefix                          |
| 20  | `contacts:{whatsappId}`                               | `pulse:user:{userId}:contacts`                              | whatsappId → userId, restructure          |
| 21  | `contact_history:{whatsappId}:{name}`                 | `pulse:user:{userId}:contact-history:{name}`                | whatsappId → userId                       |
| 22  | `pending_send:{whatsappId}`                           | `pulse:pending:send:{userId}`                               | whatsappId → userId                       |
| 23  | `pending_request:{whatsappId}`                        | `pulse:pending:request:{userId}`                            | whatsappId → userId                       |
| 24  | `pending_ai_question:{whatsappId}`                    | `pulse:pending:ai-question:{userId}`                        | whatsappId → userId                       |
| 25  | `pending_payments:{whatsappId}`                       | `pulse:pending:payments:{userId}`                           | whatsappId → userId                       |
| 26  | `vybz_*:{whatsappId}*`                                | `pulse:vybz:{type}:{userId}:*`                              | whatsappId → userId                       |
| 27  | `whatsapp:message:{messageId}`                        | `pulse:dedup:message:{platform}:{messageId}`                | Platform-agnostic dedup                   |
| 28  | `invoice:{paymentHash}`                               | `pulse:invoice:{paymentHash}`                               | Namespace prefix                          |
| 29  | `user:{whatsappId}:invoices`                          | `pulse:user:{userId}:invoices`                              | whatsappId → userId                       |
| 30  | `payment_confirmation:{whatsappId}`                   | `pulse:pending:payment-confirm:{userId}`                    | whatsappId → userId                       |
| 31  | `undo_tx:{whatsappId}`                                | `pulse:pending:undo:{userId}`                               | whatsappId → userId                       |
| 32  | `user_voice_settings:{whatsappId}`                    | `pulse:user:{userId}:voice-settings`                        | whatsappId → userId                       |
| 33  | `payment_templates:{whatsappId}`                      | `pulse:user:{userId}:payment-templates`                     | whatsappId → userId                       |
| 34  | `elevenlabs:*`                                        | `pulse:voice:*`                                             | Vendor-agnostic naming                    |
| 35  | `user:asked_questions:{whatsappId}`                   | `pulse:user:{userId}:asked-questions`                       | whatsappId → userId                       |
| 36  | `user:pending_question:{whatsappId}`                  | `pulse:user:{userId}:pending-question`                      | whatsappId → userId                       |
| 37  | `user:knowledge:{whatsappId}:*`                       | `pulse:user:{userId}:knowledge:*`                           | whatsappId → userId                       |
| 38  | `user_activity:{whatsappId}`                          | `pulse:user:{userId}:activity`                              | whatsappId → userId                       |
| 39  | `group-rate:*`                                        | `pulse:ratelimit:group:{groupId}:*`                         | Merge into ratelimit namespace            |
| 40  | `support_session:*` / `support_mode:*`                | `pulse:support:session:{userId}:*`                          | Namespace + whatsappId → userId           |
| 41  | `support_log:*`                                       | `pulse:support:log:{userId}:*`                              | whatsappId → userId                       |
| 42  | `tip_stats:group:{groupId}`                           | `pulse:stats:tips:group:{groupId}`                          | Namespace prefix                          |
| 43  | `tip_stats:user:{username}`                           | `pulse:stats:tips:user:{userId}`                            | username → userId                         |
| 44  | `ai:query:*`                                          | `pulse:cache:ai:{hash}:{mode}`                              | Namespace prefix                          |
| 45  | `tg_pending_send:{callbackId}`                        | `pulse:pending:send:{platform}:{callbackId}`                | Platform-agnostic                         |
| 46  | `admin:analytics:*`                                   | `pulse:analytics:{type}:{date}`                             | Namespace prefix                          |
| 47  | `analytics:dialect:*`                                 | `pulse:analytics:dialect:{userId}:{timestamp}`              | whatsappId → userId                       |
| 48  | `trivia:*:{userId}`                                   | `pulse:plugin:trivia:{type}:{userId}`                       | Plugin namespace                          |
| 49  | `daily:*:{userId}*`                                   | `pulse:plugin:daily:{type}:{userId}:*`                      | Plugin namespace                          |
| 50  | `poll:active:{groupId}`                               | `pulse:plugin:poll:active:{groupId}`                        | Plugin namespace                          |
| 51  | `game:active:{groupId}`                               | `pulse:plugin:game:active:{groupId}`                        | Plugin namespace                          |
| 52  | `anon:*`                                              | `pulse:plugin:anon:*`                                       | Plugin namespace                          |
| 53  | `decision:*` / `consensus:*`                          | `pulse:plugin:decision:*`                                   | Plugin namespace                          |
| 54  | `translate:*` / `autotranslate:*` / `user:language:*` | `pulse:plugin:translate:*`                                  | Plugin namespace                          |
| 55  | `stats:messages`                                      | `pulse:stats:messages`                                      | Namespace prefix                          |
| 56  | `system:errors`                                       | `pulse:system:errors`                                       | Namespace prefix                          |

### Migration Script Requirements

The migration script (Task 20) must:

1. **Build identity mapping first**:
   - Scan all `session:*` keys
   - Extract `whatsappId` from each session
   - Create a `Map<whatsappId, userId>` mapping (userId = UUID, generated or from Flash API `flashUserId`)
   - Store mapping in `pulse:migration:id-map:{whatsappId}` → `{userId}` for reference

2. **Migrate in phases**:
   - **Phase 1**: Sessions + Identity (create `pulse:identity:*` keys alongside old keys)
   - **Phase 2**: User data (contacts, templates, settings — requires identity map)
   - **Phase 3**: Transient data (pending ops, rate limits — skip, let them expire)
   - **Phase 4**: Admin/system data (simple prefix rename)
   - **Phase 5**: Plugin data (prefix rename + optional userId migration)

3. **Dual-write period**:
   - During migration, write to BOTH old and new key patterns
   - Old code reads old keys, new code reads new keys
   - After cutover, stop writing old keys
   - Let old keys expire naturally via TTL

4. **Handle encrypted data**:
   - Session data is AES-256 encrypted — must decrypt with OLD key and re-encrypt with NEW key if encryption key changes
   - If encryption key stays the same, encrypted data can be copied directly

5. **Idempotent execution**:
   - Script must be safe to run multiple times
   - Use `SETNX` or check-before-write pattern
   - Track migration progress in `pulse:migration:status` key

### Rollback Procedure

1. **Before migration**: Snapshot Redis with `BGSAVE` or `RDB` dump
2. **During dual-write**: Old keys are still being written — rollback = stop new code, old code continues working
3. **After cutover**:
   - Run rollback script that reads `pulse:migration:id-map:*` to reverse map
   - Copy `pulse:*` keys back to old key patterns
   - Or restore from RDB snapshot
4. **Nuclear option**: Restore Redis from pre-migration RDB snapshot. Sessions will be stale but users can re-link.

### Key Observations

- **89 distinct key patterns** identified across the codebase
- **~45 patterns use `whatsappId`** as part of the key — all need userId migration
- **3 different rate limiter implementations** with inconsistent key prefixes (`rate-limit:`, `rate_limit:`, `admin:ratelimit:`) — consolidate in new architecture
- **WhatsApp "god service"** owns ~20 key patterns alone — hexagonal refactor must distribute these across proper domain services
- **No Redis key expiration on ~15 patterns** (persistent data) — evaluate if TTLs should be added
- **Encrypted vs plain storage is inconsistent** — sessions and balances are encrypted, but contacts (with phone numbers) are stored as plain JSON
- **The `WhatsAppRedisService` normalization layer** performs up to 3 Redis lookups per read — UUID-based keys eliminate this overhead entirely
