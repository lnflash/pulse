import { Module } from '@nestjs/common';
import { BalanceHandler } from './balance/balance.handler';
import { SendHandler } from './send/send.handler';
import { ReceiveHandler } from './receive/receive.handler';
import { PayInvoiceHandler } from './pay-invoice/pay-invoice.handler';
import { ConfirmPaymentHandler } from './confirm-payment/confirm-payment.handler';
import { InvoiceDetectedHandler } from './invoice-detected/invoice-detected.handler';
import { WalletModule } from '../../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  providers: [
    BalanceHandler,
    SendHandler,
    ReceiveHandler,
    PayInvoiceHandler,
    ConfirmPaymentHandler,
    InvoiceDetectedHandler,
    {
      provide: 'WalletPort',
      useExisting: 'WalletFacade',
    },
  ],
  exports: [
    BalanceHandler,
    SendHandler,
    ReceiveHandler,
    PayInvoiceHandler,
    ConfirmPaymentHandler,
    InvoiceDetectedHandler,
  ],
})
export class WalletHandlersModule {}
