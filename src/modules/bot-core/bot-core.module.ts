import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { SessionModule } from '../session/session.module';
import { WalletModule } from '../wallet/wallet.module';
import { IdentityModule } from '../identity/identity.module';
import { NlpModule } from '../nlp/nlp.module';
import { QueueModule } from '../queue/queue.module';
import { MessageOrchestratorService } from './orchestrator/message-orchestrator.service';
import { CommandRouterService } from './router/command-router.service';

@Module({
  imports: [DiscoveryModule, SessionModule, WalletModule, IdentityModule, NlpModule, QueueModule],
  providers: [MessageOrchestratorService, CommandRouterService],
  exports: [MessageOrchestratorService, CommandRouterService],
})
export class BotCoreModule {}
