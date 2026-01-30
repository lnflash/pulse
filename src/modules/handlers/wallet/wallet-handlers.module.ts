import { Module } from '@nestjs/common';
import { SessionModule } from '../../session/session.module';
import { WalletModule } from '../../wallet/wallet.module';
import { IdentityModule } from '../../identity/identity.module';
import { BalanceHandler } from './balance/balance.handler';
import { SendHandler } from './send/send.handler';
import { ReceiveHandler } from './receive/receive.handler';
import { PayInvoiceHandler } from './pay-invoice/pay-invoice.handler';
import { ConfirmPaymentHandler } from './confirm-payment/confirm-payment.handler';
import { InvoiceDetectedHandler } from './invoice-detected/invoice-detected.handler';
import { RefreshBalanceHandler } from './refresh-balance/refresh-balance.handler';

@Module({
  imports: [SessionModule, WalletModule, IdentityModule],
  providers: [
    BalanceHandler,
    SendHandler,
    ReceiveHandler,
    PayInvoiceHandler,
    ConfirmPaymentHandler,
    InvoiceDetectedHandler,
    RefreshBalanceHandler,
  ],
  exports: [
    BalanceHandler,
    SendHandler,
    ReceiveHandler,
    PayInvoiceHandler,
    ConfirmPaymentHandler,
    InvoiceDetectedHandler,
    RefreshBalanceHandler,
  ],
})
export class WalletHandlersModule {}
