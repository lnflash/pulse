import { Module } from '@nestjs/common';
import { LinkHandler } from './link/link.handler';
import { VerifyHandler } from './verify/verify.handler';
import { HelpHandler } from './help/help.handler';

@Module({
  providers: [LinkHandler, VerifyHandler, HelpHandler],
  exports: [LinkHandler, VerifyHandler, HelpHandler],
})
export class AccountHandlersModule {}
