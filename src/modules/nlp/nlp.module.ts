import { Module } from '@nestjs/common';
import { NLP_PORT } from '../../core/ports/tokens';
import { IntentPipelineService } from './pipeline/intent-pipeline.service';

@Module({
  providers: [
    IntentPipelineService,
    {
      provide: NLP_PORT,
      useExisting: IntentPipelineService,
    },
  ],
  exports: [IntentPipelineService, NLP_PORT],
})
export class NlpModule {}
