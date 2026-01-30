import { Module } from '@nestjs/common';
import { IntentPipelineService } from './pipeline/intent-pipeline.service';

@Module({
  providers: [IntentPipelineService],
  exports: [IntentPipelineService],
})
export class NlpModule {}
