# Messaging Platform Abstraction Migration Guide

## Overview
This guide explains how to migrate from the WhatsApp-specific implementation to the new platform-agnostic messaging abstraction.

## Architecture Benefits

### Before (WhatsApp-specific)
```typescript
// Tightly coupled to WhatsApp
class WhatsappService {
  async processCloudMessage(message: WhatsAppMessage) {
    // WhatsApp-specific logic
  }
}
```

### After (Platform-agnostic)
```typescript
// Works with any messaging platform
class MessageHandler {
  async handle(message: IncomingMessage, platform: IMessagePlatform) {
    // Platform-agnostic logic
  }
}
```

## Migration Steps

### 1. Update Service Dependencies

**Before:**
```typescript
constructor(
  private whatsappService: WhatsappService,
  private whatsappWebService: WhatsAppWebService
) {}
```

**After:**
```typescript
constructor(
  private messagingOrchestrator: MessagingOrchestratorService,
  private platformExecutor: PlatformCommandExecutorService
) {}
```

### 2. Update Message Handling

**Before:**
```typescript
async handleWhatsAppMessage(from: string, text: string) {
  const response = await this.processCommand(text);
  await this.whatsappWebService.sendMessage(from, response);
}
```

**After:**
```typescript
async handle(message: IncomingMessage, platform: IMessagePlatform) {
  const response = await this.processCommand(message.content.text);
  await platform.sendMessage({
    to: message.from,
    content: { text: response }
  });
}
```

### 3. Update Command Execution

**Before:**
```typescript
const command = this.parseCommand(text);
const result = await this.executeCommand(command, userId);
```

**After:**
```typescript
const result = await this.platformExecutor.execute({
  command: parsedCommand.command,
  args: parsedCommand.args,
  userId,
  session,
  platform,
  originalMessage: message
});
```

## Using the New Abstraction

### Sending Messages

```typescript
// Text message
await platform.sendMessage({
  to: userId,
  content: { text: "Hello, world!" }
});

// Voice message
await platform.sendVoice(userId, audioBuffer, "Voice caption");

// Image with caption
await platform.sendImage(userId, imageBuffer, "Image caption");

// Document
await platform.sendDocument(userId, docBuffer, "document.pdf", "Document caption");
```

### Handling Incoming Messages

```typescript
class MyMessageHandler extends BaseMessageHandler {
  priority = 20; // Lower number = higher priority

  canHandle(message: IncomingMessage): boolean {
    return message.type === MessageType.TEXT;
  }

  async handle(message: IncomingMessage, platform: IMessagePlatform) {
    // Your logic here
    await this.reply(message, platform, "Response");
  }
}
```

### Registering Handlers

```typescript
@Module({
  providers: [
    MessagingOrchestratorService,
    MyMessageHandler
  ]
})
export class MyModule {
  constructor(
    orchestrator: MessagingOrchestratorService,
    handler: MyMessageHandler
  ) {
    orchestrator.registerHandler(handler);
  }
}
```

## Platform-Specific Features

Some features are platform-specific and should be accessed conditionally:

```typescript
// Check if platform supports QR codes (WhatsApp Web)
if (platform.getQRCode) {
  const qr = await platform.getQRCode();
}

// Check if platform supports typing indicators
if (platform.sendTypingIndicator) {
  await platform.sendTypingIndicator(userId);
}
```

## Testing with Mock Platform

```typescript
describe('My Feature', () => {
  let mockPlatform: MockMessagePlatform;

  beforeEach(() => {
    mockPlatform = new MockMessagePlatform();
  });

  it('should handle messages', async () => {
    const handler = new MyMessageHandler();
    
    const message: IncomingMessage = {
      id: 'test-123',
      from: '+1234567890',
      timestamp: new Date(),
      type: MessageType.TEXT,
      content: { text: 'Test message' },
      isGroup: false
    };

    await handler.handle(message, mockPlatform);
    // Assert your expectations
  });
});
```

## Configuration

### Environment Variables
```env
# Platform selection
MESSAGING_PLATFORM=whatsapp-web  # or whatsapp-cloud, telegram, etc.

# WhatsApp Web specific
PUPPETEER_HEADLESS=true
WHATSAPP_PHONE_NUMBER=+1234567890

# WhatsApp Cloud API specific (future)
WHATSAPP_API_KEY=your-api-key
WHATSAPP_WEBHOOK_URL=https://your-domain.com/webhook
```

### Module Configuration
```typescript
@Module({
  imports: [
    MessagingPlatformModule,
    // Your other modules
  ]
})
export class AppModule {}
```

## Gradual Migration Strategy

1. **Phase 1**: Create abstraction layer (✅ Complete)
2. **Phase 2**: Migrate command handlers to use abstraction
3. **Phase 3**: Update Dialect AI to use abstraction
4. **Phase 4**: Implement WhatsApp Cloud API adapter
5. **Phase 5**: Add support for other platforms (Telegram, Signal, etc.)

## Common Patterns

### Command Pattern
```typescript
class BalanceCommandHandler implements ICommandHandler {
  async execute(context: CommandContext): Promise<CommandResult> {
    const balance = await this.getBalance(context.userId);
    
    return {
      success: true,
      message: `Your balance: ${balance}`
    };
  }
}
```

### Middleware Pattern
```typescript
class RateLimitMiddleware implements IMessageHandler {
  priority = 1; // Run before other handlers

  async handle(message: IncomingMessage, platform: IMessagePlatform) {
    if (await this.isRateLimited(message.from)) {
      await platform.sendMessage({
        to: message.from,
        content: { text: "Please slow down!" }
      });
      return; // Stop processing
    }
    // Continue to next handler
  }
}
```

### Event Pattern
```typescript
platform.onMessage(async (message) => {
  await this.eventEmitter.emit('message.received', message);
});

platform.onConnectionStatus(async (status) => {
  if (status === PlatformStatus.DISCONNECTED) {
    await this.reconnect();
  }
});
```

## Troubleshooting

### Issue: Messages not being received
- Check platform connection status
- Verify event handlers are registered
- Check handler priorities

### Issue: Commands not executing
- Verify command is registered in CommandRegistry
- Check user session/authentication
- Review command handler implementation

### Issue: Platform not connecting
- Check platform configuration
- Verify credentials/API keys
- Review platform-specific requirements

## Next Steps

1. Update existing handlers to use abstraction
2. Test with mock platform
3. Gradually migrate features
4. Monitor for issues
5. Plan for Cloud API migration

## Support

For questions or issues with the migration, please refer to:
- This migration guide
- The test suite for examples
- The platform abstraction interfaces
- Team documentation