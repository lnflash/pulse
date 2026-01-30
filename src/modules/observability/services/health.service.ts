import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  async check(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
