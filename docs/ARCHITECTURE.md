# Pulse Architecture (v4.0.0)

## Overview

Pulse v4.0.0 implements **hexagonal architecture** (also known as ports and adapters pattern), a design approach that creates a clear separation between business logic and infrastructure concerns. This architecture makes the system highly testable, maintainable, and flexible.

### Why Hexagonal Architecture?

- **Independence**: Business logic doesn't depend on frameworks, databases, or external services
- **Testability**: Easy to test components in isolation by mocking port interfaces
- **Flexibility**: Swap implementations (e.g., different databases, APIs) without changing business logic
- **Maintainability**: Clear boundaries between layers make the codebase easier to understand and modify
- **Scalability**: Easy to add new features, platforms, or integrations

## Core Concepts

### 1. Ports (Interfaces)

Ports are interface definitions that describe what the application needs from the outside world. They define the contract without specifying implementation details.

**Location**: `src/core/ports/`

**Examples**:

- `WalletPort`: Interface for wallet operations (balance, payments, invoices)
- `SessionPort`: Interface for user session management
- `IdentityPort`: Interface for user identity and authentication
- `VoicePort`: Interface for voice settings management
- `TemplatePort`: Interface for payment template management

**Port Interface Example**:

```typescript
// src/core/ports/wallet.port.ts
export interface WalletPort {
  getBalance(userId: UserId): Promise<Balance>;
  sendPayment(userId: UserId, request: PaymentRequest): Promise<Payment>;
  createInvoice(userId: UserId, amount: number): Promise<Invoice>;
  getTransactionHistory(userId: UserId): Promise<Transaction[]>;
}
```

### 2. Adapters (Implementations)

Adapters are concrete implementations of port interfaces. They handle the actual communication with external systems (APIs, databases, services).

**Location**: `src/modules/*/adapters/` or `src/modules/*/*.facade.ts`

**Examples**:

- `WalletFacade`: Implements WalletPort, communicates with Flash API
- `SessionService`: Implements SessionPort, stores data in Redis
- `VoiceAdapter`: Implements VoicePort, manages voice settings in Redis
- `TemplateAdapter`: Implements TemplatePort, wraps PaymentTemplatesService

**Adapter Example**:

```typescript
// src/modules/wallet/wallet.facade.ts
@Injectable()
export class WalletFacade implements WalletPort {
  constructor(
    private readonly balanceService: BalanceService,
    private readonly paymentService: PaymentService,
    private readonly invoiceService: InvoiceService,
  ) {}

  async getBalance(userId: UserId): Promise<Balance> {
    return this.balanceService.getBalance(userId);
  }

  // ... other methods
}
```

### 3. Handlers (Application Layer)

Handlers process user intents and orchestrate business logic using port interfaces. They are discovered automatically via the `@IntentHandler` decorator.

**Location**: `src/modules/handlers/`

**Handler Example**:

```typescript
// src/modules/handlers/wallet/balance/balance.handler.ts
@Injectable()
@IntentHandler(Intent.CheckBalance)
export class BalanceHandler extends CommandHandler {
  constructor(
    @Inject(WALLET_PORT) private readonly wallet: WalletPort,
    @Inject(SESSION_PORT) private readonly session: SessionPort,
  ) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    this.requireAuth(ctx);
    const balance = await this.wallet.getBalance(ctx.userId);
    return this.formatBalanceResponse(balance, ctx);
  }
}
```

### 4. Dependency Injection Tokens

All port interfaces are registered with unique tokens for dependency injection.

**Location**: `src/core/ports/tokens.ts`

```typescript
export const SESSION_PORT = Symbol('SessionPort');
export const WALLET_PORT = Symbol('WalletPort');
export const IDENTITY_PORT = Symbol('IdentityPort');
export const NLP_PORT = Symbol('NlpPort');
export const VOICE_PORT = Symbol('VoicePort');
export const TEMPLATE_PORT = Symbol('TemplatePort');
// ... more tokens
```

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    External World                        │
│  (WhatsApp, Telegram, Flash API, Redis, AI Services)   │
└─────────────────────────────────────────────────────────┘
                           ▲
                           │
┌──────────────────────────┼──────────────────────────────┐
│                    Adapters Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ WalletFacade │  │VoiceAdapter  │  │SessionService│ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└──────────────────────────┼──────────────────────────────┘
                           │ implements
┌──────────────────────────┼──────────────────────────────┐
│                     Ports Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  WalletPort  │  │  VoicePort   │  │ SessionPort  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└──────────────────────────┼──────────────────────────────┘
                           │ uses
┌──────────────────────────┼──────────────────────────────┐
│                  Application Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │BalanceHandler│  │ VoiceHandler │  │  LinkHandler │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└──────────────────────────┼──────────────────────────────┘
                           │ orchestrated by
┌──────────────────────────┼──────────────────────────────┐
│                   Orchestration Layer                    │
│  ┌────────────────────────────────────────────────────┐ │
│  │         MessageOrchestratorService                 │ │
│  │  (NLP → Intent Detection → Handler Routing)        │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────┼──────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────┐
│                  Platform Layer                          │
│  ┌──────────────┐  ┌──────────────┐                    │
│  │WhatsAppAdapter│  │TelegramAdapter│                   │
│  └──────────────┘  └──────────────┘                    │
└─────────────────────────────────────────────────────────┘
                           ▲
                           │
┌─────────────────────────────────────────────────────────┐
│                        Users                             │
│              (WhatsApp, Telegram, etc.)                  │
└─────────────────────────────────────────────────────────┘
```

## Module Structure

```
src/
├── core/                           # Core domain definitions
│   ├── ports/                      # Port interfaces
│   │   ├── tokens.ts              # DI token definitions
│   │   ├── wallet.port.ts         # Wallet operations interface
│   │   ├── session.port.ts        # Session management interface
│   │   ├── identity.port.ts       # Identity/auth interface
│   │   ├── voice.port.ts          # Voice settings interface
│   │   ├── template.port.ts       # Payment templates interface
│   │   └── ...                    # Other port interfaces
│   └── types/                      # Shared type definitions
│       ├── index.ts               # Common types
│       ├── messages.ts            # Message types
│       └── ...
│
├── modules/                        # Feature modules
│   ├── wallet/                     # Wallet domain
│   │   ├── wallet.facade.ts       # Adapter implementing WalletPort
│   │   ├── wallet.module.ts       # Module with DI configuration
│   │   └── services/              # Internal wallet services
│   │
│   ├── session/                    # Session management
│   │   ├── services/
│   │   │   └── session.service.ts # Adapter implementing SessionPort
│   │   └── session.module.ts
│   │
│   ├── voice/                      # Voice settings
│   │   ├── adapters/
│   │   │   └── voice.adapter.ts   # Adapter implementing VoicePort
│   │   └── voice.module.ts
│   │
│   ├── template/                   # Payment templates
│   │   ├── adapters/
│   │   │   └── template.adapter.ts
│   │   └── template.module.ts
│   │
│   ├── handlers/                   # Command handlers
│   │   ├── wallet/
│   │   │   ├── balance/
│   │   │   │   └── balance.handler.ts
│   │   │   ├── send/
│   │   │   │   └── send.handler.ts
│   │   │   └── ...
│   │   ├── account/
│   │   │   ├── link/
│   │   │   │   └── link.handler.ts
│   │   │   └── ...
│   │   └── utility/
│   │       ├── voice.handler.ts
│   │       └── template.handler.ts
│   │
│   ├── bot-core/                   # Core orchestration
│   │   ├── orchestrator/
│   │   │   └── message-orchestrator.service.ts
│   │   ├── router/
│   │   │   └── command-router.service.ts
│   │   └── bot-core.module.ts
│   │
│   ├── platform/                   # Platform adapters
│   │   ├── whatsapp-web/
│   │   ├── telegram/
│   │   └── platform.module.ts
│   │
│   ├── nlp/                        # Natural language processing
│   │   └── nlp.module.ts
│   │
│   └── ai/                         # AI services
│       └── ai.module.ts
│
└── app.module.ts                   # Root application module
```

## Data Flow

### Incoming Message Flow

```
1. User sends message via WhatsApp/Telegram
   ↓
2. Platform Adapter receives message
   ↓
3. MessageOrchestratorService processes message
   ↓
4. NLP Service detects intent
   ↓
5. CommandRouterService finds appropriate handler
   ↓
6. Handler executes using Port interfaces
   ↓
7. Adapters communicate with external services
   ↓
8. Response flows back through the layers
   ↓
9. Platform Adapter sends response to user
```

### Example: Balance Check Flow

```typescript
// 1. User sends "balance" message
WhatsAppAdapter.onMessage("balance")
  ↓
// 2. Orchestrator processes
MessageOrchestratorService.handleMessage(message)
  ↓
// 3. NLP detects intent
NlpService.detectIntent("balance") → Intent.CheckBalance
  ↓
// 4. Router finds handler
CommandRouterService.route(Intent.CheckBalance) → BalanceHandler
  ↓
// 5. Handler executes
BalanceHandler.execute(context)
  ├─ @Inject(WALLET_PORT) wallet: WalletPort
  └─ wallet.getBalance(userId)
      ↓
// 6. Adapter fetches data
WalletFacade.getBalance(userId)
  └─ BalanceService.getBalance(userId)
      └─ FlashApiClient.query(...)
          ↓
// 7. Response flows back
Balance → Handler → Orchestrator → Platform → User
```

## Dependency Injection Pattern

### Module Configuration

Every module that provides a port must:

1. Import the token from `src/core/ports/tokens.ts`
2. Provide the token with `useExisting` pointing to the adapter
3. Export the token so other modules can inject it

```typescript
// src/modules/wallet/wallet.module.ts
import { Module } from '@nestjs/common';
import { WALLET_PORT } from '../../core/ports/tokens';
import { WalletFacade } from './wallet.facade';

@Module({
  providers: [
    WalletFacade,
    {
      provide: WALLET_PORT,
      useExisting: WalletFacade,
    },
  ],
  exports: [WALLET_PORT], // ← Export token for DI
})
export class WalletModule {}
```

### Handler Injection

Handlers inject port interfaces using the token:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { WALLET_PORT } from '../../../core/ports/tokens';
import { WalletPort } from '../../../core/ports/wallet.port';

@Injectable()
export class BalanceHandler {
  constructor(@Inject(WALLET_PORT) private readonly wallet: WalletPort) {}
}
```

## Handler Discovery

Handlers are automatically discovered using the `@IntentHandler` decorator:

```typescript
@Injectable()
@IntentHandler(Intent.CheckBalance)
export class BalanceHandler extends CommandHandler {
  async execute(ctx: CommandContext): Promise<HandlerResult> {
    // Handler logic
  }
}
```

The `CommandRouterService` uses NestJS's `DiscoveryService` to find all classes decorated with `@IntentHandler` and builds a registry mapping intents to handlers.

## Key Design Decisions

### 1. Why Hexagonal Architecture?

**Problem**: Traditional layered architecture creates tight coupling between business logic and infrastructure.

**Solution**: Hexagonal architecture inverts dependencies - business logic defines interfaces (ports) that infrastructure implements (adapters).

**Benefits**:

- Business logic is framework-agnostic
- Easy to test with mocks
- Can swap implementations without changing business logic
- Clear separation of concerns

### 2. Centralized Token Management

**Decision**: All DI tokens defined in `src/core/ports/tokens.ts`

**Rationale**:

- Single source of truth
- Prevents token duplication
- Easy to see all available ports
- Consistent naming convention

### 3. Handler Auto-Discovery

**Decision**: Use decorators for handler registration instead of manual registration

**Rationale**:

- Reduces boilerplate
- Impossible to forget to register a handler
- Clear intent declaration at class level
- Follows NestJS conventions

### 4. Intent-Based Routing

**Decision**: Route messages based on detected intent, not command strings

**Rationale**:

- Supports natural language processing
- Decouples user input from handler logic
- Enables multiple ways to trigger same action
- Better user experience

## Testing Strategy

### Unit Testing Handlers

Mock port interfaces for isolated testing:

```typescript
describe('BalanceHandler', () => {
  let handler: BalanceHandler;
  let mockWallet: jest.Mocked<WalletPort>;

  beforeEach(() => {
    mockWallet = {
      getBalance: jest.fn(),
      sendPayment: jest.fn(),
      // ... other methods
    };

    handler = new BalanceHandler(mockWallet);
  });

  it('should return balance', async () => {
    mockWallet.getBalance.mockResolvedValue({
      btc: 0.001,
      usd: 50,
    });

    const result = await handler.execute(context);

    expect(mockWallet.getBalance).toHaveBeenCalledWith(userId);
    expect(result.messages[0].content).toContain('50');
  });
});
```

### Integration Testing

Test adapters with real services (or test doubles):

```typescript
describe('WalletFacade', () => {
  let facade: WalletFacade;
  let flashApiClient: FlashApiClient;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [WalletFacade, FlashApiClient],
    }).compile();

    facade = module.get<WalletFacade>(WalletFacade);
  });

  it('should fetch balance from Flash API', async () => {
    const balance = await facade.getBalance(userId);
    expect(balance).toBeDefined();
    expect(balance.btc).toBeGreaterThanOrEqual(0);
  });
});
```

## Adding New Features

### 1. Define Port Interface (if needed)

```typescript
// src/core/ports/notification.port.ts
export interface NotificationPort {
  sendNotification(userId: UserId, message: string): Promise<void>;
  getNotificationSettings(userId: UserId): Promise<NotificationSettings>;
}
```

### 2. Add Token

```typescript
// src/core/ports/tokens.ts
export const NOTIFICATION_PORT = Symbol('NotificationPort');
```

### 3. Create Adapter

```typescript
// src/modules/notification/adapters/notification.adapter.ts
@Injectable()
export class NotificationAdapter implements NotificationPort {
  async sendNotification(userId: UserId, message: string): Promise<void> {
    // Implementation
  }

  async getNotificationSettings(userId: UserId): Promise<NotificationSettings> {
    // Implementation
  }
}
```

### 4. Create Module

```typescript
// src/modules/notification/notification.module.ts
@Module({
  providers: [
    NotificationAdapter,
    {
      provide: NOTIFICATION_PORT,
      useExisting: NotificationAdapter,
    },
  ],
  exports: [NOTIFICATION_PORT],
})
export class NotificationModule {}
```

### 5. Create Handler

```typescript
// src/modules/handlers/notification/notification-settings.handler.ts
@Injectable()
@IntentHandler(Intent.ManageNotifications)
export class NotificationSettingsHandler extends CommandHandler {
  constructor(@Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort) {
    super();
  }

  async execute(ctx: CommandContext): Promise<HandlerResult> {
    const settings = await this.notifications.getNotificationSettings(ctx.userId);
    return this.formatSettingsResponse(settings, ctx);
  }
}
```

### 6. Import Module

```typescript
// src/app.module.ts
@Module({
  imports: [
    // ... other modules
    NotificationModule,
  ],
})
export class AppModule {}
```

## Scaling Considerations

### Horizontal Scaling

- **Stateless Handlers**: Handlers don't maintain state, making horizontal scaling straightforward
- **Session Affinity**: WhatsApp Web.js requires session affinity (sticky sessions)
- **Redis Clustering**: Use Redis cluster for distributed session storage

### Performance

- **Caching**: Implement caching at the adapter level
- **Connection Pooling**: Use connection pools for database and API clients
- **Async Processing**: Use queues for long-running operations

### Monitoring

- **Structured Logging**: All layers log with consistent structure
- **Metrics**: Track handler execution time, API latency, error rates
- **Health Checks**: Implement health checks for all external dependencies

## Migration from v3.0.0

The v4.0.0 rewrite maintains backward compatibility at the API level while completely restructuring the internal architecture:

### What Changed

- **Module Structure**: Reorganized into hexagonal pattern
- **Dependency Injection**: Centralized token management
- **Handler System**: Decorator-based auto-discovery
- **Service Layer**: Wrapped with port interfaces

### What Stayed the Same

- **User Experience**: All commands and features work identically
- **External APIs**: Flash API integration unchanged
- **Platform Support**: WhatsApp and Telegram still supported
- **Configuration**: Environment variables unchanged

## Additional Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- [Ports and Adapters Pattern](https://herbertograca.com/2017/09/14/ports-adapters-architecture/)
- [Dependency Injection in NestJS](https://docs.nestjs.com/fundamentals/custom-providers)
