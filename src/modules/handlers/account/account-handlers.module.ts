import { Module } from '@nestjs/common';
import { SessionModule } from '../../session/session.module';
import { WalletModule } from '../../wallet/wallet.module';
import { IdentityModule } from '../../identity/identity.module';
import { LinkHandler } from './link/link.handler';
import { VerifyHandler } from './verify/verify.handler';
import { HelpHandler } from './help/help.handler';

@Module({
  imports: [SessionModule, WalletModule, IdentityModule],
  providers: [LinkHandler, VerifyHandler, HelpHandler],
  exports: [LinkHandler, VerifyHandler, HelpHandler],
})
export class AccountHandlersModule {}
