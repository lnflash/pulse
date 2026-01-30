import { Module } from '@nestjs/common';
import { BalanceHandler } from './balance/balance.handler';
import { SendHandler } from './send/send.handler';
import { ReceiveHandler } from './receive/receive.handler';
import { WalletModule } from '../../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  providers: [
    BalanceHandler,
    SendHandler,
    ReceiveHandler,
    {
      provide: 'WalletPort',
      useExisting: 'WalletFacade',
    },
  ],
  exports: [BalanceHandler, SendHandler, ReceiveHandler],
})
export class WalletHandlersModule {}
