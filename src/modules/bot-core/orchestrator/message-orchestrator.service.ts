import { Injectable, Inject } from '@nestjs/common';
import { InboundMessage, OutboundMessage } from '../../../core/types';
import { IdentityPort } from '../../../core/ports/identity.port';
import { SessionPort } from '../../../core/ports/session.port';
import { IntentClassifierPort } from '../../../core/ports/intent-classifier.port';
import { MessageTransport } from '../../../core/ports/message-transport.port';
import {
  SESSION_PORT,
  IDENTITY_PORT,
  NLP_PORT,
  MESSAGE_TRANSPORT,
} from '../../../core/ports/tokens';
import { CommandRouterService } from '../router/command-router.service';
import { CommandContext } from '../types/command-context';

@Injectable()
export class MessageOrchestratorService {
  constructor(
    @Inject(IDENTITY_PORT) private readonly identityPort: IdentityPort,
    @Inject(SESSION_PORT) private readonly sessionPort: SessionPort,
    @Inject(NLP_PORT) private readonly intentClassifier: IntentClassifierPort,
    private readonly commandRouter: CommandRouterService,
    @Inject(MESSAGE_TRANSPORT) private readonly messageTransport: MessageTransport,
  ) {}

  async processMessage(inbound: InboundMessage): Promise<void> {
    const userId = await this.identityPort.resolveUserId(inbound.from);
    if (!userId) {
      const newUserId = await this.identityPort.createMapping(inbound.from);
      return this.processWithUser(inbound, newUserId);
    }
    return this.processWithUser(inbound, userId);
  }

  private async processWithUser(inbound: InboundMessage, userId: any): Promise<void> {
    const session = await this.sessionPort.getOrCreateSession(userId);

    if (inbound.content.type !== 'text') {
      return;
    }

    const intent = await this.intentClassifier.classify(inbound.content.body);

    if (intent.kind !== 'core') {
      return;
    }

    const handler = this.commandRouter.getHandler(intent.intent);
    if (!handler) {
      return;
    }

    const context: CommandContext = {
      intent,
      slots: intent.slots,
      userId,
      session,
      chat: inbound.chat,
      inboundMessage: inbound,
      platform: inbound.from.platform,
    };

    try {
      const result = await handler.execute(context);
      for (const message of result.messages) {
        await this.messageTransport.publishOutbound(message);
      }
    } catch (error) {
      console.error('Handler execution failed:', error);
    }
  }
}
