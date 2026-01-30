import { Module } from '@nestjs/common';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { SessionService } from './services/session.service';
import { SESSION_PORT } from '../../core/ports/tokens';

@Module({
  imports: [CryptoModule],
  providers: [
    SessionService,
    {
      provide: SESSION_PORT,
      useExisting: SessionService,
    },
  ],
  exports: [SessionService, SESSION_PORT],
})
export class SessionModule {}
