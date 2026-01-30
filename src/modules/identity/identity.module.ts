import { Module } from '@nestjs/common';
import { IdentityService } from './services/identity.service';

@Module({
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
