import { Test } from '@nestjs/testing';
import { DiscoveryModule } from '@nestjs/core';
import { CommandRouterService } from '../router/command-router.service';
import { CommandHandler } from '../handlers/command-handler.base';
import { IntentHandler } from '../decorators/intent-handler.decorator';
import { Intent } from '../../../core/types';
import { CommandContext } from '../types/command-context';
import { HandlerResult } from '../types/handler-result';

@IntentHandler(Intent.Help)
class MockHelpHandler extends CommandHandler {
  async execute(ctx: CommandContext): Promise<HandlerResult> {
    return { messages: [] };
  }
}

describe('CommandRouterService', () => {
  let router: CommandRouterService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [CommandRouterService, MockHelpHandler],
    }).compile();

    router = module.get(CommandRouterService);
    await module.init();
  });

  it('should discover handlers via decorator', () => {
    const handler = router.getHandler(Intent.Help);
    expect(handler).toBeInstanceOf(MockHelpHandler);
  });

  it('should return null for unknown intent', () => {
    const handler = router.getHandler(Intent.CheckBalance);
    expect(handler).toBeNull();
  });
});
