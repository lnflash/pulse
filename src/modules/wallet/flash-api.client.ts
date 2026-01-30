import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

@Injectable()
export class FlashApiClient {
  private readonly logger = new Logger(FlashApiClient.name);
  private readonly apiUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl = this.configService.get<string>('flashApi.url') || '';
    if (!this.apiUrl) {
      this.logger.warn('Flash API URL not configured');
    }
  }

  /**
   * Execute a GraphQL query/mutation against Flash API
   */
  async execute<T>(
    query: string,
    variables: Record<string, unknown> = {},
    authToken?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Pulse-Wallet/1.0',
    };

    if (authToken) {
      headers['Authorization'] = authToken.startsWith('Bearer ')
        ? authToken
        : `Bearer ${authToken}`;
    } else {
      headers['Authorization'] = '';
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Flash API error (${response.status}): ${errorText}`);
    }

    const json = (await response.json()) as GraphQLResponse<T>;

    if (json.errors?.length) {
      throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
    }

    return json.data as T;
  }
}
