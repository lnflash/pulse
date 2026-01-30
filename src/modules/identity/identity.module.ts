import { Module } from '@nestjs/common';
import { IDENTITY_PORT } from '../../core/ports/tokens';
import { IdentityService } from './services/identity.service';

@Module({
  providers: [
    IdentityService,
    {
      provide: IDENTITY_PORT,
      useExisting: IdentityService,
    },
  ],
  exports: [IdentityService, IDENTITY_PORT],
})
export class IdentityModule {}
