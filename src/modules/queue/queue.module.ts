import { Module, Global } from '@nestjs/common';
import { InProcessTransport } from './transports/in-process.transport';

export const MESSAGE_TRANSPORT = 'MESSAGE_TRANSPORT';

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
