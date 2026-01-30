import { Module, Global } from '@nestjs/common';
import { MESSAGE_TRANSPORT } from '../../core/ports/tokens';
import { InProcessTransport } from './transports/in-process.transport';

@Global()
@Module({
  providers: [
    {
      provide: MESSAGE_TRANSPORT,
      useClass: InProcessTransport,
    },
  ],
  exports: [MESSAGE_TRANSPORT],
})
export class QueueModule {}
