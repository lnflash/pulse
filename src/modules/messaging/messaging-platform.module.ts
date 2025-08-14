import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Abstractions and interfaces
export * from './abstractions/message-platform.interface';

// Adapters
import { WhatsAppWebAdapter } from './adapters/whatsapp-web.adapter';

// Handlers
import { BaseMessageHandler } from './handlers/base-message.handler';
import { CommandMessageHandler } from './handlers/command-message.handler';
import { GeneralMessageHandler } from './handlers/general-message.handler';

// Services
import { MessagingOrchestratorService } from './services/messaging-orchestrator.service';
import { PlatformCommandExecutorService } from './services/platform-command-executor.service';

// Import required modules
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AuthModule } from '../auth/auth.module';
import { GeminiAiModule } from '../gemini-ai/gemini-ai.module';
import { EventsModule } from '../events/events.module';
import { CommonModule } from '../common/common.module';

/**
 * Global messaging platform module
 * Provides platform-agnostic messaging capabilities
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    AuthModule,
    GeminiAiModule,
    EventsModule,
    CommonModule,
    WhatsappModule // For existing command handlers and services
  ],
  providers: [
    // Orchestrator
    MessagingOrchestratorService,
    
    // Command Executor
    PlatformCommandExecutorService,
    
    // Adapters (registered as providers for DI)
    WhatsAppWebAdapter,
    
    // Message Handlers
    CommandMessageHandler,
    GeneralMessageHandler,
    
    // Export the orchestrator as the main messaging service
    {
      provide: 'MESSAGING_SERVICE',
      useClass: MessagingOrchestratorService
    }
  ],
  exports: [
    MessagingOrchestratorService,
    PlatformCommandExecutorService,
    'MESSAGING_SERVICE'
  ]
})
export class MessagingPlatformModule {}