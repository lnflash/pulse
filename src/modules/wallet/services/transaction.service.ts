import { Injectable, Logger } from '@nestjs/common';
import { FlashApiClient } from '../flash-api.client';
import { TRANSACTION_LIST_QUERY } from '../graphql/queries';

export interface Transaction {
  id: string;
  status: string;
  direction: string;
  memo?: string;
  createdAt: string;
  settlementAmount: number;
  settlementFee: number;
  settlementCurrency: string;
  settlementDisplayAmount?: string;
  settlementDisplayCurrency?: string;
  settlementPrice?: {
    base: number;
    offset: number;
    currencyUnit: string;
    formattedAmount: string;
  };
  initiationVia: unknown;
  settlementVia: unknown;
}

export interface TransactionEdge {
  cursor: string;
  node: Transaction;
}

export interface TransactionConnection {
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor?: string;
    endCursor?: string;
  };
  edges: TransactionEdge[];
}

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(private readonly client: FlashApiClient) {}

  async getTransactionHistory(
    authToken: string,
    limit: number = 10,
  ): Promise<TransactionConnection | null> {
    const result = await this.client.execute<{
      me: { defaultAccount: { transactions: TransactionConnection } };
    }>(TRANSACTION_LIST_QUERY, { first: limit }, authToken);

    return result?.me?.defaultAccount?.transactions ?? null;
  }
}
