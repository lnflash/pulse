import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { MessageOrchestratorService } from './orchestrator/message-orchestrator.service';
import { CommandRouterService } from './router/command-router.service';

@Module({
  imports: [DiscoveryModule],
  providers: [MessageOrchestratorService, CommandRouterService],
  exports: [MessageOrchestratorService, CommandRouterService],
})
export class BotCoreModule {}
