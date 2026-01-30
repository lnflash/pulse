import { Module } from '@nestjs/common';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { SessionService } from './services/session.service';

@Module({
  imports: [CryptoModule],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
