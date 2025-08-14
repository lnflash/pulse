import { Module, forwardRef } from '@nestjs/common';
import { DialectClassifierService } from './services/dialect-classifier.service';
import { DialectNormalizerService } from './services/dialect-normalizer.service';
import { IntentRecognizerService } from './services/intent-recognizer.service';
import { ConversationManagerService } from './services/conversation-manager.service';
import { EnhancedPaymentFlowService } from './services/enhanced-payment-flow.service';
import { DialectMessageHandler } from './services/dialect-message.handler';
import { FlashApiModule } from '../flash-api/flash-api.module';
import { GeminiAiModule } from '../gemini-ai/gemini-ai.module';
import { SpeechModule } from '../speech/speech.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    forwardRef(() => FlashApiModule),
    forwardRef(() => GeminiAiModule),
    forwardRef(() => SpeechModule),
    forwardRef(() => AuthModule)
  ],
  providers: [
    DialectClassifierService,
    DialectNormalizerService,
    IntentRecognizerService,
    ConversationManagerService,
    EnhancedPaymentFlowService,
    DialectMessageHandler
  ],
  exports: [
    DialectClassifierService,
    DialectNormalizerService,
    IntentRecognizerService,
    ConversationManagerService,
    EnhancedPaymentFlowService,
    DialectMessageHandler
  ]
})
export class DialectAiModule {}