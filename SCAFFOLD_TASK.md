# Task: Scaffold Pulse v5 Project

You are setting up the v5 branch of the Pulse project — an agent-native financial assistant for WhatsApp.

## What to do

1. **Create a `v5` branch** from `main`
2. **Clear out the old src/ directory** and replace with the v5 structure
3. **Keep** existing `.gitignore`, `README.md` (update it), `package.json` (we'll update deps)
4. **Initialize the NestJS + TypeScript project** with this directory structure:

```
src/
├── core/
│   ├── agent/          # AgentLoop, AgentConfig, CompletionSignal, ToolRegistry
│   ├── context/        # UserContext, ContextManager, ContextBuilder, InteractionLog
│   ├── tools/          # Atomic tool definitions
│   │   ├── wallet/     # CheckBalance, SendPayment, ReceivePayment, GetTransactionHistory, GetExchangeRate, EstimateFee
│   │   ├── contacts/   # ResolveContact, ListContacts, AddContact, RemoveContact
│   │   ├── identity/   # LinkAccount, VerifyOTP, GetAccountStatus, GetKYCStatus
│   │   ├── merchant/   # CreateInvoice, GetDailySummary, IssueRefund, GetMerchantStats (stubs)
│   │   ├── discovery/  # LocateAgent, GetServiceStatus (stubs)
│   │   └── system/     # Complete, Clarify, Escalate, UpdateContext
│   ├── dialect/        # DialectClassifier, DialectNormalizer, CurrencyParser, dictionaries/
│   └── security/       # ConfirmationGate, RateLimiter, InputSanitizer, AuditLog
├── ports/              # Interface definitions (hexagonal boundaries)
│   ├── MessagingPort.ts
│   ├── AIProviderPort.ts
│   ├── WalletPort.ts
│   ├── ContextStorePort.ts
│   ├── VoicePort.ts
│   ├── NotificationPort.ts
│   └── StoragePort.ts
├── adapters/           # External service implementations
│   ├── messaging/      # WhatsAppCloudAdapter (stub)
│   ├── ai/            # ClaudeAdapter, GeminiAdapter (stubs)
│   ├── wallet/        # FlashAPIAdapter (stub)
│   ├── context/       # RedisContextAdapter, PersistentContextAdapter (stubs)
│   ├── voice/         # ElevenLabsAdapter, WhisperAdapter (stubs)
│   └── storage/       # FileSystemAdapter (stub)
├── orchestrator/       # MessageOrchestrator, AgentOrchestrator, EventBus
├── prompts/
│   ├── system/        # base-agent.md, safety-rails.md, dialect-awareness.md
│   ├── capabilities/  # personal-agent.md, merchant-agent.md, onboarding.md, corridor-agent.md
│   └── features/      # recurring-payments.md, spending-summary.md, etc.
├── config/            # app.config.ts, model-tiers.ts, feature-flags.ts
├── api/               # HTTP routes + middleware
│   ├── routes/        # health.ts, admin.ts, webhooks.ts
│   └── middleware/    # auth.ts, rateLimit.ts
└── index.ts           # Entry point
```

## Specific implementations needed (not just stubs):

### Port Interfaces (fully defined)
Each port should be a TypeScript interface with complete method signatures and JSDoc comments.

**MessagingPort.ts:**
```typescript
export interface IncomingMessage {
  id: string;
  from: string;
  text?: string;
  voice?: Buffer;
  image?: Buffer;
  timestamp: Date;
  platform: string;
  isGroup: boolean;
  groupId?: string;
  replyTo?: string;
  raw: any;
}

export interface MessagingPort {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  onMessage(handler: (message: IncomingMessage) => Promise<void>): void;
  sendText(to: string, text: string): Promise<void>;
  sendImage(to: string, imageBuffer: Buffer, caption?: string): Promise<void>;
  sendVoice(to: string, audioBuffer: Buffer): Promise<void>;
  sendDocument(to: string, docBuffer: Buffer, filename: string): Promise<void>;
  getPlatformName(): string;
  getMaxMessageLength(): number;
  supportsVoice(): boolean;
  supportsImages(): boolean;
}
```

**AIProviderPort.ts:**
```typescript
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface AIResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}

export interface AIProviderPort {
  chat(messages: AIMessage[], tools?: ToolDefinition[], config?: { maxTokens?: number; temperature?: number }): Promise<AIResponse>;
  getModelName(): string;
  getProviderName(): string;
}
```

**WalletPort.ts** — methods for: getBalance, sendPayment, createInvoice, getTransactionHistory, getExchangeRate, estimateFee. Define proper input/output types.

**ContextStorePort.ts** — methods for: loadContext, saveContext, deleteContext. Takes phoneHash as key, returns UserContext.

**VoicePort.ts** — textToSpeech, speechToText methods.

**NotificationPort.ts** — sendNotification method.

**StoragePort.ts** — read, write, delete, exists methods for file/blob storage.

### Tool Interface (fully defined)
```typescript
export type CompletionSignal = 'continue' | 'complete' | 'clarify' | 'escalate';

export interface ToolResult {
  success: boolean;
  output: string;
  signal: CompletionSignal;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
  requiresAuth: boolean;
  requiresConfirmation: boolean;
  execute(params: any, context: any): Promise<ToolResult>;
}
```

### ToolRegistry (fully implemented)
Auto-discovery of tools, register/unregister, getToolsByCategory, getToolsForUser (filters by auth requirement).

### UserContext Schema (fully defined with Zod)
Implement the complete UserContext interface from the spec with all sections: identity, understanding, financial, patterns, session, guidelines, meta. Full Zod schema with defaults for new users.

### Pino Logger Setup
Configured with structured logging, request context, log levels per environment.

### Jest Configuration
jest.config.ts with TypeScript support, path aliases, coverage thresholds.

### GitHub Actions CI
`.github/workflows/ci.yml` — lint, typecheck, test on push to v5 branch and PRs targeting v5.

## Package dependencies to install:
- @anthropic-ai/sdk
- @google/generative-ai  
- ioredis
- zod
- pino, pino-pretty
- express (or fastify — your choice, keep it simple)
- dotenv
- uuid
- jest, ts-jest, @types/jest
- typescript, @types/node
- eslint, prettier
- tsx (for dev)

## Important:
- This is TypeScript strict mode
- Use ES modules where possible
- Every file should have proper imports/exports
- Port interfaces should be COMPLETE (not placeholder)
- Tool stubs should have the right signatures but can throw "not implemented" 
- Include a .env.example with all expected env vars
- Update README.md to reflect v5

## Do NOT:
- Delete the docs/ folder from v4 (keep it for reference)
- Use NestJS decorators or DI framework — keep it simple with plain TypeScript classes and manual DI
- Over-engineer. Clean, readable, typed code.

When completely finished, run this command to notify me:
openclaw system event --text "Done: Pulse v5 scaffolding complete — project skeleton, port interfaces, tool contracts, UserContext schema, Pino logging, Jest config, CI pipeline all set up on v5 branch." --mode now
