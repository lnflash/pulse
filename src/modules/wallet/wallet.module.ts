import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SessionModule } from '../session/session.module';
import { FlashApiClient } from './flash-api.client';
import { BalanceService } from './services/balance.service';
import { PaymentService } from './services/payment.service';
import { InvoiceService } from './services/invoice.service';
import { TransactionService } from './services/transaction.service';
import { PriceService } from './services/price.service';
import { UserService } from './services/user.service';
import { WalletFacade } from './wallet.facade';

@Module({
  imports: [ConfigModule, SessionModule],
  providers: [
    FlashApiClient,
    BalanceService,
    PaymentService,
    InvoiceService,
    TransactionService,
    PriceService,
    UserService,
    WalletFacade,
  ],
  exports: [WalletFacade, FlashApiClient],
})
export class WalletModule {}
