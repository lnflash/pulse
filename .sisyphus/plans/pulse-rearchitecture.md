# Pulse Re-Architecture: Greenfield Hexagonal Rewrite

## TL;DR

> **Quick Summary**: Complete greenfield rewrite of Pulse (WhatsApp/Telegram bot for Flash Bitcoin Lightning wallet) from a 6,500-line god service monolith into a hexagonal (ports-and-adapters) architecture with platform-agnostic core, WhatsApp Cloud API (replacing whatsapp-web.js), Jamaican Patois NLP normalization, and process isolation via RabbitMQ.
>
> **Deliverables**:
>
> - Hexagonal NestJS application with 12 bounded modules (bot-core, platform, wallet, identity, session, nlp, ai, voice, admin, observability, plugins, queue)
> - WhatsApp Cloud API adapter (replacing whatsapp-web.js/Puppeteer)
> - Telegram adapter (Telegraf, cleaned)
> - Platform-agnostic bot core with intent pipeline + handler registry
> - Canonical message model + identity mapping (killing "whatsappId everywhere")
> - Jamaican Patois text normalization layer (dictionary-based, ML-ready interface)
> - Voice module as pluggable adapter (STT/TTS)
> - Feature parity with all existing commands (25+) and plugins (7)
> - TDD: every handler and module tested
> - Process-split deployment via RabbitMQ (Phase 10)
> - Built-in admin module with feature flags
>
> **Estimated Effort**: XL (multi-week)
> **Parallel Execution**: YES - up to 4 waves
> **Critical Path**: Task 1 → 2 → 3 → 5 → 6 → 8 → 9 → 10

---

## Context

### Original Request

Complete re-architecture of Pulse to address: 6,508-line god service, duplicated business logic across platforms, incomplete/unused abstraction layers, WhatsApp connection instability, hardcoded platform assumptions, and prepare for multi-platform expansion.

### Interview Summary

**Key Discussions**:

- **Strategy**: Greenfield rewrite on fresh branch (same repo), not incremental strangler fig
- **Framework**: Keep NestJS — problem was module discipline, not framework
- **Platforms**: Replace whatsapp-web.js entirely with WhatsApp Cloud API; keep Telegram; design for future Signal/SMS/web
- **AI/NLP**: Jamaican Patois is a first-class concern. JamPatoisNLI (Stanford 2022) shows XLM-R transfer learning works. Dictionary normalization for Phase 1, ML-ready interface for later.
- **Voice**: Actively used but must be a pluggable module, not embedded in core
- **Admin**: Built-in module with feature flags
- **Deployment**: Split processes via RabbitMQ (already installed on server)
- **Testing**: TDD for all new code
- **Timeline**: No rush, do it right
- **Meta Business API**: Not yet set up — needs onboarding
- **Feature scope**: Migrate everything — all commands, all plugins

**Research Findings**:

- Oracle architecture consultation recommended hexagonal + process split + NestJS retention
- Current codebase has partial WhatsApp Cloud API service (commented out), RabbitMQ event dispatcher, plugin system, two conflicting messaging abstractions
- 55 existing test files with Jest, ~745 tests from prior blitz
- RabbitMQ is already running on production server (ports 5672, 15672, 25672 confirmed via `ss`)

### Metis Review

**Critical Gaps Addressed**:

- Existing plugin system (7 plugins) must be migrated — plugin port added to architecture
- Flash GraphQL queries must be copied verbatim, not restructured
- Start as monolith with hex boundaries, split processes last (dramatically reduces risk)
- JamPatois ML is a separate workstream — dictionary normalization only in Phase 1
- Redis key pattern migration needed for existing user data
- WhatsApp Cloud API feature gap analysis needed vs whatsapp-web.js
- RabbitMQ message contract must be defined before process split
- Feature inventory from god service required to prevent regression

---

## Work Objectives

### Core Objective

Rewrite Pulse as a hexagonal (ports-and-adapters) NestJS application where business logic is completely platform-agnostic, platforms are thin adapters, and the system is decomposed into 12 bounded modules with clean interfaces. Deploy initially as monolith, split into processes in final phase.

### Concrete Deliverables

- New `src/` directory structure on fresh branch with 12 NestJS modules
- Canonical message model (`InboundMessage`, `OutboundMessage`, `ActorId`, `UserId`)
- WhatsApp Cloud API adapter (webhook-based, no Puppeteer)
- Telegram adapter (Telegraf, uses shared core)
- Intent pipeline: normalization → rules → LLM → fallback
- 25+ command handlers (one class per command, decorator-registered)
- 6+ plugin migrations with plugin port interface
- Voice STT/TTS as pluggable adapter module
- Admin module with feature flags
- Full Jest test suite (TDD)
- RabbitMQ message contracts + process-split deployment
- Redis data migration script for existing users

### Definition of Done

- [ ] All 25+ commands from current god service have individual handlers with tests
- [ ] All 7 plugins migrated with tests
- [ ] `grep -r "whatsapp-web.js\|telegraf" src/core/ src/modules/wallet/ src/modules/nlp/ src/modules/identity/ src/modules/session/ src/modules/bot-core/` returns zero results (no platform leaks in core)
- [ ] `npx jest` — all tests pass
- [ ] End-to-end: WhatsApp Cloud API webhook → intent → handler → response sent via Cloud API
- [ ] End-to-end: Telegram message → same core → response sent via Telegraf
- [ ] Feature parity matrix: every command from old system verified in new

### Must Have

- Complete feature parity with current production Pulse v3.0.0, with the following Cloud API group limitation exceptions:
  - **Full parity** (identical behavior): All DM features, all commands, all plugins in DM context
  - **Degraded parity** (functional but different trigger): Group features that required reading all group messages (whatsapp-web.js) now require @mentioning the bot (Cloud API limitation). These count as PASSING parity if the handler responds correctly when triggered via @mention.
  - **Disabled parity** (graceful degradation): Any group feature that is technically impossible via Cloud API (e.g., reading messages the bot is not mentioned in) counts as PASSING parity if the handler returns a clear user-facing message explaining the limitation.
  - **Truth table**: Task 2's `docs/whatsapp-cloud-api-setup.md` MUST include a "Group Feature Parity" section with a table: `feature × whatsapp-web.js behavior × Cloud API behavior × parity classification (full/degraded/disabled)`. Task 22's parity matrix references this table.
- Platform-agnostic core (zero platform imports)
- WhatsApp Cloud API adapter (not whatsapp-web.js)
- Telegram adapter sharing the same core
- TDD — every handler tested before implementation
- Jamaican Patois text normalization (dictionary-based minimum)
- Voice module as pluggable adapter
- Admin module with feature flags
- Redis data migration for existing users

### Must NOT Have (Guardrails)

- **No feature additions** during rewrite — migrate existing only, zero new features until parity
- **No Patois ML model training** — dictionary/regex normalization only; ML interface designed but not implemented
- **No new platform adapters** beyond WhatsApp Cloud API + Telegram (Signal, SMS, web are future)
- **No admin feature expansion** — feature flags = simple Redis booleans, not a platform
- **No Flash API restructuring** — copy existing GraphQL queries verbatim from `src/modules/flash-api/graphql/queries.ts`, `src/modules/flash-api/graphql/mutations.ts`, `src/modules/flash-api/graphql/subscriptions.ts`
- **No whatsapp-web.js** in the new codebase — Cloud API only
- **No Puppeteer/Chrome** dependency in new code paths. `package.json` still lists `puppeteer` and `whatsapp-web.js` because legacy code remains on branch as reference. Task 23 (cutover) adds an acceptance criterion to remove these deps from `package.json` when legacy code is cleaned up. The grep purity checks (core paths) verify no new code imports them.
- **No observability infrastructure** — no Prometheus server, no Grafana dashboards, no distributed tracing setup. However, the app MAY expose a `/metrics` endpoint using the existing `prom-client` package (already installed) for future scraping. The observability module covers: structured logging, health checks, and Prometheus-format metrics endpoint. No external infrastructure setup.
- **No AI slop**: No premature abstractions, no over-engineered factory patterns, no unnecessary generics, no documentation comments on obvious code

---

## Core Contracts (MUST be implemented exactly as specified)

### 1. IntentResult Shape (including plugin outcomes)

```typescript
// Core intents are enum values
enum Intent {
  Balance,
  SendPayment,
  Receive,
  Price,
  TransactionHistory,
  Link,
  Verify,
  Unlink,
  Refresh,
  Contact,
  ContactImport,
  Help,
  Support,
  Onboarding,
  VoiceSettings,
  Admin,
  RequestPayment,
  PaymentTemplate,
  Notification,
  Settings,
  Language,
  Tip,
  GroupTip,
  Undo,
  PaymentConfirmation,
  Conversation, // fallback: general AI chat
  Unknown, // unrecognized
  // ... additional intents from feature inventory (Task 1)
}

// Plugin intents use a discriminated union, NOT enum expansion
type IntentResult =
  | {
      kind: 'core';
      intent: Intent;
      slots: Record<string, string>;
      confidence: number;
      rawText: string;
    }
  | {
      kind: 'plugin';
      pluginId: string;
      action: string;
      slots: Record<string, string>;
      confidence: number;
      rawText: string;
    };

// The CommandRouter handles both:
// - `kind: 'core'` → looks up handler by Intent enum
// - `kind: 'plugin'` → delegates to PluginRegistry.getHandler(pluginId, action)

// Plugin recognizer registration:
// Each plugin implements a `getRecognizers(): PluginRecognizer[]` method on the PluginPort interface.
// PluginRecognizer = { pluginId: string; action: string; patterns: RegExp[]; keywords: string[] }
// During module init, PluginRegistry collects all recognizers and registers them as a
// "PluginRecognizerStage" in the IntentPipeline (inserted between PatternRecognizer and LLMClassifier).
// When a plugin pattern matches, it produces: { kind: 'plugin', pluginId, action, slots, confidence: 1.0 }
// This is tested in Task 15 by: registering a mock plugin with patterns → sending matching text → asserting plugin intent produced.
```

**Why discriminated union**: Avoids bloating the Intent enum with plugin-specific values. Plugins register their own action strings. Core routing stays fixed.

### 2. Outbound Formatting Contract

````typescript
// Canonical outbound text uses a structured formatting model, NOT markdown or plain text.
// Adapters convert this to platform-specific formats.

type FormattedText = Array<FormattedSegment>;

type FormattedSegment =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'code'; value: string }
  | { type: 'newline' }
  | { type: 'link'; url: string; label?: string };

// Example: "Your balance is *1,000 sats*"
// → [{ type: 'text', value: 'Your balance is ' }, { type: 'bold', value: '1,000 sats' }]

// Adapter conversion:
// WhatsApp Cloud API: bold → *text*, italic → _text_, code → ```text```
// Telegram: bold → <b>text</b> (HTML mode) or *text* (Markdown mode)
// Plain text fallback: strip formatting, return raw text

// OutboundContent uses FormattedText:
interface OutboundTextContent {
  type: 'text';
  body: FormattedText;
  buttons?: Array<{ id: string; label: string }>; // optional interactive buttons
  listSections?: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
}
````

**FormattedText Edge Case Rules** (MUST be implemented in adapter conversion logic):

| Edge Case                               | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Example                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Literal `*` or `_`**                  | Escape with backslash in `text` segment: `value: "5 \\* 3 = 15"`. Adapters strip backslash before platform-specific escaping.                                                                                                                                                                                                                                                                                                                                  | `{ type: 'text', value: '5 \\* 3 = 15' }` → WA: `5 * 3 = 15` (no bold)                   |
| **Adjacent same-type segments**         | Merge at render time. `[bold("a"), bold("b")]` → adapter renders as single `*ab*`, not `*a**b*`.                                                                                                                                                                                                                                                                                                                                                               | Prevents double-delimiter glitches                                                       |
| **Newlines within segments**            | Forbidden. Use explicit `{ type: 'newline' }` between segments. Validator rejects `value` containing `\n`.                                                                                                                                                                                                                                                                                                                                                     | `[text("line1"), newline(), text("line2")]`                                              |
| **Code fences / multi-line code**       | `{ type: 'code', value: "multi\nline" }` is the ONE exception to the newline rule — code segments MAY contain `\n`. Adapter wraps in triple backticks.                                                                                                                                                                                                                                                                                                         | WA: ` ```multi\nline``` `, TG: `<code>multi\nline</code>`                                |
| **Empty segments**                      | Forbidden. Validator rejects segments with empty `value` string.                                                                                                                                                                                                                                                                                                                                                                                               | `{ type: 'text', value: '' }` → validation error                                         |
| **WhatsApp interactive message limits** | Buttons: max 3 quick-reply buttons, label max 20 chars. List sections: max 10 sections, 10 rows/section, title max 24 chars. **Validation behavior**: adapters MUST truncate labels to max length (with `…` suffix) and silently drop excess buttons/rows beyond the limit. Adapters MUST NOT throw — the user always gets a response. Log a warning when truncation occurs. Tests: assert that a message with 5 buttons renders 3 + truncation, not an error. | Cloud API rejects payloads exceeding limits — adapter pre-validates to prevent rejection |
| **Plain text fallback**                 | `toPlainText(segments)`: strip all formatting, join with empty string, replace `newline` with `\n`. Every adapter MUST implement this as fallback.                                                                                                                                                                                                                                                                                                             | Used for SMS, logs, error contexts                                                       |

**Golden fixture extraction** (for Tasks 11-13): Extract response strings from the god service, then convert WhatsApp markdown to `FormattedText` segments. The fixture files store `FormattedText` arrays, and handler tests assert output matches these fixtures structurally (not as raw strings).

**Fixture conversion procedure** (WhatsApp markdown → FormattedText):

1. Split the response string on `\n` → insert `{ type: 'newline' }` between each line
2. Within each line, parse WhatsApp formatting markers: `*text*` → `{ type: 'bold', value: 'text' }`, `_text_` → `{ type: 'italic', value: 'italic' }`, ` ```text``` ` → `{ type: 'code', value: 'text' }`
3. Literal `*` or `_` that are NOT formatting (e.g., math expressions, bullet points): escape as `\\*` or `\\_` in the `text` segment value
4. Unformatted text between markers → `{ type: 'text', value: '...' }`
5. Empty lines → two consecutive `{ type: 'newline' }` segments
6. If ambiguous whether `*` is formatting or literal: check if it has matching closer on same line. No match = literal.

### 3. Monolith vs RabbitMQ Wiring Contract

```
AUTHORITATIVE RULE: All message flow goes through MessageTransport — in BOTH modes.
Platform adapters NEVER call MessageOrchestrator directly. This ensures uniform wiring.

PORT vs TRANSPORT RELATIONSHIP:
- MessageIngressPort / MessageEgressPort = adapter-level contracts (how adapters receive/send platform messages)
- MessageTransport = process-boundary abstraction (how modules communicate across process boundaries)

COMPOSITION:
- Platform adapter implements MessageEgressPort (knows how to send via Cloud API / Telegraf)
- Platform adapter uses MessageTransport.publishInbound() to emit canonical inbound messages
- MessageTransport.onOutbound() callback invokes the adapter's MessageEgressPort.send() method
- MessageOrchestrator is wired as the MessageTransport.onInbound() handler
- MessageOrchestrator calls MessageTransport.publishOutbound() (NOT MessageEgressPort directly)

NestJS WIRING (provider tokens):
- MESSAGE_TRANSPORT → InProcessTransport (monolith) or RabbitMQTransport (multi-process)
- MESSAGE_EGRESS_PORT → WhatsAppCloudAdapter or TelegramAdapter (per-platform, multi-bound)
- The QueueModule registers onOutbound callbacks that look up the correct MessageEgressPort by platform

MONOLITH MODE (default, TRANSPORT_MODE unset or "in-process"):
  Platform Adapter → calls MessageTransport.publishInbound(inbound)
  InProcessTransport.publishInbound() → synchronously calls registered onInbound handler
  onInbound handler = MessageOrchestrator.processMessage(inbound) → handler → HandlerResult
  Orchestrator → calls MessageTransport.publishOutbound(outbound)
  InProcessTransport.publishOutbound() → synchronously calls registered onOutbound handler
  onOutbound handler = Platform Adapter's send method (WhatsApp Cloud / Telegram)
  Side effects → MessageTransport.publishSideEffect() → synchronous in-process call

  Wiring: All modules in one NestJS app. InProcessTransport is a simple method-call passthrough.
  No EventEmitter2 needed — InProcessTransport uses direct function references.

RABBITMQ MODE (TRANSPORT_MODE="rabbitmq"):
  Platform Adapter → calls MessageTransport.publishInbound(inbound)
  RabbitMQTransport.publishInbound() → serializes to JSON, publishes to `inbound.message` exchange
  Bot-Core Worker → RabbitMQTransport.onInbound() → orchestrator → handler
  handler returns HandlerResult → MessageTransport.publishOutbound(outbound)
  RabbitMQTransport.publishOutbound() → publishes to `outbound.message` exchange
  Platform Adapter → RabbitMQTransport.onOutbound() → sends via Cloud API / Telegraf
  Side effects → publishes to `side-effect.*` queues → Worker process consumes

  Wiring: Separate NestJS apps per entry point. RabbitMQ connects them.
```

### 4. Side-Effect Queue Payload Contracts

```typescript
// Location: src/core/types/side-effects.ts

type SideEffectType = 'voice' | 'ai' | 'notification';

type SideEffectPayload = VoiceJobPayload | AIJobPayload | NotificationJobPayload;

interface VoiceJobPayload {
  type: 'voice';
  correlationId: string;
  userId: string; // UserId
  chatId: ChatId;
  direction: 'stt' | 'tts';
  // STT: audio buffer ref → transcribed text
  audioRef?: string; // media reference for STT input
  // TTS: text → audio buffer
  text?: string; // text for TTS input
  voiceId?: string; // ElevenLabs voice ID
  replyToMessageId?: string;
}

interface AIJobPayload {
  type: 'ai';
  correlationId: string;
  userId: string;
  chatId: ChatId;
  prompt: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
}

interface NotificationJobPayload {
  type: 'notification';
  correlationId: string;
  userId: string;
  chatId: ChatId;
  notificationType: 'payment_received' | 'payment_sent' | 'invoice_paid' | 'broadcast';
  data: Record<string, string>; // template variables
}

// All payloads are validated with class-validator on consumer side.
// Dead letter queue: failed jobs (3 retries) go to `side-effect.dead-letter` with original payload + error message.
```

**The transport interface**:

```typescript
// Location: src/core/ports/transport.port.ts (interface only — no implementation in core)
interface MessageTransport {
  publishInbound(message: InboundMessage): Promise<void>;
  onInbound(handler: (message: InboundMessage) => Promise<void>): void;
  publishOutbound(message: OutboundMessage): Promise<void>;
  onOutbound(handler: (message: OutboundMessage) => Promise<void>): void;
  publishSideEffect(type: SideEffectType, payload: SideEffectPayload): Promise<void>;
  onSideEffect(type: SideEffectType, handler: (payload: SideEffectPayload) => Promise<void>): void;
}

// Implementations:
// - src/modules/queue/in-process.transport.ts  → InProcessTransport (direct function references, monolith mode — NO EventEmitter2)
// - src/modules/queue/rabbitmq.transport.ts    → RabbitMQTransport (amqplib, multi-process mode)

// Serialization contract (RabbitMQ mode):
// - Messages are serialized via JSON.stringify() with class-transformer's classToPlain()
// - Deserialized via plainToClass() + class-validator validateSync() on consumer side
// - Version header: each message includes { _version: 1, _type: 'InboundMessage' | 'OutboundMessage' | 'SideEffect' }
// - Future version changes: consumers check _version and apply migration if needed
// - InProcessTransport passes objects by reference (no serialization overhead)
```

### 5. Canonical ID Mapping: WhatsApp Cloud API

| Context                            | `ActorId.platformUserId`                               | `ChatId.platformChatId`                                                                                    | `ChatId.isGroup` | Cloud API "to" field for send                                               |
| ---------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------- |
| **DM inbound**                     | Sender phone: `messages[].from` (e.g., `"1234567890"`) | Same as sender: `messages[].from`                                                                          | `false`          | `messaging_product: "whatsapp", to: chatId.platformChatId`                  |
| **Group inbound** (bot @mentioned) | Sender phone: `messages[].from`                        | Group ID from payload (TBD by Task 2 research — may be available in `messages[].context.from` or metadata) | `true`           | `messaging_product: "whatsapp", to: chatId.platformChatId` (sends to group) |
| **Admin OTP** (Task 18)            | Admin phone number from config                         | Admin phone number                                                                                         | `false`          | `to: adminPhoneNumber`                                                      |
| **Interactive reply**              | Same as original sender                                | Same as original chat                                                                                      | Same as original | `to: chatId.platformChatId, context: { message_id: originalMsgId }`         |

**NOTE**: The exact group ChatId derivation depends on Task 2's Cloud API research. Task 4 MUST define `ChatId.platformChatId` based on Task 2's findings. If Cloud API does not provide a group identifier, group features are classified as "disabled parity" per the parity truth table.

### Critical Path Walkthrough (Monolith Mode)

```
1. Meta sends POST /whatsapp/webhook with text message payload
2. WhatsAppCloudController receives request, validates X-Hub-Signature-256
3. WhatsAppCloudAdapter.handleWebhook() parses payload → InboundMessage { from: ActorId, chat: ChatId, content: { type: 'text', body: 'check my balance' } }
4. Adapter calls MessageTransport.publishInbound(inboundMessage)
5. InProcessTransport.publishInbound() → synchronously calls registered onInbound handler
6. onInbound handler = MessageOrchestrator.processMessage(inbound):
   a. IdentityPort.resolveOrCreate(inbound.from) → UserId
   b. SessionPort.getOrCreateSession(userId) → Session (with flashAuthToken)
   c. NLP TextNormalizer normalizes text (Patois if needed)
   d. IntentClassifierPort.classify("check my balance") → { kind: 'core', intent: Intent.Balance, slots: {}, confidence: 1.0 }
   e. CommandRouter.getHandler(Intent.Balance) → BalanceHandler
   f. Policy middleware: @RequireAuth() checks session.flashAuthToken exists ✓
   g. BalanceHandler.execute(ctx) → calls WalletPort.getBalance(userId) → HandlerResult { messages: [OutboundMessage with FormattedText] }
7. Orchestrator calls MessageTransport.publishOutbound(outboundMessage)
8. InProcessTransport.publishOutbound() → calls registered onOutbound handler
9. onOutbound handler = QueueModule looks up platform from outbound.to.chatId.platform → WhatsAppCloudAdapter
10. WhatsAppCloudAdapter.send(outbound): converts FormattedText → WhatsApp Cloud API format → POST to Cloud API
```

---

## Verification Strategy (MANDATORY)

### Test Decision

- **Infrastructure exists**: YES (Jest configured, jest.config.js)
- **User wants tests**: TDD
- **Framework**: Jest (existing config)
- **Test command**: `npx jest` (or `npm test` which runs `jest --config jest.config.js`). The plan uses `npx jest <path>` for targeted test runs.
- **Jest config update required**: Current `jest.config.js` only matches `src/**/*.spec.ts`. **Task 5 (scaffold) must update `jest.config.js`** early to add: `testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts', '<rootDir>/scripts/**/*.spec.ts']`. This ensures `npx jest` runs ALL tests across all phases, not just at Task 22. Without this, Tasks 6-21 that place tests under `test/` or `scripts/` won't execute via `npx jest`.

### Test Environment Strategy

Unit tests MUST NOT require real external services (Redis, RabbitMQ, Flash API, Meta API). To handle env validation:

1. **ConfigService mocking**: All unit tests inject a mock `ConfigService` (or use `ConfigModule.forRoot()` with test values). Tests never rely on `.env` files or real env vars.
2. **Jest setup file**: Task 5 creates `test/jest.setup.ts` that sets minimal env vars required by Joi validation:
   ```typescript
   // test/jest.setup.ts
   process.env.NODE_ENV = 'test';
   process.env.REDIS_HOST = 'localhost';
   process.env.REDIS_PORT = '6379';
   process.env.FLASH_API_URL = 'http://localhost:4000/graphql';
   // Cloud API vars are optional() in test/dev — no need to set
   // RABBITMQ_URL is optional() in monolith mode — no need to set
   ```
3. **Jest config**: Task 5 adds `setupFiles: ['<rootDir>/test/jest.setup.ts']` to `jest.config.js`.
4. **Integration tests** (Task 22): May use `testcontainers` for Redis or a real Redis in CI, but unit tests (Tasks 6-21) MUST NOT require running services.
5. **ts-jest compilation strategy**: Current `jest.config.js` uses `ts-jest` with no explicit tsconfig, defaulting to `tsconfig.json` (which includes legacy code). After Task 5's `git mv` and legacy exclusions, legacy TS will have broken imports. To prevent Jest from compiling broken legacy:
   - Task 5 creates `tsconfig.jest.json`:
     ```json
     {
       "extends": "./tsconfig.build.json",
       "compilerOptions": {
         "emitDecoratorMetadata": true,
         "experimentalDecorators": true
       }
     }
     ```
   - Task 5 updates `jest.config.js` to use it:
     ```javascript
     transform: {
       '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
     },
     ```
   - This ensures Jest only compiles new code (same exclude list as `tsconfig.build.json`), while `tsconfig.json` remains IDE-inclusive for navigating legacy reference code.
   - **Acceptance check**: After Task 5, `npx jest --passWithNoTests` must succeed (no compilation errors from legacy code).

### TDD Workflow

Each TODO follows RED-GREEN-REFACTOR:

1. **RED**: Write failing test first (handler, port, adapter)
2. **GREEN**: Implement minimum code to pass
3. **REFACTOR**: Clean up while keeping green

### Architecture Verification (automated, no manual testing)

```bash
# Core purity check — no platform imports in business logic
# Paths match the scaffold defined in Task 5
# Canonical path set for "core purity" checks (reused in DoD + Success Criteria):
CORE_PATHS="src/core/ src/modules/wallet/ src/modules/identity/ src/modules/session/ src/modules/nlp/ src/modules/bot-core/"
grep -r "whatsapp-web\|telegraf\|@google/generative-ai\|elevenlabs\|twilio" $CORE_PATHS
# Expected: zero results

# Adapter size check — adapters should be thin
wc -l src/modules/platform/whatsapp-cloud/*.ts src/modules/platform/telegram/*.ts
# Expected: each file <300 lines

# Feature parity — all handlers tested via dedicated parity spec
npx jest test/parity/feature-parity.spec.ts
# Expected: ALL PASS. Test count ≥ number of Intent enum values (25+)
# Deterministic check: the parity spec file imports the Intent enum and
# has exactly one `it()` block per enum value. Verify with:
grep -c "it(" test/parity/feature-parity.spec.ts
# Expected: ≥ 25

# Plugin parity
npx jest test/parity/plugin-parity.spec.ts
# Expected: ALL PASS. Test count ≥ 7
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — Foundation):
├── Task 1: Feature inventory from god service
├── Task 2: Meta Business API setup (external dependency)
└── Task 3: Redis schema documentation

Wave 2 (After Task 1):
├── Task 4: Canonical message model + ports/interfaces
└── Task 5: Project scaffold + module skeleton

Wave 3 (After Tasks 4, 5):
├── Task 6: Identity + Session modules
├── Task 7: Flash API port (copy existing)
└── Task 8: NLP module (intent pipeline + Patois normalization)

Wave 4 (After Tasks 6, 7, 8):
├── Task 9: Bot Core module (orchestrator + handler registry)
└── Task 10: WhatsApp Cloud API adapter

Wave 5 (After Tasks 9, 10):
├── Task 11: Command handler migration (batch 1: core wallet)
├── Task 12: Command handler migration (batch 2: account management)
└── Task 13: Command handler migration (batch 3: social/utility)

Wave 6 (After Wave 5):
├── Task 14: Telegram adapter
├── Task 15: Plugin system migration
└── Task 16: Voice module

Wave 7 (After Wave 6):
├── Task 17: AI Conversation module
├── Task 18: Admin module
└── Task 19: Observability module

Wave 8 (After Wave 7):
├── Task 20: Redis data migration script
├── Task 21: RabbitMQ message contracts + process split
└── Task 22: Integration testing + feature parity matrix

Wave 9 (Final):
└── Task 23: Deployment configuration + cutover plan
```

### Dependency Matrix

| Task | Depends On | Blocks                | Can Parallelize With |
| ---- | ---------- | --------------------- | -------------------- |
| 1    | None       | 4, 9, 11-13           | 2, 3                 |
| 2    | None       | 10                    | 1, 3                 |
| 3    | None       | 6, 20                 | 1, 2                 |
| 4    | 1, 2       | 5, 6, 7, 8, 9, 10, 14 | -                    |
| 5    | 4          | 6, 7, 8, 9, 10        | -                    |
| 6    | 3, 5       | 9, 11-13              | 7, 8                 |
| 7    | 5          | 9, 11-13              | 6, 8                 |
| 8    | 5          | 9                     | 6, 7                 |
| 9    | 6, 7, 8    | 11-13                 | 10                   |
| 10   | 2, 5       | 11-13, 22             | 9                    |
| 11   | 9          | 22                    | 12, 13               |
| 12   | 9          | 22                    | 11, 13               |
| 13   | 9          | 22                    | 11, 12               |
| 14   | 4, 9       | 22                    | 15, 16               |
| 15   | 9          | 22                    | 14, 16               |
| 16   | 5          | 17, 22                | 14, 15               |
| 17   | 8, 16      | 22                    | 18, 19               |
| 18   | 5, 10      | 22                    | 17, 19               |
| 19   | 5          | 22                    | 17, 18               |
| 20   | 3, 6       | 23                    | 21                   |
| 21   | 4, 9       | 23                    | 20                   |
| 22   | 11-19      | 23                    | 20, 21               |
| 23   | 20, 21, 22 | None                  | None (final)         |

---

## Entrypoints + Build/Run Commands

### Entrypoint Strategy

The new `src/main.ts` delegates to `src/entrypoints/monolith.ts` by default. This preserves the existing `nest start` / `dist/main.js` workflow while enabling multi-process mode.

```typescript
// src/main.ts (REPLACED in Task 5)
// Simply re-exports the monolith entrypoint for backward compatibility
import './entrypoints/monolith';
```

### Build Commands

| Command          | Purpose          | Config Used                               |
| ---------------- | ---------------- | ----------------------------------------- |
| `nest build`     | Production build | `tsconfig.build.json` (excludes legacy)   |
| `nest start:dev` | Dev mode (watch) | `tsconfig.json` (includes legacy for IDE) |
| `npx jest`       | Run all tests    | `jest.config.js`                          |

### Run Commands (Dev)

| Mode               | Command             | Notes                                              |
| ------------------ | ------------------- | -------------------------------------------------- |
| Monolith (default) | `npm run start:dev` | Runs `src/main.ts` → `src/entrypoints/monolith.ts` |
| Multi-process      | Not used in dev     | Multi-process is production-only (Task 21)         |

### Run Commands (Production)

| Mode               | PM2 Config                                  | Entrypoint                                                                                                                                       |
| ------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Monolith (default) | `ecosystem.prod.config.js` → `dist/main.js` | `main.ts` → `entrypoints/monolith.ts`                                                                                                            |
| Multi-process      | `ecosystem.prod.config.js` with 4 apps      | `dist/entrypoints/whatsapp-connector.js`, `dist/entrypoints/bot-core.js`, `dist/entrypoints/telegram-connector.js`, `dist/entrypoints/worker.js` |

### Cutover Switch

- **Phase 1** (initial deploy): Monolith mode. PM2 runs `dist/main.js` as today. Zero config change.
- **Phase 2** (process split): Update `ecosystem.prod.config.js` to run 4 separate apps. Set `TRANSPORT_MODE=rabbitmq`.
- **Rollback**: Revert PM2 config to single app, unset `TRANSPORT_MODE`. Instant rollback.

---

## TODOs

---

**Branch Note for Tasks 1–3**: These documentation-only tasks produce `docs/*.md` files. They are committed to the `rewrite/hexagonal` branch. **Create the branch first** (a minimal `git checkout -b rewrite/hexagonal` from `main`) before starting any task. Task 5 then scaffolds the module structure on the already-existing branch.

- [x] 1. Feature Inventory: Extract Complete Command + Feature List from God Service

  **What to do**:
  - Parse `src/modules/whatsapp/services/whatsapp.service.ts` (6,508 lines) to extract every command/feature branch
  - Document each command with: name, CommandType enum value, what it does, Flash API calls it makes, Redis keys it accesses, response format
  - Parse `src/modules/whatsapp/services/command-parser.service.ts` (1,861 lines) to map all natural language patterns per command
  - Document all plugins from `src/modules/plugins/` — interface, capabilities, state management
  - Document group-specific features (group auth, tipping, games)
  - Output: `docs/feature-inventory.md` with complete matrix

  **Must NOT do**:
  - Do NOT modify any existing code
  - Do NOT skip "minor" features — every switch case, every if branch is a feature
  - Do NOT conflate features that appear similar but have different code paths (e.g., "send to username" vs "send to phone number")

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Deep code analysis requiring thorough reading of 8,000+ lines
  - **Skills**: []
    - No special skills needed — pure code reading and documentation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 9, 11-13
  - **Blocked By**: None

  **References**:
  - `src/modules/whatsapp/services/whatsapp.service.ts` — The god service. Every method is a feature. Focus on `handleCommand()` switch statement and all `handle*` private methods.
  - `src/modules/whatsapp/services/command-parser.service.ts` — All command patterns and NL matching. `commandPatterns` array (lines 44-98), `parseNaturalLanguage()` (lines 289-1207).
  - `src/modules/whatsapp/commands/` — The 4 already-extracted handlers (balance, send, help, link) — document their interface contract.
  - `src/modules/plugins/` — Plugin interface and all plugin implementations (trivia, daily challenges, group games, anonymous messaging, decision-making, translation, jokes).
  - `src/modules/whatsapp/services/whatsapp-message-router.service.ts` — Message routing logic, group detection, media handling.
  - `src/modules/auth/services/session.service.ts` — All session/state methods that commands depend on.

  **Required Document Outline** (`docs/feature-inventory.md`):

  ```
  # Feature Inventory
  ## Commands (one section per CommandType)
  ### [CommandType.Balance]
  - Description: ...
  - Natural language triggers: ["check my balance", "how much do I have", ...]
  - Flash API calls: [balanceQuery, ...]
  - Redis keys accessed: [balance_cache:{userId}, ...]
  - Response format: (exact text with formatting)
  - Auth required: YES/NO
  - Group support: YES/NO
  ## Plugins (one section per plugin)
  ### [Trivia Plugin]
  - Interface methods: ...
  - State management: ...
  - Triggers: ...
  ## Group Features
   ## Intent Mapping Table (CRITICAL for Tasks 4, 11-13)
   | CommandType / handleX() branch | Proposed Intent (core) or PluginId (plugin) | Expected Slots | Notes |
   |-------------------------------|---------------------------------------------|----------------|-------|
   | CommandType.Balance / handleBalance() | Intent.Balance | none | Core |
   | ... (one row per branch) | ... | ... | ... |
   ## Summary Matrix (table: command × properties)
  ```

  **Acceptance Criteria**:
  - [ ] `docs/feature-inventory.md` created with the above outline structure
  - [ ] Every `CommandType` enum value has a documented entry
  - [ ] Every natural language pattern cluster documented per command
  - [ ] All 7 plugins documented with interface
  - [ ] Group features documented separately
  - [ ] Redis key patterns used by each feature noted
  - [ ] Flash API calls per feature noted
  - [ ] Intent Mapping Table included: every CommandType/handleX branch mapped to proposed Intent enum value (or `kind:'plugin'` + pluginId), with expected slots. This table is the contract for Tasks 4 and 11-13.

  **Commit**: YES
  - Message: `docs: complete feature inventory from existing codebase`
  - Files: `docs/feature-inventory.md`
  - Pre-commit: None (documentation only)

---

- [x] 2. Meta WhatsApp Business API Setup + Feature Gap Analysis

  **What to do**:
  - Research and document the Meta WhatsApp Business API setup process
  - Document: Meta developer account creation, business verification, phone number registration, webhook configuration, API token generation
  - Create a feature gap analysis: what whatsapp-web.js supports that Cloud API does NOT (e.g., reading all group messages without mention, presence/typing detection, message reactions)
  - Document Cloud API webhook payload formats (text, media, voice, location, contact, buttons, interactive messages)
  - Document Cloud API rate limits (Tier 1: 80 msg/sec, message template requirements for 24-hour window)
  - Document Cloud API media handling (upload/download via API, not Puppeteer)
  - Output: `docs/whatsapp-cloud-api-setup.md`

  **Must NOT do**:
  - Do NOT actually create the Meta account (that's an external user action)
  - Do NOT assume Cloud API has feature parity with whatsapp-web.js — document the gaps

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Research and documentation task
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:
  - Meta WhatsApp Business API docs: `https://developers.facebook.com/docs/whatsapp/cloud-api`
  - Current whatsapp-web.js usage: `src/modules/whatsapp/services/whatsapp-instance-manager.service.ts` — what Client features are used
  - Current whatsapp-web.js usage: `src/modules/whatsapp/services/whatsapp-web.service.ts` — send methods, media, group operations
  - Existing Cloud API work: `src/modules/whatsapp/services/whatsapp-cloud.service.ts` (if it exists, it was mentioned as commented out)
  - `src/modules/whatsapp/guards/twilio-webhook.guard.ts` — is Twilio used as Cloud API proxy?

  **Required Document Outline** (`docs/whatsapp-cloud-api-setup.md`):

  ```
  # WhatsApp Cloud API Setup Guide
  ## Prerequisites (Meta developer account, business verification)
  ## Step-by-Step Setup
  ### 1. Create Meta Developer Account
  ### 2. Business Verification
  ### 3. Phone Number Registration
  ### 4. Webhook Configuration
  ### 5. API Token Generation
  ## Feature Gap Analysis (table: feature × whatsapp-web.js support × Cloud API support)
  ## Webhook Payload Formats (per message type)
  ## Rate Limits and Constraints
  ## Media Handling
  ## Environment Variables (must match src/config/configuration.ts)
  ```

  **Acceptance Criteria**:
  - [ ] `docs/whatsapp-cloud-api-setup.md` created with the above outline structure
  - [ ] Step-by-step setup guide for Meta Business API
  - [ ] Feature gap matrix: whatsapp-web.js vs Cloud API for every feature in Task 1's inventory
  - [ ] Webhook payload format documented for all message types
  - [ ] Rate limit strategy documented
  - [ ] Media handling approach documented
  - [ ] **Meta API Readiness Checklist** included as a section in the document:
    ```
    ## Meta API Readiness Checklist (Human Pre-Requisites)
    Before Task 10 (WhatsApp Cloud API adapter) can be tested end-to-end:
    - [ ] Meta Developer account created at developers.facebook.com
    - [ ] Meta Business verified (business verification may take 1-5 days)
    - [ ] WhatsApp Business app created in Meta Developer dashboard
    - [ ] Phone number registered (test number OR production number)
    - [ ] Permanent access token generated (System User token, not short-lived)
    - [ ] Webhook URL configured: https://whatsapp.flashapp.me/whatsapp/webhook (matches WHATSAPP_WEBHOOK_URL default in `src/config/configuration.ts` line 13)
    - [ ] Webhook verify token set (matches WHATSAPP_VERIFY_TOKEN env var)
    - [ ] Webhook subscriptions enabled: messages, message_deliveries, message_reads
    - [ ] App secret noted (for X-Hub-Signature-256 validation, matches WHATSAPP_APP_SECRET)
    - [ ] Test message sent from Meta's test console → webhook received
    NOTE: Task 10 unit tests use mocked payloads and do NOT require this setup.
          This checklist is for production/staging integration testing only.
    ```

  **Commit**: YES
  - Message: `docs: WhatsApp Cloud API setup guide and feature gap analysis`
  - Files: `docs/whatsapp-cloud-api-setup.md`
  - Pre-commit: None

---

- [x] 3. Redis Schema Documentation + Migration Strategy

  **What to do**:
  - Trace all Redis key patterns used in the current codebase
  - Document every key pattern with: name, data type (string/hash/set/list), TTL, what module reads/writes it, format of stored data
  - Document session schema: what fields exist on a user session, how auth tokens are stored
  - Document cache keys: balance cache, exchange rate cache, etc.
  - Document rate limiting keys, deduplication keys, feature flag keys
  - Design migration strategy: what keys change names in the new architecture, migration script approach
  - Output: `docs/redis-schema.md`

  **Must NOT do**:
  - Do NOT connect to production Redis
  - Do NOT modify any existing code

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Cross-cutting concern requiring reading multiple services
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 6, 20
  - **Blocked By**: None

  **References**:
  - `src/modules/redis/redis.service.ts` — Core Redis operations, key patterns
  - `src/modules/redis/services/whatsapp-redis.service.ts` — WhatsApp-specific Redis usage (session keys use "whatsappId")
  - `src/modules/redis/services/redis-pool.service.ts` — Pool management, connection patterns
  - `src/modules/redis/services/redis-batch.service.ts` — Batch operations
  - `src/modules/auth/services/session.service.ts` — Session storage, what fields are stored per user
  - `src/modules/flash-api/services/balance.service.ts` — Balance cache keys, TTL
  - `src/modules/flash-api/services/price.service.ts` — Price/exchange rate cache
  - `src/common/guards/rate-limiter.guard.ts` — Rate limiting key patterns
  - `src/modules/whatsapp/services/whatsapp.service.ts` — Inline Redis calls in the god service

  **Required Document Outline** (`docs/redis-schema.md`):

  ```
  # Redis Schema Documentation
  ## Key Patterns (table: key pattern × data type × TTL × owner module × description)
  ## Session Schema (all fields with types)
  ## Cache Keys (balance, price, exchange rate)
  ## Rate Limiting Keys
  ## Deduplication Keys
  ## Feature Flag Keys
  ## Migration Strategy
  ### Old Key → New Key Mapping (table)
  ### Migration Script Requirements
  ### Rollback Procedure
  ```

  **Acceptance Criteria**:
  - [ ] `docs/redis-schema.md` created with the above outline structure
  - [ ] Every Redis key pattern documented with data type, TTL, owner module
  - [ ] Session schema fully documented
  - [ ] Migration strategy section: old key → new key mapping
  - [ ] Verified by: `grep -rn "redis\.\|RedisService\|\.get(\|\.set(\|\.del(" src/ | wc -l` cross-referenced with documentation

  **Commit**: YES
  - Message: `docs: Redis schema documentation and migration strategy`
  - Files: `docs/redis-schema.md`
  - Pre-commit: None

---

- [x] 4. Design Canonical Message Model + Port Interfaces

  **What to do**:
  - Design the canonical types that form the system's spine:
    - `Platform` enum: `'whatsapp-cloud' | 'telegram'` (extensible)
    - `ActorId`: `{ platform, platformUserId, displayName? }`
    - `ChatId`: `{ platform, platformChatId, isGroup }`
    - `UserId`: internal UUID mapped from `(platform, platformUserId)`
    - `InboundMessage`: `{ id, from: ActorId, chat: ChatId, timestamp, type, content, replyTo?, metadata }`
    - `MessageContent`: union type for text, voice, image, document, contact, location, button response, interactive
    - `OutboundMessage`: `{ to: ChatId, content: OutboundContent, replyTo? }`
    - `OutboundContent`: text (with optional buttons/interactive), voice, image, document, typing indicator
  - Design port interfaces:
    - `MessageIngressPort`: platform adapter emits `InboundMessage` events
    - `MessageEgressPort`: `send(outbound: OutboundMessage): Promise<void>`, `sendTyping(chat: ChatId): Promise<void>`
    - `MediaPort`: `download(ref: MediaRef): Promise<Buffer>`, `upload(buffer: Buffer, mime: string): Promise<MediaRef>`
    - `IdentityPort`: `resolveUserId(actor: ActorId): Promise<UserId>`, `createMapping(actor: ActorId): Promise<UserId>`
    - `SessionPort`: `getSession(userId: UserId): Promise<Session>`, `updateSession(userId: UserId, update: Partial<Session>): Promise<void>`
    - `WalletPort`: `getBalance(userId: UserId): Promise<Balance>`, `sendPayment(...)`, `createInvoice(...)`, etc.
    - `IntentClassifierPort`: `classify(text: string, context: ConversationContext): Promise<IntentResult>`
    - `VoicePort`: `transcribe(audio: Buffer, lang?: string): Promise<string>`, `synthesize(text: string, voice?: string): Promise<Buffer>`
    - `AIConversationPort`: `respond(prompt: string, context: ConversationContext): Promise<string>`
    - `PluginPort`: plugin interface for extensible features
  - Write these as TypeScript interfaces in `src/core/ports/`
  - **Type implementation strategy**: The canonical message model uses a **dual approach**:
    - **Interfaces** (`src/core/ports/*.ts`): All port contracts are TypeScript interfaces for compile-time safety. These define what adapters/modules must implement.
    - **Classes with `class-validator`** (`src/core/types/*.ts`): The canonical data objects (`InboundMessage`, `OutboundMessage`, `ActorId`, `ChatId`, `IntentResult`, `CommandContext`) are implemented as **classes** decorated with `class-validator` decorators (`@IsString()`, `@IsEnum()`, `@ValidateNested()`, etc.). This enables runtime validation at adapter boundaries (when webhook payloads are translated to canonical types).
    - **Factory functions**: Each canonical class has a static `create()` factory that runs `class-validator` `validateSync()` and throws on invalid data. Adapters call these factories when constructing canonical messages.
  - Write type verification tests:
    - Compile-time: `nest build` (which runs `tsc`) must pass with zero errors
    - Runtime: Jest tests that call `InboundMessage.create({...})` with valid/invalid data and assert validation results
    - Contract tests: verify that `InboundMessage.create()` can represent every message type from the feature inventory (text, voice, image, document, contact, location, button response)
  - Design the `Intent` enum covering all 25+ commands + conversational fallback
  - Design **group identity mapping rules** (CRITICAL — prevents "whatsappId everywhere" from reappearing):
    - **WhatsApp Cloud API groups**: **IMPORTANT**: WhatsApp Cloud API does NOT natively support reading group messages the way `whatsapp-web.js` does. Cloud API only receives messages sent directly to the business number, or messages in groups where the business number is mentioned/@tagged. This is a **known feature gap** (documented in Task 2's feature gap analysis). For group support:
      - If Cloud API webhook includes group context: the payload has `entry[].changes[].value.messages[].from` (sender phone) and group info may appear in `entry[].changes[].value.contacts[]`. `ChatId.platformChatId` = group identifier from payload (if present). `ChatId.isGroup` = true.
      - `ActorId.platformUserId` = sender's phone number from `messages[].from` field (always present even in group context when the bot is tagged).
      - **If group features are blocked by Cloud API limitations**: Group tipping and group games may need to be deferred or implemented differently (e.g., require users to @mention the bot). Task 2's feature gap analysis MUST document this clearly so Tasks 11-15 know which group features are feasible.
      - Example webhook payload snippet for adapter implementation:
        ```json
        {
          "entry": [
            {
              "changes": [
                {
                  "value": {
                    "messages": [
                      { "from": "1234567890", "type": "text", "text": { "body": "hello" } }
                    ],
                    "metadata": {
                      "phone_number_id": "BIZ_PHONE_ID",
                      "display_phone_number": "15551234567"
                    }
                  }
                }
              ]
            }
          ]
        }
        ```
    - **Telegram groups**: `ChatId.platformChatId` = `String(chat.id)` (negative for groups). `ChatId.isGroup` = `chat.type === 'group' || chat.type === 'supergroup'`. `ActorId.platformUserId` = `String(from.id)` (always present in Telegram group messages).
    - **General rule**: Every `InboundMessage` MUST have both a `ChatId` (where) and an `ActorId` (who). If a platform cannot identify the sender in a group, the adapter MUST set `ActorId.platformUserId = 'unknown'` and `ActorId.displayName` to whatever is available. Handlers that require auth MUST reject unknown actors.
    - **Group response delivery target**: When a handler processes a group message, the `OutboundMessage.to.chatId` determines where the response goes:
      - `chatId.isGroup = true` → response is sent to the group chat (all members see it). This is the default for group commands.
      - For sensitive responses (balance, transaction details), handlers MAY set `chatId` to the sender's DM instead. This is a per-handler decision documented in handler acceptance criteria.
      - Cloud API supports sending to groups if the business number is a participant. Task 2 MUST verify this capability and document any restrictions.
    - **Fallback for unsupported group features**: If Cloud API cannot support a group feature that existed in whatsapp-web.js, the handler MUST return a graceful "This feature is not available in group chats via Cloud API" message rather than failing silently. Task 2 documents which features fall into this category.
  - Design the `CommandContext` that handlers receive: `{ intent, slots, userId, session, chat, inboundMessage, platform }`

  **Must NOT do**:
  - Do NOT implement any adapters yet — interfaces only
  - Do NOT add platform-specific types (no `whatsapp-web.js` Message, no Telegraf Context)
  - Do NOT over-generalize — design for known use cases (WA Cloud + Telegram), not hypothetical ones
  - Do NOT use `any` types — be explicit about every field

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Core architectural design requiring careful type system thinking
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 2)
  - **Blocks**: Tasks 5-22 (everything depends on this)
  - **Blocked By**: Task 1 (need feature inventory to know all intents/slots), Task 2 (need Cloud API group behavior documentation to define ChatId/ActorId rules for WhatsApp groups)

  **References**:
  - `docs/feature-inventory.md` (from Task 1) — All commands and their parameters define the Intent enum and slot types
  - `docs/whatsapp-cloud-api-setup.md` (from Task 2) — Cloud API group message behavior, webhook payload formats for group vs DM, group feature parity truth table
  - `src/modules/messaging/abstractions/message-platform.interface.ts` — Existing comprehensive abstraction (review but don't adopt — design fresh)
  - `src/modules/messaging/interfaces/messaging-platform.interface.ts` — Existing simpler abstraction (review for gaps)
  - `src/modules/whatsapp/commands/base/command-context.interface.ts` — Current context shape (has `platform: 'whatsapp'` hardcoded — fix this)
  - `src/modules/whatsapp/commands/base/command-handler.interface.ts` — Current handler interface (review for good ideas)
  - `src/modules/whatsapp/commands/base/command-result.interface.ts` — Current result type
  - `src/modules/whatsapp/interfaces/instance-config.interface.ts` — Current message types (uses `any` — fix this)
  - `src/modules/plugins/interfaces/plugin.interface.ts` — Current plugin interface (must be ported to PluginPort)
  - Oracle consultation: canonical `InboundMessage`/`OutboundMessage` + `UserId` mapping is the "north star artifact"

  **Acceptance Criteria**:
  - [ ] `src/core/ports/` directory created with all port interfaces
  - [ ] `src/core/types/` directory with canonical message types
  - [ ] `src/core/types/intents.ts` with Intent enum covering all 25+ commands
  - [ ] `nest build` succeeds (compile-time type verification via `tsc --noEmit`)
  - [ ] `npx jest src/core/` — runtime contract tests pass (each message type constructable, validates correctly)
  - [ ] Zero occurrences of `any` in port interfaces: `grep -c "any" src/core/ports/*.ts` → 0
  - [ ] Zero platform-specific imports: `grep -r "whatsapp\|telegraf\|twilio" src/core/` → 0

  **Commit**: YES
  - Message: `feat(core): define canonical message model and port interfaces`
  - Files: `src/core/ports/*.ts`, `src/core/types/*.ts`
  - Pre-commit: `npx jest src/core/`

---

- [x] 5. Project Scaffold: Create Branch, Directory Structure, Module Skeletons

  **What to do**:
  - **Branch already exists** (created before Task 1 per the "Branch Note for Tasks 1–3" above). Task 5 works on the existing `rewrite/hexagonal` branch — do NOT create it again.
  - **Coexistence strategy**: The old `src/modules/` directories (whatsapp/, telegram/, flash-api/, auth/, etc.) remain in place as read-only reference. New modules are created in NEW directories that don't conflict:
    - New: `src/core/` (does not exist in old codebase)
    - New: `src/modules/bot-core/` (does not exist in old codebase)
    - New: `src/modules/platform/` (does not exist in old codebase)
    - New: `src/modules/wallet/` (does not exist in old codebase)
    - New: `src/modules/identity/` (does not exist in old codebase)
    - New: `src/modules/session/` (does not exist in old codebase)
    - New: `src/modules/nlp/` (does not exist in old codebase)
    - New: `src/modules/ai/` (does not exist in old codebase)
    - New: `src/modules/voice/` (does not exist in old codebase)
    - New: `src/modules/observability/` (does not exist in old codebase)
    - Reuse path: `src/modules/admin/` (old code is in `src/modules/admin-dashboard/` — no conflict)
    - Reuse path: `src/modules/plugins/` (old code exists here — rename old to `src/modules/plugins-legacy/` using `git mv src/modules/plugins src/modules/plugins-legacy` before creating new `src/modules/plugins/`). **Intentional breakage**: After `git mv`, legacy plugin imports in other legacy modules will be broken. This is EXPECTED and ACCEPTABLE because: (a) the new `app.module.ts` does NOT import legacy modules, (b) `tsconfig.build.json` excludes all legacy paths so `nest build` stays green, (c) `tsconfig.jest.json` also excludes legacy paths so `npx jest` stays green, (d) only the IDE's `tsconfig.json` sees legacy code (red squiggles in legacy files are OK). The legacy app on `main` branch is unaffected (rename is on the `rewrite/hexagonal` branch only).
  - The new `app.module.ts` REPLACES the old one (it only imports new modules, not legacy ones)
  - The new `main.ts` REPLACES the old one
  - Old modules are NOT imported by the new app — they exist solely as code reference
  - Create the directory structure:
    ```
    src/
    ├── core/                    # NEW: Domain types + ports (from Task 4)
    │   ├── ports/               # All port interfaces
    │   ├── types/               # Canonical message model, intents, etc.
    │   └── errors/              # Domain-specific error types
    ├── modules/
    │   ├── bot-core/            # NEW: Orchestrator, handler registry, intent router
    │   ├── platform/            # NEW: Platform adapters
    │   │   ├── whatsapp-cloud/  # WA Cloud API adapter
    │   │   └── telegram/        # Telegram adapter
    │   ├── wallet/              # NEW: Flash API port implementation
    │   ├── identity/            # NEW: Platform → UserId mapping
    │   ├── session/             # NEW: Conversation state (Redis adapter)
    │   ├── nlp/                 # NEW: Intent pipeline, Patois normalization
    │   ├── ai/                  # NEW: Gemini adapter, conversational AI
    │   ├── voice/               # NEW: STT/TTS pluggable adapters
    │   ├── admin/               # NEW: Dashboard, feature flags (old was admin-dashboard/)
    │   ├── observability/       # NEW: Logging, metrics, health
    │   ├── plugins/             # NEW: Plugin port + migrated plugins (old renamed to plugins-legacy/)
    │   │
    │   ├── whatsapp/            # OLD — kept as reference, NOT imported
    │   ├── telegram/            # OLD — kept as reference, NOT imported
    │   ├── flash-api/           # OLD — kept as reference, NOT imported
    │   ├── auth/                # OLD — kept as reference, NOT imported
    │   ├── redis/               # OLD — kept as reference, NOT imported
    │   ├── gemini-ai/           # OLD — kept as reference, NOT imported
    │   ├── admin-dashboard/     # OLD — kept as reference, NOT imported
    │   ├── plugins-legacy/      # OLD (renamed from plugins/) — kept as reference
    │   └── ...                  # Other old modules untouched
    ├── config/                  # Keep existing, update as needed
    ├── common/                  # Keep existing utilities, add new as needed
    ├── app.module.ts            # REPLACED: imports only new modules
    └── main.ts                  # REPLACED: clean bootstrap
    ```
  - Create empty NestJS module files for each NEW module (`.module.ts` with imports/exports stubs)
  - Replace `app.module.ts` to import only new modules
  - Replace `main.ts` with clean bootstrap (no CSP hacks, no inline health routes)
  - **Legacy code compilation strategy**: `nest build` uses `tsconfig.build.json` (which extends `tsconfig.json`). To prevent legacy modules from breaking compilation after renames/moves, add legacy paths to the `exclude` array in **`tsconfig.build.json`** (NOT `tsconfig.json` — keeping `tsconfig.json` inclusive allows IDE navigation/search of legacy code):

    ```json
    // tsconfig.build.json — add to existing "exclude" array:
    "exclude": [
      // ... existing entries (node_modules, test, dist, etc.) ...
      "src/modules/whatsapp/**",
      "src/modules/telegram/**",
      "src/modules/flash-api/**",
      "src/modules/auth/**",
      "src/modules/redis/**",
      "src/modules/gemini-ai/**",
      "src/modules/admin-dashboard/**",
      "src/modules/plugins-legacy/**",
      "src/modules/events/**",
      "src/modules/notifications/**",
      "src/modules/messaging/**",
      "src/modules/common/**",
      "src/modules/tts/**",
      "src/modules/speech/**",
      "src/modules/dialect-ai/**",
      "src/shared/**",
      "src/health.controller.ts"
    ]
    ```

    This ensures `nest build` (which uses `tsconfig.build.json`) only compiles new modules. `tsconfig.json` remains untouched so IDE IntelliSense can still navigate legacy code for reference.
    **Redis access strategy for new modules**: Since `src/modules/redis/**` is excluded from the build, new modules MUST NOT import from it. Instead:
    - Task 5 (scaffold) creates a new `src/common/redis/redis.service.ts` — a thin wrapper around `ioredis` (already installed) providing `get`, `set`, `del`, `hget`, `hset`, `scan`, `pipeline` methods. This is a fresh implementation (~100 lines) inspired by the patterns in the legacy `src/modules/redis/redis.service.ts` but without its legacy coupling.
    - All new modules (identity, session, admin, etc.) inject this new `RedisService` from `src/common/redis/`.
    - The `RedisModule` is a NestJS global module registered in `app.module.ts`, providing `RedisService` to all modules.
    - Configuration: reads from existing config namespace via `configService.get('redis.host')`, `configService.get('redis.port')`, and `configService.get('redis.password')` — these already exist in `src/config/configuration.ts` and are validated by `src/config/env.validation.ts` (which requires `REDIS_HOST` and `REDIS_PORT`). No new env vars needed for Redis.

    **Import allowlist for new code**: New modules (Tasks 6-19) MAY import from:
    - `src/core/**` — canonical types and ports (always allowed)
    - `src/common/**` — shared utilities like guards, decorators, pipes (NOT excluded from build)
    - `src/config/**` — configuration (NOT excluded from build)
      New modules MUST NOT import from `src/modules/common/**` (which IS excluded). If utilities from `src/modules/common/` are needed, copy them to `src/common/` first. The `src/common/` directory is distinct from `src/modules/common/` — only the latter is in the legacy exclude list.

  - Update `tsconfig.json` path aliases if needed
  - Verify `nest build` compiles cleanly

  **Must NOT do**:
  - Do NOT delete the old `src/modules/` code — it stays as reference
  - Do NOT implement any services yet — just module skeletons
  - Do NOT add dependencies yet (Cloud API SDK, etc.) — that's per-adapter task

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Scaffolding — creating empty files and directory structure
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 2, after Task 4)
  - **Blocks**: Tasks 6-19
  - **Blocked By**: Task 4

  **References**:
  - `src/app.module.ts` — Current module imports to understand what modules exist
  - `src/main.ts` — Current bootstrap to understand what global setup is needed
  - `src/config/configuration.ts` — Current config shape
  - `src/config/env.validation.ts` — Current env validation schema
  - Task 4 output: `src/core/` types and ports

  **Acceptance Criteria**:
  - [ ] Branch `rewrite/hexagonal` created from `main`
  - [ ] All directories exist as specified
  - [ ] Each module has a `.module.ts` file with `@Module({})` decorator
  - [ ] `app.module.ts` imports all modules
  - [ ] `jest.config.js` updated: `testMatch` includes `src/**/*.spec.ts`, `test/**/*.spec.ts`, and `scripts/**/*.spec.ts`; `transform` uses `tsconfig.jest.json`; `setupFiles` includes `test/jest.setup.ts`
  - [ ] `tsconfig.jest.json` created (extends `tsconfig.build.json` — excludes legacy code from Jest compilation)
  - [ ] `test/jest.setup.ts` created with minimal env vars for test mode
  - [ ] `nest build` succeeds with zero errors. **Build config verification**: No `nest-cli.json` exists in this repo, so `nest build` defaults to using `tsconfig.build.json`. Verify with: `nest build --webpack false 2>&1 | head -5` should show compilation using `tsconfig.build.json`. Legacy code excluded from build but still navigable in IDE (verify: `tsc --project tsconfig.json --noEmit` may show legacy errors — that's expected and OK since only `tsconfig.build.json` is used for builds).
  - [ ] `npx jest` passes (no broken imports)

  **Commit**: YES
  - Message: `feat: scaffold hexagonal module structure`
  - Files: All new module files
  - Pre-commit: `nest build`

---

- [x] 6. Implement Identity + Session Modules

  **What to do**:
  - **IdentityModule**: Implement `IdentityPort`
    - `IdentityService`: Maps `(platform, platformUserId)` → internal `UserId` (UUID)
    - Redis-backed storage: `identity:{platform}:{platformUserId}` → `UserId`
    - `resolveOrCreate(actor: ActorId): Promise<UserId>` — idempotent
    - `getActor(userId: UserId): Promise<ActorId[]>` — reverse lookup (user may have multiple platform identities)
    - Migration: read old `whatsappId` keys and map to new identity records
  - **SessionModule**: Implement `SessionPort`
    - `SessionService`: Manages conversation state per `UserId`
    - Session shape: `{ userId, flashAuthToken?, flashUserId?, linkedPhone?, voiceSettings, language, lastActivity, conversationContext }`
    - Redis-backed: `session:{userId}` → JSON session
    - TTL management: sessions expire after configurable inactivity period
    - `getOrCreateSession(userId: UserId): Promise<Session>`
  - TDD: Write tests first for both services

  **Must NOT do**:
  - Do NOT use "whatsappId" anywhere — use `ActorId` and `UserId`
  - Do NOT import platform-specific types
  - Do NOT store auth tokens unencrypted (use existing `CryptoService` pattern)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Core domain services with Redis integration and crypto
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 8)
  - **Blocks**: Tasks 9, 11-13, 20
  - **Blocked By**: Tasks 3 (Redis schema), 5 (scaffold)

  **References**:
  - `src/core/ports/` (from Task 4) — `IdentityPort` and `SessionPort` interfaces
  - `docs/redis-schema.md` (from Task 3) — Current Redis key patterns to ensure compatibility
  - `src/modules/auth/services/session.service.ts` — Current session implementation (uses `whatsappId` — must translate)
  - `src/modules/auth/services/session.service.spec.ts` — Current session tests (adapt for new interface)
  - `src/common/crypto/crypto.service.ts` — Encryption pattern for auth tokens
  - `src/modules/redis/redis.service.ts` — Current Redis service pattern

  **Acceptance Criteria**:
  - [ ] `src/modules/identity/identity.service.ts` implements `IdentityPort`
  - [ ] `src/modules/session/session.service.ts` implements `SessionPort`
  - [ ] Tests: `npx jest src/modules/identity/ src/modules/session/` — all pass
  - [ ] Test: resolve same actor twice returns same UserId (idempotent)
  - [ ] Test: session round-trip (create, get, update, get) preserves data
  - [ ] Test: auth tokens are encrypted at rest
  - [ ] Zero imports from `whatsapp-web.js` or `telegraf`: `grep -r "whatsapp\|telegraf" src/modules/identity/ src/modules/session/` → 0

  **Commit**: YES
  - Message: `feat(identity,session): implement platform-agnostic identity mapping and session management`
  - Files: `src/modules/identity/**`, `src/modules/session/**`
  - Pre-commit: `npx jest src/modules/identity/ src/modules/session/`

---

- [x] 7. Implement Wallet Module (Flash API Port)

  **What to do**:
  - Implement `WalletPort` by wrapping existing Flash API calls
  - **Copy existing GraphQL queries verbatim** from:
    - `src/modules/flash-api/graphql/queries.ts`
    - `src/modules/flash-api/graphql/mutations.ts`
    - `src/modules/flash-api/graphql/subscriptions.ts`
  - Services to implement:
    - `WalletFacade`: Public API implementing `WalletPort` — balance, send, receive, invoice, transactions, price
    - `FlashApiClient`: HTTP/GraphQL client (adapter) — wraps axios + GraphQL
    - `BalanceService`: Balance with cache (30s TTL, existing pattern)
    - `PaymentService`: Send Bitcoin/Lightning payments
    - `InvoiceService`: Create/check Lightning invoices
    - `TransactionService`: Transaction history
    - `PriceService`: Exchange rates with cache
    - `UserService`: User lookup, username resolution
    - `SubscriptionService`: GraphQL subscriptions for real-time updates
  - All services use `UserId` (not whatsappId) and look up Flash credentials via `SessionPort`
  - TDD for all services

  **Must NOT do**:
  - Do NOT restructure GraphQL queries — copy exactly
  - Do NOT change the Flash API contract
  - Do NOT import platform types
  - Do NOT implement payment confirmation UX here — that's a bot-core handler concern

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple service implementations with GraphQL and caching
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 8)
  - **Blocks**: Tasks 9, 11-13
  - **Blocked By**: Task 5 (scaffold)

  **References**:
  - `src/core/ports/` (from Task 4) — `WalletPort` interface
  - `src/modules/flash-api/graphql/queries.ts` — **COPY VERBATIM** — all GraphQL query strings
  - `src/modules/flash-api/graphql/mutations.ts` — **COPY VERBATIM** — all mutation strings
  - `src/modules/flash-api/graphql/subscriptions.ts` — **COPY VERBATIM** — subscription strings
  - `src/modules/flash-api/flash-api.service.ts` — Current GraphQL client implementation (HTTP + auth header patterns)
  - `src/modules/flash-api/services/balance.service.ts` — Balance + cache pattern (30s TTL)
  - `src/modules/flash-api/services/payment.service.ts` — Payment logic
  - `src/modules/flash-api/services/invoice.service.ts` — Invoice creation/checking
  - `src/modules/flash-api/services/price.service.ts` — Exchange rate caching
  - `src/modules/flash-api/services/user.service.ts` — User/username resolution
  - `src/modules/flash-api/services/*.spec.ts` — Existing tests (adapt for new interface)

  **Acceptance Criteria**:
  - [ ] `src/modules/wallet/` implements `WalletPort`
  - [ ] GraphQL queries identical to existing: `diff src/modules/wallet/graphql/queries.ts src/modules/flash-api/graphql/queries.ts` → identical content
  - [ ] Tests: `npx jest src/modules/wallet/` — all pass
  - [ ] Test: balance fetch + cache hit + cache miss flow
  - [ ] Test: send payment with amount + destination
  - [ ] Test: create invoice with amount
  - [ ] Test: price conversion
  - [ ] Zero platform imports: `grep -r "whatsapp\|telegraf" src/modules/wallet/` → 0

  **Commit**: YES
  - Message: `feat(wallet): implement Flash API wallet port with existing GraphQL queries`
  - Files: `src/modules/wallet/**`
  - Pre-commit: `npx jest src/modules/wallet/`

---

- [x] 8. Implement NLP Module (Intent Pipeline + Patois Normalization)

  **What to do**:
  - Implement `IntentClassifierPort` with a pipeline architecture:
    1. **TextNormalizer**: Jamaican Patois orthographic normalization
       - Dictionary-based: common Patois spellings → standardized English equivalents
       - e.g., "mi waan send" → "I want to send", "wah gwaan" → "what's going on"
       - Pluggable interface for future ML model (XLM-R/mBERT)
       - Build initial dictionary from existing command-parser NL patterns
    2. **ExplicitCommandRecognizer**: Exact keyword matching (e.g., "balance", "help", "link")
    3. **PatternRecognizer**: Per-intent regex extractors (split from 1,861-line monolith)
       - `SendPaymentRecognizer`: "send 5000 to alice" → `{ intent: SendPayment, slots: { amount: 5000, destination: 'alice' } }`
       - `ReceiveRecognizer`: "receive 1000" → `{ intent: Receive, slots: { amount: 1000 } }`
       - One recognizer class per intent, each < 100 lines
    4. **LLMClassifier**: Gemini-based intent classification for ambiguous messages
       - Strict JSON schema for output: `{ intent: string, slots: Record<string, string>, confidence: number }`
       - Confidence threshold: < 0.7 → fallback to conversational
    5. **ConversationalFallback**: Passes to `AIConversationPort` for general chat
  - The pipeline runs in order: 1 → 2 → 3 → 4 → 5 (first match wins)
  - Each stage returns `IntentResult | null` (null = pass to next stage)
  - TDD: test each recognizer independently + pipeline integration

  **Must NOT do**:
  - Do NOT train ML models — dictionary normalization only
  - Do NOT use a single 1,861-line file — split into per-intent recognizers
  - Do NOT hard-code Gemini — use `IntentClassifierPort` for the LLM stage
  - Do NOT implement the `AIConversationPort` adapter here — just call the port

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: NLP pipeline architecture, regex splitting, Patois linguistic analysis
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 7)
  - **Blocks**: Task 9
  - **Blocked By**: Task 5 (scaffold)

  **References**:
  - `src/core/ports/` (from Task 4) — `IntentClassifierPort` interface
  - `src/core/types/intents.ts` (from Task 4) — Intent enum
  - `src/modules/whatsapp/services/command-parser.service.ts` — **PRIMARY SOURCE** — all regex patterns and NL matching to decompose
    - `commandPatterns` array (lines 44-98): structured regex patterns
    - `parseNaturalLanguage()` (lines 289-1207): natural language matching chains
    - Each `if/includes` block corresponds to one recognizer
  - `docs/feature-inventory.md` (from Task 1) — Complete list of intents and their NL triggers
  - JamPatoisNLI reference: the Stanford 2022 dataset shows transfer learning from English works well due to lexical overlap — this validates dictionary-based normalization as a viable first step
  - `src/modules/dialect-ai/` — Existing dialect AI module (may have Patois-relevant content)

  **Acceptance Criteria**:
  - [ ] `src/modules/nlp/normalizer/patois-normalizer.ts` — dictionary normalization with 50+ entries
  - [ ] `src/modules/nlp/recognizers/` — one file per intent (25+ files)
  - [ ] `src/modules/nlp/pipeline/intent-pipeline.ts` — orchestrates stages
  - [ ] Tests: `npx jest src/modules/nlp/` — all pass
  - [ ] Test: "mi waan check mi balance" → normalized → `{ intent: Balance }`
  - [ ] Test: "send 5000 sats to @alice" → `{ intent: SendPayment, slots: { amount: '5000', unit: 'sats', destination: '@alice' } }`
  - [ ] Test: pipeline fallback — gibberish text → passes through to conversational
  - [ ] Test: each recognizer independently (unit tests per recognizer)
  - [ ] No file > 200 lines: `wc -l src/modules/nlp/recognizers/*.ts` — all < 200
  - [ ] Zero platform imports: `grep -r "whatsapp\|telegraf" src/modules/nlp/` → 0

  **Commit**: YES
  - Message: `feat(nlp): implement intent pipeline with Patois normalization and per-intent recognizers`
  - Files: `src/modules/nlp/**`
  - Pre-commit: `npx jest src/modules/nlp/`

---

- [x] 9. Implement Bot Core Module (Orchestrator + Handler Registry)

  **What to do**:
  - **MessageOrchestrator**: The system's brain — receives `InboundMessage`, produces effects
    1. Resolve `UserId` via `IdentityPort`
    2. Load session via `SessionPort`
    3. Normalize text via NLP pipeline
    4. Classify intent via `IntentClassifierPort`
    5. Route to handler via `CommandRouter`
    6. Handler produces `HandlerResult` (text, media, voice, effects)
    7. Convert `HandlerResult` → `OutboundMessage`
    8. Send via `MessageTransport.publishOutbound()` (which routes to the correct platform adapter's `MessageEgressPort.send()` via the transport's `onOutbound` callback)
  - **CommandRouter**: Maps `Intent` → `CommandHandler` using decorator-based discovery
    - `@IntentHandler(Intent.Balance)` decorator on handler classes
    - Uses NestJS `DiscoveryService` to auto-register handlers
    - Lookup: `getHandler(intent: Intent): CommandHandler | null`
  - **CommandHandler** base: abstract class with common utilities
    - `abstract execute(ctx: CommandContext): Promise<HandlerResult>`
    - Protected helpers: `reply(text)`, `replyWithMedia(...)`, `requireAuth(ctx)`
  - **HandlerResult**: `{ messages: OutboundMessage[], sideEffects?: SideEffect[] }`
    - Side effects: `{ type: 'voice', payload: VoiceJobPayload }`, `{ type: 'ai', payload: AIJobPayload }`, `{ type: 'notification', payload: NotificationJobPayload }` (types from `src/core/types/side-effects.ts`, see Core Contracts §4)
  - **Policy middleware**: Auth check, rate limiting, feature flag check — runs before every handler
    - Handlers declare policy requirements via **decorators**: `@RequireAuth()`, `@RateLimit(maxPerMinute)`, `@FeatureFlag('flagName')`
    - The orchestrator reads handler metadata (via `Reflect.getMetadata`) before executing
    - If auth required and user not linked → return "Please link your account first" response
    - If rate limited → return "Please slow down" response
    - If feature flag disabled → return "This feature is currently disabled" response
    - Test example: create a handler with `@RequireAuth()`, call orchestrator with unlinked user session → assert auth rejection message returned
  - TDD for orchestrator, router, and policy middleware

  **Must NOT do**:
  - Do NOT implement individual command handlers here — that's Tasks 11-13
  - Do NOT import platform types
  - Do NOT put business logic in the orchestrator — it only routes

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Core application orchestration requiring careful design
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 10)
  - **Blocks**: Tasks 11-15
  - **Blocked By**: Tasks 6, 7, 8

  **References**:
  - `src/core/ports/` (from Task 4) — All port interfaces the orchestrator depends on
  - `src/core/types/` (from Task 4) — `InboundMessage`, `OutboundMessage`, `Intent`, `CommandContext`
  - `src/modules/whatsapp/commands/command-registry.service.ts` — Current registry (uses manual registration — improve with decorators)
  - `src/modules/whatsapp/commands/command-executor.service.ts` — Current executor pattern
  - `src/modules/whatsapp/commands/base/command-handler.interface.ts` — Current handler interface
  - `src/modules/whatsapp/services/whatsapp.service.ts` — The god service's `handleCommand()` switch statement (search: `async handleCommand(` or `switch (command.type)`) shows the routing logic to replicate
  - Oracle consultation: use NestJS `DiscoveryService` for auto-registration with `@IntentHandler()` decorator

  **Acceptance Criteria**:
  - [ ] `src/modules/bot-core/orchestrator.service.ts` — message processing pipeline
  - [ ] `src/modules/bot-core/router/command-router.ts` — decorator-based handler lookup
  - [ ] `src/modules/bot-core/decorators/intent-handler.decorator.ts` — `@IntentHandler(Intent.X)`
  - [ ] `src/modules/bot-core/middleware/auth-policy.ts` — pre-handler auth check
  - [ ] `src/modules/bot-core/middleware/rate-limit-policy.ts` — pre-handler rate limiting
  - [ ] Tests: `npx jest src/modules/bot-core/` — all pass
  - [ ] Test: orchestrator routes known intent to mock handler → gets result
  - [ ] Test: orchestrator applies auth policy → rejects unauthenticated user for protected commands
  - [ ] Test: router discovers handlers via decorator
  - [ ] Zero platform imports: `grep -r "whatsapp\|telegraf" src/modules/bot-core/` → 0
  - [ ] **Early smoke check** (validates wiring before handler migration): Monolith boots and responds to health check:
    ```bash
    # Start app in background
    node dist/main.js &
    APP_PID=$!
    sleep 3
    # Health check
    curl -s http://localhost:3000/health | grep -q "ok"
    HEALTH_EXIT=$?
    kill $APP_PID
    [ $HEALTH_EXIT -eq 0 ] && echo "SMOKE CHECK PASSED" || echo "SMOKE CHECK FAILED"
    ```
    This verifies that InProcessTransport wiring, module injection, and health endpoint all work before committing to 25+ handler migrations.

  **Commit**: YES
  - Message: `feat(bot-core): implement message orchestrator with decorator-based handler routing`
  - Files: `src/modules/bot-core/**`
  - Pre-commit: `npx jest src/modules/bot-core/`

---

- [x] 10. Implement WhatsApp Cloud API Adapter

  **What to do**:
  - Implement `MessageIngressPort` and `MessageEgressPort` for WhatsApp Cloud API
  - **WhatsAppCloudAdapter**:
    - Webhook endpoint: `POST /whatsapp/webhook` — receives webhook events from Meta (matches existing `WHATSAPP_WEBHOOK_URL` default: `https://whatsapp.flashapp.me/whatsapp/webhook` from `src/config/configuration.ts:13`)
    - Webhook verification: `GET /whatsapp/webhook` — Meta verification challenge (same path)
    - Webhook signature validation (X-Hub-Signature-256)
    - Parse webhook payloads → canonical `InboundMessage`
    - Send messages via Cloud API HTTP endpoints → implement `MessageEgressPort`
    - Media handling: download media via Cloud API media endpoint, upload via same
    - Support message types: text, image, audio, document, location, contacts, interactive (buttons/lists)
    - Handle delivery status webhooks (sent, delivered, read)
    - Implement outbound rate limiting (Cloud API tier limits)
  - **WhatsAppCloudMediaService**: implements `MediaPort` for Cloud API media upload/download
  - Configuration: Reuse existing env var names from `src/config/configuration.ts` (lines 8-14): `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_URL`. These are already defined in the repo's config namespace `whatsappCloud`. The new adapter reads from the same config path. **Env validation update**: These vars are NOT currently in `src/config/env.validation.ts` (verified — only `TELEGRAM_BOT_TOKEN` exists for messaging). Add them to the Joi schema using the pattern: `Joi.string().when('NODE_ENV', { is: 'production', then: Joi.required(), otherwise: Joi.optional() })` (allowing local dev without Cloud API credentials). Similarly, update `RABBITMQ_URL` validation: currently `required()` in the Joi schema, but must be changed to **conditionally required** based on `TRANSPORT_MODE`. Joi rule: `RABBITMQ_URL: Joi.string().when('TRANSPORT_MODE', { is: 'rabbitmq', then: Joi.required(), otherwise: Joi.optional() })`. Add `TRANSPORT_MODE` as `Joi.string().optional().valid('in-process', 'rabbitmq').default('in-process')`. This ensures `RABBITMQ_URL` is validated when actually needed (multi-process mode) while not blocking monolith mode.
  - **TRANSPORT_MODE wiring**: Add to `src/config/configuration.ts` a new config namespace `transport`:
    ```typescript
    transport: {
      mode: process.env.TRANSPORT_MODE || 'in-process', // 'in-process' | 'rabbitmq'
    }
    ```
    The `QueueModule` (Task 21) reads `configService.get('transport.mode')` and conditionally provides either `InProcessTransport` or `RabbitMQTransport` as the `MessageTransport` injection token. All modules that need transport inject `MessageTransport` — they never check the mode themselves.
  - TDD with mock webhook payloads

  **Must NOT do**:
  - Do NOT import `whatsapp-web.js` — this is Cloud API only
  - Do NOT put business logic in the adapter — it only translates messages
  - Do NOT handle intents or commands — just emit canonical messages to the orchestrator

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: External API integration with webhook handling, security, rate limiting
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 9)
  - **Blocks**: Tasks 11-13, 22
  - **Blocked By**: Tasks 2 (Cloud API docs), 5 (scaffold)

  **References**:
  - `docs/whatsapp-cloud-api-setup.md` (from Task 2) — API format documentation
  - `src/core/ports/` (from Task 4) — `MessageIngressPort`, `MessageEgressPort`, `MediaPort` interfaces
  - `src/core/types/` (from Task 4) — `InboundMessage`, `OutboundMessage` canonical types
  - Meta Cloud API docs: `https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages`
  - Meta webhook format: `https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components`
  - `src/modules/whatsapp/services/whatsapp-cloud.service.ts` — **Existing implemented Cloud API service** (NOT just commented out — contains real code). Use as **primary reference to copy/adapt** into the new adapter. Specifically:
    - **REUSE** (copy + adapt to canonical types): webhook signature verification (`verifyWebhookSignature()`), webhook challenge handler, send text method, send interactive/buttons method, send template method, media upload/download methods
    - **REWRITE** (don't copy — implement fresh against canonical model): inbound payload → `InboundMessage` mapping (must use canonical `ActorId`/`ChatId`/`FormattedText`, not legacy types), outbound `FormattedText` → Cloud API format rendering, webhook event routing (must go through `MessageTransport`, not direct service calls)
    - The import of this service is commented out in the god service, but the service itself is fully implemented.
  - `src/modules/whatsapp/guards/twilio-webhook.guard.ts` — Webhook signature validation pattern (adapt for Meta's X-Hub-Signature-256)

  **Acceptance Criteria**:
  - [ ] `src/modules/platform/whatsapp-cloud/whatsapp-cloud.adapter.ts` — implements ingress + egress ports
  - [ ] `src/modules/platform/whatsapp-cloud/whatsapp-cloud.controller.ts` — webhook endpoint
  - [ ] `src/modules/platform/whatsapp-cloud/whatsapp-cloud-media.service.ts` — media handling
  - [ ] Tests: `npx jest src/modules/platform/whatsapp-cloud/` — all pass
  - [ ] Test: webhook text message → canonical `InboundMessage` with correct fields
  - [ ] Test: webhook voice message → canonical `InboundMessage` with mediaRef
  - [ ] Test: webhook signature validation (valid + invalid)
  - [ ] Test: send text message → correct Cloud API HTTP call
  - [ ] Test: send interactive message (buttons) → correct Cloud API format
  - [ ] Zero business logic: `wc -l src/modules/platform/whatsapp-cloud/*.ts` — each file < 300 lines
  - [ ] No core imports going wrong direction: adapter depends on core ports, NOT the other way

  **Commit**: YES
  - Message: `feat(platform): implement WhatsApp Cloud API adapter with webhook handling`
  - Files: `src/modules/platform/whatsapp-cloud/**`
  - Pre-commit: `npx jest src/modules/platform/whatsapp-cloud/`

---

- [x] 11. Command Handler Migration — Batch 1: Core Wallet Commands

  **What to do**:
  - Migrate these commands from the god service into individual handler classes:
    - `BalanceHandler` — Check wallet balance (BTC + fiat conversion)
    - `SendPaymentHandler` — Send Lightning payment (to username, phone, or LN address)
    - `ReceiveHandler` — Create Lightning invoice / receive payment
    - `PaymentConfirmationHandler` — Confirm pending payment (yes/no/cancel flow)
    - `TransactionHistoryHandler` — View recent transactions
    - `PriceHandler` — Check BTC price in various currencies
    - `UndoHandler` — Undo last transaction (if supported)
    - `TipHandler` — Send anonymous tip
    - `GroupTipHandler` — Split tip among group members
  - Each handler:
    - Decorated with `@IntentHandler(Intent.X)`
    - Implements `CommandHandler.execute(ctx: CommandContext): Promise<HandlerResult>`
    - Uses `WalletPort` for Flash API calls (NOT direct GraphQL)
    - Uses `SessionPort` for session state
    - Returns `HandlerResult` with `OutboundMessage` (platform-agnostic text formatting)
    - Has comprehensive test file
  - Port response text from god service — preserve user-facing message content

  **Must NOT do**:
  - Do NOT change user-facing message text (preserve exact wording from god service)
  - Do NOT use WhatsApp markdown — use a neutral format that adapters convert per-platform
  - Do NOT call Flash API directly — go through `WalletPort`
  - Do NOT handle voice responses — that's a side effect the orchestrator handles

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Business logic extraction requiring careful preservation of behavior
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 12, 13)
  - **Blocks**: Task 22
  - **Blocked By**: Task 9

  **References**:
  - `docs/feature-inventory.md` (from Task 1) — Feature details for each command
  - `src/modules/whatsapp/services/whatsapp.service.ts` — God service: extract logic from `handleBalance()`, `handleSendPayment()`, `handleReceive()`, `handleTransactionHistory()`, `handlePrice()`, `handleTip()`, etc.
  - `src/modules/whatsapp/commands/handlers/balance.handler.ts` — Already-extracted balance handler (review, may be useful starting point)
  - `src/modules/whatsapp/commands/handlers/send.handler.ts` — Already-extracted send handler
  - `src/modules/flash-api/services/balance.service.ts` — Balance API calls
  - `src/modules/flash-api/services/payment.service.ts` — Payment API calls
  - `src/modules/flash-api/services/invoice.service.ts` — Invoice API calls
  - `src/modules/whatsapp/services/payment-confirmation.service.ts` — Payment confirmation flow logic (yes/no/cancel pending payment)

  **Acceptance Criteria**:
  - [ ] 9 handler files created in `src/modules/bot-core/handlers/wallet/`
  - [ ] Each handler < 200 lines
  - [ ] Tests: `npx jest src/modules/bot-core/handlers/wallet/` — all pass
  - [ ] Test per handler: mock wallet port → verify correct port method called with correct args
  - [ ] Test per handler: verify response matches golden fixtures. **Extraction method**: For each handler, create a `__fixtures__/{handler-name}.golden.ts` file containing `FormattedText` arrays converted from the WhatsApp markdown strings in the corresponding `handle*()` method of `src/modules/whatsapp/services/whatsapp.service.ts`. Conversion: `*bold*` → `{ type: 'bold', value: 'bold' }`, `_italic_` → `{ type: 'italic', value: 'italic' }`, plain text → `{ type: 'text', value: '...' }`. Tests assert handler output `FormattedText` matches these fixtures structurally (deep equality on the segment array).
  - [ ] Zero platform imports: `grep -r "whatsapp\|telegraf" src/modules/bot-core/handlers/` → 0
  - [ ] All handlers use `WalletPort` (not direct Flash API): `grep -r "flash-api\|FlashApiService" src/modules/bot-core/handlers/` → 0

  **Commit**: YES
  - Message: `feat(handlers): migrate core wallet command handlers (balance, send, receive, price, history, tips)`
  - Files: `src/modules/bot-core/handlers/wallet/**`
  - Pre-commit: `npx jest src/modules/bot-core/handlers/wallet/`

---

- [x] 12. Command Handler Migration — Batch 2: Account Management Commands

  **What to do**:
  - Migrate these commands:
    - `LinkHandler` — Link WhatsApp/Telegram to Flash account (phone number input)
    - `VerifyHandler` — Verify OTP code
    - `UnlinkHandler` — Unlink account
    - `RefreshHandler` — Refresh auth token / session
    - `ContactHandler` — Add/manage contacts
    - `ContactImportHandler` — Import contacts from vCard
    - `LanguageHandler` — Set preferred language
    - `SettingsHandler` — View/modify user settings
  - Each follows same pattern as Batch 1

  **Must NOT do**: Same guardrails as Task 11

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Auth flows require careful logic preservation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 11, 13)
  - **Blocks**: Task 22
  - **Blocked By**: Task 9

  **References**:
  - `src/modules/whatsapp/services/whatsapp.service.ts` — Extract `handleLink()`, `handleVerify()`, `handleUnlink()`, `handleRefresh()`, `handleContact()`, etc.
  - `src/modules/whatsapp/commands/handlers/link.handler.ts` — Already-extracted link handler
  - `src/modules/auth/services/auth.service.ts` — OTP send/verify logic
  - `src/modules/auth/services/otp.service.ts` — OTP generation/validation
  - `src/modules/auth/services/session.service.ts` — Session management during linking
  - `src/modules/auth/services/group-auth.service.ts` — Group auth for group features

  **Acceptance Criteria**:
  - [ ] 8 handler files in `src/modules/bot-core/handlers/account/`
  - [ ] Tests: `npx jest src/modules/bot-core/handlers/account/` — all pass
  - [ ] Test: link flow end-to-end (phone → OTP sent → verify → session created)
  - [ ] Test: vCard contact import parsing
  - [ ] Each handler < 200 lines

  **Commit**: YES
  - Message: `feat(handlers): migrate account management handlers (link, verify, contacts, settings)`
  - Files: `src/modules/bot-core/handlers/account/**`
  - Pre-commit: `npx jest src/modules/bot-core/handlers/account/`

---

- [x] 13. Command Handler Migration — Batch 3: Social, Utility, and Meta Commands

  **What to do**:
  - Migrate remaining commands:
    - `HelpHandler` — Show help text (context-aware: linked vs unlinked user)
    - `SupportHandler` — Enter/exit support mode
    - `OnboardingHandler` — New user onboarding flow
    - `VoiceSettingsHandler` — Voice on/off/only/list
    - `AdminHandler` — Admin commands (status, broadcast, user management)
    - `RequestPaymentHandler` — Request payment from another user
    - `PaymentTemplateHandler` — Saved payment templates
    - `NotificationHandler` — Notification preferences
    - Any remaining commands from the feature inventory (Task 1)

  **Must NOT do**: Same guardrails as Task 11

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 11, 12)
  - **Blocks**: Task 22
  - **Blocked By**: Task 9

  **References**:
  - `src/modules/whatsapp/services/whatsapp.service.ts` — All remaining handler methods
  - `src/modules/whatsapp/commands/handlers/help.handler.ts` — Already-extracted help handler
  - `src/modules/whatsapp/services/onboarding.service.ts` — Onboarding flow
  - `src/modules/whatsapp/services/support-mode.service.ts` — Support mode logic
  - `src/modules/whatsapp/services/voice-management.service.ts` — Voice settings management
  - `src/modules/whatsapp/services/payment-templates.service.ts` — Payment templates
  - `src/modules/notifications/` — Notification service and preferences

  **Acceptance Criteria**:
  - [ ] All remaining handler files in `src/modules/bot-core/handlers/social/` and `src/modules/bot-core/handlers/admin/`
  - [ ] Tests: `npx jest src/modules/bot-core/handlers/` — ALL handler tests pass
  - [ ] Combined: every `Intent` enum value has a registered handler
  - [ ] Verify: `npx jest --testNamePattern "handler"` — count matches number of intents in `intents.ts`

  **Commit**: YES
  - Message: `feat(handlers): migrate social, utility, and admin command handlers`
  - Files: `src/modules/bot-core/handlers/social/**`, `src/modules/bot-core/handlers/admin/**`
  - Pre-commit: `npx jest src/modules/bot-core/handlers/`

---

- [ ] 14. Implement Telegram Adapter

  **What to do**:
  - Implement `MessageIngressPort` and `MessageEgressPort` for Telegram
  - **TelegramAdapter**:
    - Uses Telegraf library (existing dependency)
    - Translates Telegraf events → canonical `InboundMessage`
    - Translates `OutboundMessage` → Telegraf send methods
    - Support: text, voice, image, document, inline keyboards (as button alternatives)
    - Polling mode (existing pattern) or webhook mode (configurable)
  - **TelegramMediaService**: implements `MediaPort` for Telegram file API
  - The adapter ONLY translates — zero business logic (all handled by shared bot-core)
  - TDD with mock Telegraf context

  **Must NOT do**:
  - Do NOT duplicate any business logic from WhatsApp (the whole point of this rewrite)
  - Do NOT import from `bot-core/handlers/` — the adapter doesn't know about handlers
  - Do NOT use Telegraf-specific message formatting in outbound — use canonical format

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Straightforward adapter implementation following established port interfaces
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with Tasks 15, 16)
  - **Blocks**: Task 22
  - **Blocked By**: Tasks 4, 9

  **References**:
  - `src/core/ports/` — `MessageIngressPort`, `MessageEgressPort`, `MediaPort` interfaces
  - `src/modules/telegram/services/telegram.service.ts` — Current 654-line Telegram service (extract ONLY the Telegraf wiring, discard business logic)
  - `src/modules/telegram/telegram.module.ts` — Current module structure
  - `src/modules/platform/whatsapp-cloud/` (from Task 10) — Follow same adapter pattern for consistency

  **Acceptance Criteria**:
  - [ ] `src/modules/platform/telegram/telegram.adapter.ts` — implements ingress + egress ports
  - [ ] Tests: `npx jest src/modules/platform/telegram/` — all pass
  - [ ] Test: Telegraf text message → canonical `InboundMessage`
  - [ ] Test: canonical `OutboundMessage` with buttons → Telegraf inline keyboard
  - [ ] Zero business logic: `wc -l src/modules/platform/telegram/*.ts` — each file < 200 lines
  - [ ] No cross-adapter imports: `grep -r "whatsapp" src/modules/platform/telegram/` → 0

  **Commit**: YES
  - Message: `feat(platform): implement Telegram adapter using shared bot core`
  - Files: `src/modules/platform/telegram/**`
  - Pre-commit: `npx jest src/modules/platform/telegram/`

---

- [ ] 15. Plugin System Migration

  **What to do**:
  - Design `PluginPort` interface (from Task 4's design) and implement plugin loader
  - Migrate all existing plugins:
    - Trivia plugin
    - Daily challenges plugin
    - Group games plugin
    - Anonymous messaging plugin
    - Decision-making plugin
    - Translation plugin
    - Joke/meme plugin
  - Each plugin:
    - Implements `PluginPort` interface
    - Self-registers with `PluginRegistry`
    - Has its own intent recognizer patterns (registered with NLP pipeline)
    - Manages its own state via `SessionPort` or dedicated storage
  - TDD for each plugin

  **Must NOT do**:
  - Do NOT expand plugin capabilities — exact parity
  - Do NOT create a "plugin marketplace" or dynamic loading — static registration is fine
  - Do NOT import platform types in plugins

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple plugin implementations with varied logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with Tasks 14, 16)
  - **Blocks**: Task 22
  - **Blocked By**: Task 9

  **References**:
  - `src/modules/plugins-legacy/interfaces/plugin.interface.ts` — Current plugin interface (port this to `PluginPort`). NOTE: After Task 5's `git mv`, all legacy plugin files are under `src/modules/plugins-legacy/`.
  - `src/modules/plugins-legacy/services/plugin-loader.service.ts` — Current plugin loader
  - `src/modules/plugins-legacy/games/trivia.plugin.ts` — Trivia plugin
  - `src/modules/plugins-legacy/games/daily-challenge.plugin.ts` — Daily challenge plugin
  - `src/modules/plugins-legacy/social/group-games.plugin.ts` — Group games plugin
  - `src/modules/plugins-legacy/social/anonymous-messaging.plugin.ts` — Anonymous messaging plugin
  - `src/modules/plugins-legacy/social/decision-making.plugin.ts` — Decision-making plugin
  - `src/modules/plugins-legacy/social/translation.plugin.ts` — Translation plugin
  - `src/modules/plugins-legacy/entertainment/joke-meme.plugin.ts` — Joke/meme plugin
  - `src/core/ports/` — `PluginPort` interface design

  **Acceptance Criteria**:
  - [ ] `src/modules/plugins/` with migrated plugin port and all 7 plugins
  - [ ] Tests: `npx jest src/modules/plugins/` — all pass
  - [ ] Each plugin < 200 lines
  - [ ] Zero platform imports in plugins

  **Commit**: YES
  - Message: `feat(plugins): migrate all plugins to new plugin port interface`
  - Files: `src/modules/plugins/**`
  - Pre-commit: `npx jest src/modules/plugins/`

---

- [x] 16. Implement Voice Module (Pluggable STT/TTS)

  **What to do**:
  - Implement `VoicePort` with pluggable adapter architecture:
    - **VoiceOrchestrator**: Coordinates STT and TTS operations
    - **STT adapters**: Google Cloud Speech (existing), Whisper (future-ready interface)
    - **TTS adapters**: ElevenLabs (existing), Google TTS (existing fallback)
    - Configuration-driven provider selection (env vars)
  - Voice settings per user (via `SessionPort`): voice on/off/only, preferred voice
  - Audio format conversion utilities (ogg/opus ↔ wav/mp3)
  - TDD for orchestrator and each adapter

  **Must NOT do**:
  - Do NOT embed voice logic in bot-core or handlers — voice is a side effect
  - Do NOT train Whisper models — just define the adapter interface
  - Do NOT import platform types

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple external API integrations with audio processing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with Tasks 14, 15)
  - **Blocks**: Task 17
  - **Blocked By**: Task 5

  **References**:
  - `src/core/ports/` — `VoicePort` interface
  - `src/modules/whatsapp/services/voice-response.service.ts` — Current voice response logic
  - `src/modules/whatsapp/services/voice-management.service.ts` — Voice settings management
  - `src/modules/tts/tts.service.ts` — Current TTS service (ElevenLabs + Google fallback)
  - `src/modules/tts/tts.module.ts` — Current TTS module structure
  - `src/modules/speech/speech.service.ts` — Current STT service (Google Cloud Speech)
  - `src/modules/speech/speech.module.ts` — Current STT module structure
  - Package dependencies: `@elevenlabs/elevenlabs-js`, `@google-cloud/speech`, `@google-cloud/text-to-speech`, `google-tts-api`

  **Acceptance Criteria**:
  - [ ] `src/modules/voice/` with orchestrator + STT adapter + TTS adapter
  - [ ] Tests: `npx jest src/modules/voice/` — all pass
  - [ ] Test: STT adapter transcribes mock audio buffer → text
  - [ ] Test: TTS adapter synthesizes text → audio buffer
  - [ ] Test: voice settings integration (on/off/only)
  - [ ] Provider selection via env config
  - [ ] Zero platform imports

  **Commit**: YES
  - Message: `feat(voice): implement pluggable STT/TTS voice module`
  - Files: `src/modules/voice/**`
  - Pre-commit: `npx jest src/modules/voice/`

---

- [x] 17. Implement AI Conversation Module

  **What to do**:
  - Implement `AIConversationPort` — conversational AI for non-command messages
  - **GeminiAdapter**: Wraps `@google/generative-ai` SDK
    - System prompt with Flash/Bitcoin/Lightning context
    - Conversation history management (last N messages from session)
    - Safety constraints (don't give financial advice, don't leak system info)
    - Structured output for intent hints (if Gemini recognizes a command intent, signal it)
  - **ConversationManager**: Manages conversation state across messages
    - Uses `SessionPort` for conversation history
    - Context window management (trim old messages)
  - Pluggable LLM interface — Gemini today, could be OpenAI or local model later
  - TDD with mock LLM responses

  **Must NOT do**:
  - Do NOT hardcode Gemini — use `AIConversationPort` interface
  - Do NOT put intent classification here — that's NLP module's job (Task 8)
  - Do NOT import platform types

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: LLM integration with prompt engineering and conversation management
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with Tasks 18, 19)
  - **Blocks**: Task 22
  - **Blocked By**: Tasks 8, 16

  **References**:
  - `src/core/ports/` — `AIConversationPort` interface
  - `src/modules/gemini-ai/` — Current Gemini integration (service, prompts, configuration)
  - `src/modules/dialect-ai/` — Dialect AI module (may have Patois/Creole-specific prompts)
  - Package: `@google/generative-ai`, `openai`

  **Acceptance Criteria**:
  - [ ] `src/modules/ai/` with Gemini adapter + conversation manager
  - [ ] Tests: `npx jest src/modules/ai/` — all pass
  - [ ] Test: conversational message → Gemini responds with contextual answer
  - [ ] Test: safety constraint — prompt injection attempt → safe response
  - [ ] Test: conversation history maintained across messages
  - [ ] LLM provider swappable via config

  **Commit**: YES
  - Message: `feat(ai): implement conversational AI module with Gemini adapter`
  - Files: `src/modules/ai/**`
  - Pre-commit: `npx jest src/modules/ai/`

---

- [ ] 18. Implement Admin Module

  **What to do**:
  - Migrate admin dashboard and API:
    - Admin authentication (JWT-based, existing pattern)
    - **Admin OTP delivery**: Current admin auth (`src/modules/admin-dashboard/services/admin-auth.service.ts`) sends OTP via `WhatsAppWebService.sendMessage()` (line 59). In the rewrite, admin OTP delivery MUST use `MessageEgressPort` — the admin module injects the egress port and sends OTP to the admin's WhatsApp number via the WhatsApp Cloud API adapter. This means Task 18 depends on Task 10 (WhatsApp Cloud API adapter must exist).
    - Dashboard endpoints: system status, connected users, message stats
    - User management: lookup user, force-unlink, view session
    - Feature flags: simple Redis-backed booleans (`feature:{name}` → `true/false`)
      - Kill switches: disable voice, disable AI, force commands-only mode
      - Per-feature toggles: disable specific commands, plugins
    - Broadcast: send message to all/subset of users (via `MessageEgressPort`, not direct WhatsApp calls)
    - Static admin dashboard HTML (from existing `public/admin/`)
  - Swagger documentation for admin API
  - TDD for admin services

  **Must NOT do**:
  - Do NOT build a feature flag UI — just API + Redis booleans
  - Do NOT add A/B testing or gradual rollout — simple on/off flags
  - Do NOT expand beyond current admin capabilities
  - Do NOT import `WhatsAppWebService` or any platform-specific service — use `MessageEgressPort` for message delivery

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Mostly porting existing admin functionality
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with Tasks 17, 19)
  - **Blocks**: Task 22
  - **Blocked By**: Tasks 5, 10 (needs WhatsApp Cloud API adapter for OTP delivery via `MessageEgressPort`)

  **References**:
  - `src/modules/admin-dashboard/` — Current admin module (controllers, services, guards)
  - `src/modules/admin-dashboard/services/admin-auth.service.ts` — **CRITICAL**: Current admin OTP flow. Lines 51-62 send OTP via `WhatsAppWebService.sendMessage()` to `${cleanNumber}@c.us`. In the rewrite, this MUST use `MessageEgressPort.send()` with a canonical `OutboundMessage` targeting the admin's WhatsApp number via Cloud API.
  - `src/modules/admin-dashboard/controllers/admin-auth.controller.ts` — Admin auth API endpoints
  - `src/modules/admin-dashboard/dto/admin-auth.dto.ts` — Admin auth DTOs
  - `src/modules/auth/guards/` — Admin auth guards
  - `public/admin/` — Static admin dashboard files
  - `src/modules/whatsapp/services/whatsapp.service.ts` — Admin command handling sections
  - `src/core/ports/` (from Task 4) — `MessageEgressPort` for platform-agnostic message delivery

  **Acceptance Criteria**:
  - [ ] `src/modules/admin/` with auth, dashboard, feature flags
  - [ ] Tests: `npx jest src/modules/admin/` — all pass
  - [ ] Test: admin login → OTP sent via `MessageEgressPort` (mocked) → correct `OutboundMessage` constructed with admin phone number
  - [ ] Test: feature flag toggle on/off → affects handler behavior
  - [ ] Test: admin auth (valid JWT, expired JWT, no JWT)
  - [ ] Swagger docs accessible at `/api/docs`
  - [ ] Zero direct platform imports: `grep -r "WhatsAppWebService\|whatsapp-web\|telegraf" src/modules/admin/` → 0

  **Commit**: YES
  - Message: `feat(admin): implement admin module with feature flags and dashboard`
  - Files: `src/modules/admin/**`
  - Pre-commit: `npx jest src/modules/admin/`

---

- [x] 19. Implement Observability Module

  **What to do**:
  - Structured logging with correlation IDs:
    - Every inbound message gets a `correlationId`
    - All log entries include: correlationId, userId, platform, intent, handler, duration
    - Log levels: error, warn, info, debug
  - Health check endpoints:
    - `/health` — basic liveness
    - `/health/ready` — readiness (Redis connected, RabbitMQ connected, etc.)
    - `/health/detailed` — per-component status
  - Metrics (Prometheus-compatible, optional):
    - Messages processed/second
    - Intent classification latency
    - Handler execution latency
    - Platform adapter status
    - Error rates by type
  - Request/response logging interceptor

  **Must NOT do**:
  - Do NOT set up Grafana, Prometheus server, or dashboards
  - Do NOT add distributed tracing (that's future work)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Cross-cutting concern, relatively straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with Tasks 17, 18)
  - **Blocks**: Task 22
  - **Blocked By**: Task 5

  **References**:
  - `src/common/interceptors/logging.interceptor.ts` — Current logging interceptor
  - `src/common/middleware/metrics.middleware.ts` — Current metrics middleware
  - `src/health.controller.ts` — Current health check
  - Package: `prom-client` (already installed)

  **Acceptance Criteria**:
  - [ ] `src/modules/observability/` with logger, health, metrics
  - [ ] Tests: `npx jest src/modules/observability/` — all pass
  - [ ] Test: correlation ID propagated through message processing
  - [ ] Health endpoint returns component statuses
  - [ ] `/metrics` endpoint returns Prometheus format

  **Commit**: YES
  - Message: `feat(observability): implement structured logging, health checks, and metrics`
  - Files: `src/modules/observability/**`
  - Pre-commit: `npx jest src/modules/observability/`

---

- [x] 20. Redis Data Migration Script

  **What to do**:
  - Write a migration script that:
    - Reads all existing Redis session data (keyed by `whatsappId`)
    - Creates new identity mappings: `(whatsapp, phoneNumber)` → new `UserId`
    - Migrates session data to new key format: `session:{userId}`
    - Preserves Flash auth tokens (encrypted)
    - Preserves voice settings, language preferences, etc.
    - Handles edge cases: expired sessions, corrupted data, missing fields
    - Provides dry-run mode and rollback capability
  - Output: `scripts/migrate-redis.ts`
  - TDD with mock Redis data

  **Must NOT do**:
  - Do NOT run against production Redis automatically
  - Do NOT delete old keys during migration (keep both during transition)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Focused data migration script
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 8 (with Tasks 21, 22)
  - **Blocks**: Task 23
  - **Blocked By**: Tasks 3 (Redis schema), 6 (identity/session modules)

  **References**:
  - `docs/redis-schema.md` (from Task 3) — Old and new key mappings
  - `src/modules/identity/` (from Task 6) — New identity service
  - `src/modules/session/` (from Task 6) — New session service
  - `src/modules/redis/redis.service.ts` — Current Redis operations
  - `scripts/cleanup-corrupted-session.ts` — Existing cleanup script (similar pattern)

  **Acceptance Criteria**:
  - [ ] `scripts/migrate-redis.ts` created
  - [ ] Test: mock old-format data → migration → new-format data verified
  - [ ] Test: dry-run mode doesn't modify data
  - [ ] Test: handles corrupted/missing session gracefully
  - [ ] Test: idempotent — running twice doesn't create duplicates

  **Commit**: YES
  - Message: `feat: Redis data migration script for identity and session schema`
  - Files: `scripts/migrate-redis.ts`, test file
  - Pre-commit: `npx jest --testPathPattern scripts/migrate-redis` (Note: Task 5 must update `jest.config.js` testMatch to include `'<rootDir>/scripts/**/*.spec.ts'` in addition to `src/**` and `test/**`. This is added to Task 5's acceptance criteria.)

---

- [x] 21. RabbitMQ Message Contracts + Process Split Architecture

  **What to do**:
  - **Relationship to existing RabbitMQ/events infrastructure**: The old codebase has `src/modules/events/services/event-dispatcher.service.ts` which uses `amqplib` with exchanges and routing keys. This task **supersedes** the old events module — the new `src/modules/queue/` replaces it entirely. The old `src/modules/events/` is NOT imported by the new app (it remains as legacy reference only, just like other old modules). In **monolith mode**, the queue module uses **`InProcessTransport`** (direct function references / callbacks, NO EventEmitter2) instead of RabbitMQ — RabbitMQ is only required when running in multi-process mode. This means monolith mode has zero RabbitMQ dependency.
  - Define RabbitMQ message schemas (used only in multi-process mode):
    - `inbound.message` exchange: platform connectors publish `InboundMessage` events
    - `outbound.message` exchange: bot-core publishes `OutboundMessage` for connectors to consume
    - `side-effect.voice` queue: voice processing jobs (STT/TTS)
    - `side-effect.ai` queue: AI conversation requests
    - `side-effect.notification` queue: push notification jobs
    - Dead letter queues for failed messages
  - Implement a **transport abstraction**: `MessageTransport` interface (defined in `src/core/ports/transport.port.ts`) with two implementations:
    - `InProcessTransport`: uses direct function references (callbacks) for monolith mode (default) — NO EventEmitter2, just registered handler functions called synchronously
    - `RabbitMQTransport`: uses `amqplib` for multi-process mode (activated by env `TRANSPORT_MODE=rabbitmq`)
  - Implement RabbitMQ adapters (only used when `TRANSPORT_MODE=rabbitmq`):
    - `RabbitMQIngressAdapter`: publishes inbound messages to exchange
    - `RabbitMQEgressAdapter`: consumes outbound messages from exchange
    - `RabbitMQWorkerAdapter`: consumes side-effect jobs
  - Configure process entry points:
    - `src/entrypoints/whatsapp-connector.ts` — boots platform adapter + RabbitMQ publisher
    - `src/entrypoints/telegram-connector.ts` — boots platform adapter + RabbitMQ publisher
    - `src/entrypoints/bot-core.ts` — boots core + handlers + RabbitMQ consumer
    - `src/entrypoints/worker.ts` — boots voice/AI/notification workers
    - `src/entrypoints/monolith.ts` — boots everything in one process with `InProcessTransport` (default, no RabbitMQ needed)
  - PM2 ecosystem config for both monolith and multi-process deployment
  - TDD for message serialization/deserialization + transport abstraction

  **Must NOT do**:
  - Do NOT require RabbitMQ for the system to work — monolith entry point uses in-process transport
  - Do NOT reuse/import the old `src/modules/events/` module — it's legacy reference only
  - Do NOT implement complex routing — simple fanout/direct exchanges
  - Do NOT add message ordering guarantees — keep it simple

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Distributed systems architecture with message queuing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 8 (with Tasks 20, 22)
  - **Blocks**: Task 23
  - **Blocked By**: Tasks 4, 9

  **References**:
  - `src/modules/events/` — Current event system (may already have RabbitMQ integration)
  - `src/core/types/` — Canonical message types (these are the queue payloads)
  - Package: `amqplib` (already installed)
  - `ecosystem.config.js` — Current PM2 config (update for multi-process)
  - `ecosystem.prod.config.js` — Current production PM2 config

  **Acceptance Criteria**:
  - [ ] RabbitMQ message schemas documented in `src/core/types/queue-messages.ts`
  - [ ] `src/modules/queue/` with RabbitMQ adapters
  - [ ] `src/entrypoints/` with 5 entry points
  - [ ] Tests: `npx jest src/modules/queue/` — all pass
  - [ ] Test: message serialized → published → consumed → deserialized matches original
  - [ ] Test: monolith entry point boots all modules
  - [ ] `ecosystem.config.js` updated for multi-process mode
  - [ ] Monolith mode works (single process, no RabbitMQ required)

  **Commit**: YES
  - Message: `feat: RabbitMQ message contracts and multi-process entry points`
  - Files: `src/modules/queue/**`, `src/entrypoints/**`, `ecosystem.config.js`
  - Pre-commit: `npx jest src/modules/queue/`

---

- [x] 22. Integration Testing + Feature Parity Matrix

  **What to do**:
  - Write end-to-end integration tests that verify:
    - WhatsApp Cloud API webhook → orchestrator → handler → response sent (mocked Cloud API)
    - Telegram message → orchestrator → handler → response sent (mocked Telegraf)
    - Full command flows: link → verify → balance → send → receive
    - All 25+ commands produce expected output
    - All 6+ plugins produce expected output
    - Voice flow: audio message → STT → intent → handler → TTS → voice response
    - Patois normalization: "mi waan check mi balance" → balance result
    - Feature flags: disable a feature → command returns "feature disabled" message
  - Create feature parity matrix:
    - Automated test for EVERY feature in `docs/feature-inventory.md` (from Task 1)
    - Test names match feature inventory entries for traceability
  - Architecture purity verification tests:
    - No platform imports in core modules
    - No business logic in adapters (file size checks)
    - All intents have handlers
    - All handlers have tests

  **Must NOT do**:
  - Do NOT require real WhatsApp/Telegram connections — all tests use mocks
  - Do NOT require real Flash API — mock all external APIs
  - Do NOT skip any feature from the inventory

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive integration test suite requiring deep understanding of all modules
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 8 (with Tasks 20, 21)
  - **Blocks**: Task 23
  - **Blocked By**: Tasks 11-19 (all modules must be implemented)

  **References**:
  - `docs/feature-inventory.md` (from Task 1) — The checklist for feature parity
  - All test files in `src/modules/*/` (from Tasks 6-19) — unit tests to build on
  - `test/` directory — Current e2e test patterns
  - `jest.config.js` — Test configuration

  **Acceptance Criteria**:
  - [ ] `jest.config.js` already updated by Task 5: `testMatch` includes `src/**/*.spec.ts`, `test/**/*.spec.ts`, and `scripts/**/*.spec.ts` — verify with `grep testMatch jest.config.js`
  - [ ] `test/integration/` with end-to-end test files
  - [ ] `test/parity/feature-parity.spec.ts` — one test per feature inventory entry
  - [ ] `test/architecture/purity.spec.ts` — architecture verification
  - [ ] `npx jest` — ALL tests pass (unit + integration + parity + architecture)
  - [ ] Feature parity: test count ≥ parity unit count (see counting rule below)
  - [ ] Architecture purity: all checks pass

  **Parity Counting Rule**: A "parity unit" is defined as:
  - One test per `Intent` enum value (core commands) — covers the "happy path" for each intent handler
  - One test per `PluginPort` implementation (7 plugins) — covers the primary action of each plugin
  - One test per "subflow" that has distinct UX (e.g., payment confirmation yes/no/cancel = 3 tests, not 1)
  - Group-only branches count as separate parity units only if they have distinct handler logic (e.g., GroupTipHandler is separate from TipHandler)
  - **Minimum count**: `Intent` enum values (25+) + plugins (7) + subflows (estimated 5-10) = **~37-42 parity units**
  - The `test/parity/feature-parity.spec.ts` file must have a programmatic check: import `Intent` enum, assert every value has a corresponding `it()` block

  **Commit**: YES
  - Message: `test: comprehensive integration tests and feature parity matrix`
  - Files: `jest.config.js`, `test/integration/**`, `test/parity/**`, `test/architecture/**`
  - Pre-commit: `npx jest`

---

- [x] 23. Deployment Configuration + Cutover Plan

  **What to do**:
  - Update deployment configuration:
    - `.env.production.example` with new env vars (Cloud API tokens, RabbitMQ config, feature flags)
    - `ecosystem.prod.config.js` for both monolith and multi-process modes
    - Nginx config update (webhook endpoint for Cloud API)
    - PM2 config for process split (if using multi-process)
  - Write cutover plan document:
    - Pre-cutover checklist (Meta Business API verified, Redis migrated, tests passing)
    - Step-by-step cutover procedure
    - Rollback plan (switch back to old branch on `main`)
    - Post-cutover verification steps
    - Monitoring checklist for first 24 hours
  - Clean up: remove old code that's been fully replaced (or document what stays as reference)
  - Output: `docs/CUTOVER-PLAN.md`

  **Must NOT do**:
  - Do NOT actually deploy — this is configuration and documentation only
  - Do NOT delete old code without explicit user approval
  - Do NOT modify production server

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation and configuration task
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (final wave)
  - **Blocks**: None (final task)
  - **Blocked By**: Tasks 20, 21, 22

  **References**:
  - `.env.production.example` — Current production env template
  - `ecosystem.prod.config.js` — Current production PM2 config
  - Server state: Ubuntu 24.04, Nginx, PM2, Redis (auth required), RabbitMQ
  - `scripts/setup-ubuntu-vps.sh` — Current VPS setup script

  **Acceptance Criteria**:
  - [ ] `.env.production.example` updated with all new env vars documented
  - [ ] `ecosystem.prod.config.js` updated for new entry points
  - [ ] `docs/CUTOVER-PLAN.md` created with complete procedure
  - [ ] Cutover plan includes rollback steps
  - [ ] All deployment configs valid (PM2 config parseable, env vars documented)

  **Commit**: YES
  - Message: `docs: deployment configuration and cutover plan`
  - Files: `.env.production.example`, `ecosystem.prod.config.js`, `docs/CUTOVER-PLAN.md`
  - Pre-commit: None

---

## Commit Strategy

| After Task | Message                                              | Key Files                                           | Verification         |
| ---------- | ---------------------------------------------------- | --------------------------------------------------- | -------------------- |
| 1          | `docs: complete feature inventory`                   | `docs/feature-inventory.md`                         | Review               |
| 2          | `docs: WA Cloud API setup`                           | `docs/whatsapp-cloud-api-setup.md`                  | Review               |
| 3          | `docs: Redis schema`                                 | `docs/redis-schema.md`                              | Review               |
| 4          | `feat(core): canonical message model + ports`        | `src/core/**`                                       | `npx jest src/core/` |
| 5          | `feat: scaffold hexagonal structure`                 | Module skeletons                                    | `nest build`         |
| 6          | `feat(identity,session): platform-agnostic services` | `src/modules/identity/**`, `src/modules/session/**` | `npx jest`           |
| 7          | `feat(wallet): Flash API port`                       | `src/modules/wallet/**`                             | `npx jest`           |
| 8          | `feat(nlp): intent pipeline + Patois`                | `src/modules/nlp/**`                                | `npx jest`           |
| 9          | `feat(bot-core): orchestrator + router`              | `src/modules/bot-core/**`                           | `npx jest`           |
| 10         | `feat(platform): WA Cloud API adapter`               | `src/modules/platform/whatsapp-cloud/**`            | `npx jest`           |
| 11         | `feat(handlers): wallet commands`                    | `src/modules/bot-core/handlers/wallet/**`           | `npx jest`           |
| 12         | `feat(handlers): account commands`                   | `src/modules/bot-core/handlers/account/**`          | `npx jest`           |
| 13         | `feat(handlers): social/utility commands`            | `src/modules/bot-core/handlers/social/**`           | `npx jest`           |
| 14         | `feat(platform): Telegram adapter`                   | `src/modules/platform/telegram/**`                  | `npx jest`           |
| 15         | `feat(plugins): migrate all plugins`                 | `src/modules/plugins/**`                            | `npx jest`           |
| 16         | `feat(voice): pluggable STT/TTS`                     | `src/modules/voice/**`                              | `npx jest`           |
| 17         | `feat(ai): conversational AI module`                 | `src/modules/ai/**`                                 | `npx jest`           |
| 18         | `feat(admin): admin module + flags`                  | `src/modules/admin/**`                              | `npx jest`           |
| 19         | `feat(observability): logging + health`              | `src/modules/observability/**`                      | `npx jest`           |
| 20         | `feat: Redis migration script`                       | `scripts/migrate-redis.ts`                          | `npx jest`           |
| 21         | `feat: RabbitMQ + process split`                     | `src/modules/queue/**`, `src/entrypoints/**`        | `npx jest`           |
| 22         | `test: integration + feature parity`                 | `test/**`                                           | `npx jest`           |
| 23         | `docs: deployment + cutover plan`                    | `docs/CUTOVER-PLAN.md`                              | Review               |

---

## Success Criteria

### Verification Commands

```bash
# Full test suite
npx jest                                              # Expected: ALL PASS

# Architecture purity
# Core purity (same CORE_PATHS as Architecture Verification)
CORE_PATHS="src/core/ src/modules/wallet/ src/modules/identity/ src/modules/session/ src/modules/nlp/ src/modules/bot-core/"
grep -r "whatsapp-web\|telegraf" $CORE_PATHS
# Expected: zero results

# No god services
wc -l src/modules/bot-core/handlers/**/*.ts           # Expected: all < 200 lines
wc -l src/modules/platform/**/*.ts                    # Expected: all < 300 lines

# Feature parity
npx jest test/parity/                                 # Expected: ALL PASS, count ≥ 25

# Build
nest build                                            # Expected: zero errors

# Monolith boots
node dist/entrypoints/monolith.js                     # Expected: starts, health check returns OK
```

### Final Checklist

- [ ] All "Must Have" present (WhatsApp Cloud API, Telegram, all commands, all plugins, voice, admin, TDD)
- [ ] All "Must NOT Have" absent (no whatsapp-web.js, no Puppeteer, no feature additions, no Patois ML training)
- [ ] All tests pass
- [ ] Architecture purity verified
- [ ] Feature parity matrix 100% green
- [ ] Cutover plan documented and reviewed
