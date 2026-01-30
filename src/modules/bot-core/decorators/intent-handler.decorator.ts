import { SetMetadata } from '@nestjs/common';
import { Intent } from '../../../core/types';

export const INTENT_HANDLER_METADATA = 'intent_handler';

export const IntentHandler = (intent: Intent) => SetMetadata(INTENT_HANDLER_METADATA, intent);
