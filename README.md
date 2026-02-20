# Pulse v5

**Agent-native financial assistant for Flash wallet users — rebuilt from the ground up.**

> ⚠️ This is the v5 branch — a complete architectural rewrite. v4 docs are preserved in [`docs/`](./docs) for reference.

## Overview

Pulse is a WhatsApp-based AI agent that helps Caribbean users send money, receive payments, check balances, and manage their Flash wallet — all through natural conversation. v5 is a full rewrite using a clean hexagonal architecture, replacing the NestJS v4 codebase with plain TypeScript and a purpose-built agent loop.

## Architecture

```
src/
├── core/                    # Domain logic — no external dependencies
│   ├── agent/               # AgentLoop, ToolRegistry, AgentConfig
│   ├── context/             # UserContext (Zod schema), ContextManager
│   ├── tools/               # Atomic agent capabilities
│   │   ├── wallet/          # CheckBalance, SendPayment, ReceivePayment, ...
│   │   ├── contacts/        # ResolveContact, ListContacts, AddContact, RemoveContact
│   │   ├── identity/        # LinkAccount, VerifyOTP, GetAccountStatus, GetKYCStatus
│   │   ├── merchant/        # CreateInvoice, GetDailySummary, ... (Week 6)
│   │   ├── discovery/       # LocateAgent, GetServiceStatus (Week 9)
│   │   └── system/          # Complete, Clarify, Escalate, UpdateContext
│   ├── dialect/             # Caribbean dialect classification + normalization
│   └── security/            # ConfirmationGate, RateLimiter, InputSanitizer, AuditLog
├── ports/                   # Hexagonal boundaries (pure interfaces)
│   ├── MessagingPort.ts     # WhatsApp / Telegram / SMS
│   ├── AIProviderPort.ts    # Claude / Gemini / GPT-4
│   ├── WalletPort.ts        # Flash API / Lightning
│   ├── ContextStorePort.ts  # Redis / PostgreSQL
│   ├── VoicePort.ts         # ElevenLabs / Whisper
│   ├── NotificationPort.ts  # Push notifications
│   └── StoragePort.ts       # S3 / filesystem
├── adapters/                # Port implementations
│   ├── ai/                  # ClaudeAdapter ✅, GeminiAdapter ✅
│   ├── messaging/           # WhatsAppCloudAdapter (Week 2)
│   ├── wallet/              # FlashAPIAdapter (Week 3)
│   ├── context/             # RedisContextAdapter ✅, PersistentContextAdapter ✅
│   ├── voice/               # ElevenLabsAdapter, WhisperAdapter (Week 5)
│   └── storage/             # FileSystemAdapter ✅
├── orchestrator/            # MessageOrchestrator, AgentOrchestrator, EventBus
├── prompts/                 # System prompts and capability profiles (Markdown)
├── config/                  # App config, logger, feature flags, model tiers
└── api/                     # Express HTTP server (health, webhooks, admin)
```

### Design Principles

- **Hexagonal architecture**: Business logic in `core/` has zero external dependencies. All I/O goes through ports.
- **Plain TypeScript**: No NestJS, no decorators, no DI framework. Just classes with constructors.
- **Manual dependency injection**: Adapters are wired together in `src/index.ts`.
- **Tool-first agent loop**: The AI model drives the conversation; tools are its only way to take action.
- **Zod schema as truth**: `UserContext` is defined once in Zod and inferred as a TypeScript type.

## Prerequisites

- Node.js ≥ 20
- Redis (for context store in production)
- Anthropic API key (Claude)
- WhatsApp Business API credentials

## Getting Started

```bash
# Clone and switch to v5
git checkout v5

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Development (hot-reload)
npm run dev

# Type check
npm run typecheck

# Run tests
npm test

# Build for production
npm run build && npm start
```

## Key Concepts

### AgentLoop
The core of Pulse v5. Each incoming message spawns an `AgentLoop` that:
1. Sends the conversation history + available tools to Claude
2. Executes any tool calls Claude requests
3. Feeds results back to Claude
4. Repeats until Claude returns a plain-text response or a terminal signal

### UserContext
A Zod-validated schema (in `src/core/context/UserContext.ts`) capturing everything we know about a user: identity, language preferences, financial state, behavior patterns, session state, compliance guidelines, and metadata. Persisted via `ContextStorePort`.

### Tool System
Each tool implements `Tool` (in `src/core/tools/Tool.ts`) with:
- A JSON Schema for parameters (sent to the AI model)
- An `execute()` method that does the actual work
- A `CompletionSignal` return that tells the loop what happens next

### Port / Adapter Pattern
Every external service is accessed through a port interface. Adapters implement the port. The business logic never knows which adapter is running — this makes testing and switching providers trivial.

## Testing

```bash
npm test              # Unit tests
npm run test:cov      # With coverage report
```

Tests live in `tests/` mirroring the `src/` structure.

## 13-Week Build Plan

| Week | Sprint | Status |
|------|--------|--------|
| 1 | Scaffold (this PR) | ✅ |
| 2 | WhatsApp adapter + message pipeline | 🔲 |
| 3 | Flash wallet integration | 🔲 |
| 4 | Onboarding + account linking | 🔲 |
| 5 | Voice messages (STT + TTS) | 🔲 |
| 6 | Merchant tools | 🔲 |
| 7 | Multi-language support | 🔲 |
| 8 | Recurring payments | 🔲 |
| 9 | Multi-agent discovery | 🔲 |
| 10 | Analytics + spending summaries | 🔲 |
| 11 | Security hardening | 🔲 |
| 12 | Load testing + optimization | 🔲 |
| 13 | Production cutover | 🔲 |

## v4 Reference

The v4 NestJS codebase documentation is preserved in [`docs/`](./docs) for reference during the rebuild. Do not modify v4 docs.

## License

UNLICENSED — Flash Engineering Team
