import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';

@Injectable()
export class LoggerService implements NestLoggerService {
  log(message: string, context?: string) {
    console.log(`[${context || 'App'}] ${message}`);
  }

  error(message: string, trace?: string, context?: string) {
    console.error(`[${context || 'App'}] ${message}`, trace);
  }

  warn(message: string, context?: string) {
    console.warn(`[${context || 'App'}] ${message}`);
  }

  debug(message: string, context?: string) {
    console.debug(`[${context || 'App'}] ${message}`);
  }

  verbose(message: string, context?: string) {
    console.log(`[${context || 'App'}] ${message}`);
  }
}
