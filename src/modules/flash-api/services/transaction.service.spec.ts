import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService, Transaction, TransactionConnection, TransactionEdge } from './transaction.service';
import { FlashApiService } from '../flash-api.service';
import { TRANSACTION_LIST_QUERY, REALTIME_PRICE_QUERY } from '../graphql/queries';

describe('TransactionService', () => {
  let service: TransactionService;
  let flashApiService: jest.Mocked<FlashApiService>;

  const mockTransaction: Transaction = {
    id: 'tx-123456789',
    status: 'SUCCESS',
    direction: 'RECEIVE',
    memo: 'Test payment',
    createdAt: '1704067200', // 2024-01-01 00:00:00 UTC
    settlementAmount: 100000, // 100,000 sats
    settlementFee: 10,
    settlementCurrency: 'BTC',
    settlementDisplayAmount: '43.21',
    settlementDisplayCurrency: 'USD',
    settlementPrice: {
      base: 4321500,
      offset: 2,
      currencyUnit: 'USDCENT',
      formattedAmount: '$43,215.00'
    },
    initiationVia: {
      paymentHash: 'hash123',
      counterPartyUsername: 'alice'
    },
    settlementVia: {
      __typename: 'SettlementViaLn'
    }
  };

  const mockTransactionConnection: TransactionConnection = {
    pageInfo: {
      hasNextPage: true,
      hasPreviousPage: false,
      startCursor: 'cursor-start',
      endCursor: 'cursor-end'
    },
    edges: [
      {
        cursor: 'cursor1',
        node: mockTransaction
      },
      {
        cursor: 'cursor2',
        node: {
          ...mockTransaction,
          id: 'tx-987654321',
          direction: 'SEND',
          createdAt: '1704153600', // 2024-01-02 00:00:00 UTC
          memo: 'Another payment'
        }
      }
    ]
  };

  const authToken = 'auth-token-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        {
          provide: FlashApiService,
          useValue: {
            executeQuery: jest.fn()
          }
        }
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
    flashApiService = module.get(FlashApiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTransactionByPaymentHash', () => {
    it('should return transaction matching payment hash', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        me: {
          id: 'user123',
          defaultAccount: {
            transactions: {
              edges: mockTransactionConnection.edges
            }
          }
        }
      });

      // Act
      const result = await service.getTransactionByPaymentHash('hash123', authToken);

      // Assert
      expect(result).toEqual({
        id: mockTransaction.id,
        status: mockTransaction.status,
        direction: mockTransaction.direction,
        amount: mockTransaction.settlementAmount,
        memo: mockTransaction.memo,
        createdAt: mockTransaction.createdAt,
        userId: 'user123',
        senderUsername: 'alice'
      });
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        TRANSACTION_LIST_QUERY,
        { first: 50 },
        authToken
      );
    });

    it('should return null when no transactions found', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        me: {
          defaultAccount: {
            transactions: {
              edges: []
            }
          }
        }
      });

      // Act
      const result = await service.getTransactionByPaymentHash('hash123', authToken);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when payment hash not found', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        me: {
          defaultAccount: {
            transactions: {
              edges: [
                {
                  node: {
                    ...mockTransaction,
                    initiationVia: { paymentHash: 'different-hash' }
                  }
                }
              ]
            }
          }
        }
      });

      // Act
      const result = await service.getTransactionByPaymentHash('hash123', authToken);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle API errors', async () => {
      // Arrange
      flashApiService.executeQuery.mockRejectedValue(new Error('API error'));

      // Act & Assert
      await expect(
        service.getTransactionByPaymentHash('hash123', authToken)
      ).rejects.toThrow('API error');
    });

    it('should handle missing nested properties gracefully', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({});

      // Act
      const result = await service.getTransactionByPaymentHash('hash123', authToken);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getRecentTransactions', () => {
    it('should return recent transactions with default limit', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        me: {
          defaultAccount: {
            transactions: mockTransactionConnection
          }
        }
      });

      // Act
      const result = await service.getRecentTransactions(authToken);

      // Assert
      expect(result).toEqual(mockTransactionConnection);
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        TRANSACTION_LIST_QUERY,
        { first: 10 },
        authToken
      );
    });

    it('should return recent transactions with custom limit', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        me: {
          defaultAccount: {
            transactions: mockTransactionConnection
          }
        }
      });

      // Act
      const result = await service.getRecentTransactions(authToken, 25);

      // Assert
      expect(result).toEqual(mockTransactionConnection);
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        TRANSACTION_LIST_QUERY,
        { first: 25 },
        authToken
      );
    });

    it('should return null when no transactions found', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({});

      // Act
      const result = await service.getRecentTransactions(authToken);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle API errors', async () => {
      // Arrange
      flashApiService.executeQuery.mockRejectedValue(new Error('Network error'));

      // Act & Assert
      await expect(
        service.getRecentTransactions(authToken)
      ).rejects.toThrow('Network error');
    });
  });

  describe('getRealtimePrice', () => {
    it('should return realtime price data', async () => {
      // Arrange
      const mockPriceData = {
        btcSatPrice: { base: 100000000, offset: 0 },
        usdCentPrice: { base: 4321500, offset: 2 }
      };
      flashApiService.executeQuery.mockResolvedValue({
        data: {
          me: {
            defaultAccount: {
              realtimePrice: mockPriceData
            }
          }
        }
      });

      // Act
      const result = await service.getRealtimePrice(authToken);

      // Assert
      expect(result).toEqual(mockPriceData);
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        REALTIME_PRICE_QUERY,
        {},
        authToken
      );
    });

    it('should return null when price data not available', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({});

      // Act
      const result = await service.getRealtimePrice(authToken);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null on API error', async () => {
      // Arrange
      flashApiService.executeQuery.mockRejectedValue(new Error('API error'));

      // Act
      const result = await service.getRealtimePrice(authToken);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('formatTransaction', () => {
    it('should format BTC transaction correctly', () => {
      // Act
      const result = service.formatTransaction(mockTransaction);

      // Assert
      expect(result).toContain('✅');
      expect(result).toContain('📥 Received');
      expect(result).toContain('0.00100000 BTC');
      expect(result).toContain('~43.21 USD');
      expect(result).toContain('#23456789');
      expect(result).toContain('Test payment');
      expect(result).toContain('alice');
    });

    it('should format USD transaction correctly', () => {
      // Arrange
      const usdTransaction: Transaction = {
        ...mockTransaction,
        settlementCurrency: 'USD',
        settlementAmount: 2500, // $25.00
        settlementDisplayAmount: undefined,
        settlementDisplayCurrency: undefined
      };

      // Act
      const result = service.formatTransaction(usdTransaction);

      // Assert
      expect(result).toContain('$25.00 USD');
      expect(result).toContain('~0.00057837 BTC');
    });

    it('should format send transaction correctly', () => {
      // Arrange
      const sendTransaction: Transaction = {
        ...mockTransaction,
        direction: 'SEND'
      };

      // Act
      const result = service.formatTransaction(sendTransaction);

      // Assert
      expect(result).toContain('📤 Sent');
    });

    it('should format pending transaction correctly', () => {
      // Arrange
      const pendingTransaction: Transaction = {
        ...mockTransaction,
        status: 'PENDING'
      };

      // Act
      const result = service.formatTransaction(pendingTransaction);

      // Assert
      expect(result).toContain('⏳');
    });

    it('should handle transaction without memo', () => {
      // Arrange
      const noMemoTransaction: Transaction = {
        ...mockTransaction,
        memo: undefined
      };

      // Act
      const result = service.formatTransaction(noMemoTransaction);

      // Assert
      expect(result).not.toContain('📝');
    });

    it('should handle transaction without counterparty', () => {
      // Arrange
      const noCounterpartyTransaction: Transaction = {
        ...mockTransaction,
        initiationVia: {}
      };

      // Act
      const result = service.formatTransaction(noCounterpartyTransaction);

      // Assert
      expect(result).not.toContain('👤');
    });
  });

  describe('formatTransactionHistory', () => {
    it('should format transaction history with grouping', () => {
      // Act
      const result = service.formatTransactionHistory(mockTransactionConnection);

      // Assert
      expect(result).toContain('📊 *Recent Transactions*');
      expect(result).toContain('Type "history more" to see older transactions');
    });

    it('should handle empty transaction history', () => {
      // Arrange
      const emptyConnection: TransactionConnection = {
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false
        },
        edges: []
      };

      // Act
      const result = service.formatTransactionHistory(emptyConnection);

      // Assert
      expect(result).toBe('📊 No transactions found.');
    });

    it('should not show navigation hint when no more pages', () => {
      // Arrange
      const lastPageConnection: TransactionConnection = {
        ...mockTransactionConnection,
        pageInfo: {
          ...mockTransactionConnection.pageInfo,
          hasNextPage: false
        }
      };

      // Act
      const result = service.formatTransactionHistory(lastPageConnection);

      // Assert
      expect(result).not.toContain('Type "history more"');
    });
  });

  describe('formatDetailedTransaction', () => {
    it('should format detailed BTC transaction', async () => {
      // Act
      const result = await service.formatDetailedTransaction(mockTransaction, authToken);

      // Assert
      expect(result).toContain('📄 *Transaction Details*');
      expect(result).toContain('📥 RECEIVED');
      expect(result).toContain('0.00100000 BTC');
      expect(result).toContain('100,000 sats');
      expect(result).toContain('$43.21 USD');
      expect(result).toContain('✅ Confirmed');
      expect(result).toContain('#tx-123456789');
      expect(result).toContain('Test payment');
      expect(result).toContain('@alice');
      expect(result).toContain('⚡ Lightning Network');
      expect(result).toContain('$43,215.00');
    });

    it('should format detailed USD transaction', async () => {
      // Arrange
      const usdTransaction: Transaction = {
        ...mockTransaction,
        settlementCurrency: 'USD',
        settlementAmount: 2500,
        settlementFee: 5
      };

      // Act
      const result = await service.formatDetailedTransaction(usdTransaction, authToken);

      // Assert
      expect(result).toContain('$25.00 USD');
      expect(result).toContain('⚡ Fee: $5.00');
    });

    it('should handle transaction without fee', async () => {
      // Arrange
      const noFeeTransaction: Transaction = {
        ...mockTransaction,
        settlementFee: 0
      };

      // Act
      const result = await service.formatDetailedTransaction(noFeeTransaction, authToken);

      // Assert
      expect(result).not.toContain('⚡ Fee:');
    });

    it('should handle different settlement types', async () => {
      // Arrange
      const intraLedgerTransaction: Transaction = {
        ...mockTransaction,
        settlementVia: {
          __typename: 'SettlementViaIntraLedger'
        }
      };

      // Act
      const result = await service.formatDetailedTransaction(intraLedgerTransaction, authToken);

      // Assert
      expect(result).toContain('🏦 Flash Internal Transfer');
    });

    it('should handle on-chain settlement', async () => {
      // Arrange
      const onChainTransaction: Transaction = {
        ...mockTransaction,
        settlementVia: {
          __typename: 'SettlementViaOnChain',
          transactionHash: 'abc123def456'
        }
      };

      // Act
      const result = await service.formatDetailedTransaction(onChainTransaction, authToken);

      // Assert
      expect(result).toContain('⛓️ On-chain Bitcoin');
    });
  });

  describe('formatTransactionForVoice', () => {
    it('should format transaction for voice output', () => {
      // Act
      const result = service.formatTransactionForVoice(mockTransaction);

      // Assert
      expect(result).toContain('You received 100,000 sats');
      expect(result).toContain('or about 43.21 USD');
      expect(result).toContain('on January 1');
      expect(result).toContain('The memo says: Test payment');
      expect(result).toContain('This was from @alice');
      expect(result).toContain('The transaction ID ends with 6789');
    });

    it('should format USD transaction for voice', () => {
      // Arrange
      const usdTransaction: Transaction = {
        ...mockTransaction,
        settlementCurrency: 'USD',
        settlementAmount: 2500
      };

      // Act
      const result = service.formatTransactionForVoice(usdTransaction);

      // Assert
      expect(result).toContain('You received 25.00 dollars');
    });

    it('should format send transaction for voice', () => {
      // Arrange
      const sendTransaction: Transaction = {
        ...mockTransaction,
        direction: 'SEND'
      };

      // Act
      const result = service.formatTransactionForVoice(sendTransaction);

      // Assert
      expect(result).toContain('You sent');
      expect(result).toContain('This was to @alice');
    });

    it('should handle transaction without memo for voice', () => {
      // Arrange
      const noMemoTransaction: Transaction = {
        ...mockTransaction,
        memo: undefined
      };

      // Act
      const result = service.formatTransactionForVoice(noMemoTransaction);

      // Assert
      expect(result).not.toContain('The memo says');
    });

    it('should handle transaction without counterparty for voice', () => {
      // Arrange
      const noCounterpartyTransaction: Transaction = {
        ...mockTransaction,
        initiationVia: {}
      };

      // Act
      const result = service.formatTransactionForVoice(noCounterpartyTransaction);

      // Assert
      expect(result).not.toContain('This was from');
      expect(result).not.toContain('This was to');
    });
  });

  describe('Private Methods', () => {
    describe('groupTransactionsByDate', () => {
      it('should group transactions by today, yesterday, and other dates', () => {
        // Arrange
        const now = Date.now() / 1000;
        const todayTx: TransactionEdge = {
          cursor: 'c1',
          node: { ...mockTransaction, createdAt: now.toString() }
        };
        const yesterdayTx: TransactionEdge = {
          cursor: 'c2',
          node: { ...mockTransaction, createdAt: (now - 86400).toString() }
        };
        const lastWeekTx: TransactionEdge = {
          cursor: 'c3',
          node: { ...mockTransaction, createdAt: (now - 604800).toString() }
        };

        // Act
        const result = (service as any).groupTransactionsByDate([todayTx, yesterdayTx, lastWeekTx]);

        // Assert
        expect(result).toHaveProperty('Today');
        expect(result).toHaveProperty('Yesterday');
        expect(Object.keys(result).length).toBeGreaterThanOrEqual(3);
      });
    });

    describe('calculateBtcEquivalent', () => {
      it('should calculate BTC equivalent from USD cents', () => {
        // Arrange
        const usdCents = 4321500; // $43,215.00
        const price = { base: 4321500, offset: 2 }; // $43,215.00 per BTC

        // Act
        const result = (service as any).calculateBtcEquivalent(usdCents, price);

        // Assert
        expect(result).toBe('1.00000000 BTC');
      });

      it('should format small amounts in sats', () => {
        // Arrange
        const usdCents = 43; // $0.43  
        const price = { base: 4321500, offset: 2 };

        // Act
        const result = (service as any).calculateBtcEquivalent(usdCents, price);

        // Assert
        expect(result).toBe('995 sats');
      });

      it('should return null for invalid price data', () => {
        // Act
        const result1 = (service as any).calculateBtcEquivalent(100, null);
        const result2 = (service as any).calculateBtcEquivalent(100, {});
        const result3 = (service as any).calculateBtcEquivalent(100, { base: 0, offset: 0 });

        // Assert
        expect(result1).toBeNull();
        expect(result2).toBeNull();
        expect(result3).toBeNull();
      });
    });

    describe('getCounterpartyInfo', () => {
      it('should extract counterparty username from initiationVia', () => {
        // Act
        const result = (service as any).getCounterpartyInfo(mockTransaction);

        // Assert
        expect(result).toBe('@alice');
      });

      it('should extract and shorten address from initiationVia', () => {
        // Arrange
        const addressTx: Transaction = {
          ...mockTransaction,
          initiationVia: {
            address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
          }
        };

        // Act
        const result = (service as any).getCounterpartyInfo(addressTx);

        // Assert
        expect(result).toBe('bc1qxy...0wlh');
      });

      it('should extract counterparty from settlementVia', () => {
        // Arrange
        const settlementTx: Transaction = {
          ...mockTransaction,
          initiationVia: {},
          settlementVia: {
            counterPartyUsername: 'bob'
          }
        };

        // Act
        const result = (service as any).getCounterpartyInfo(settlementTx);

        // Assert
        expect(result).toBe('@bob');
      });

      it('should return null when no counterparty info available', () => {
        // Arrange
        const noCounterpartyTx: Transaction = {
          ...mockTransaction,
          initiationVia: {},
          settlementVia: {}
        };

        // Act
        const result = (service as any).getCounterpartyInfo(noCounterpartyTx);

        // Assert
        expect(result).toBeNull();
      });
    });

    describe('getPaymentMethodInfo', () => {
      it('should identify Lightning Network payment', () => {
        // Act
        const result = (service as any).getPaymentMethodInfo({ __typename: 'SettlementViaLn' });

        // Assert
        expect(result).toBe('⚡ Lightning Network');
      });

      it('should identify internal transfer', () => {
        // Act
        const result = (service as any).getPaymentMethodInfo({ __typename: 'SettlementViaIntraLedger' });

        // Assert
        expect(result).toBe('🏦 Flash Internal Transfer');
      });

      it('should identify on-chain payment', () => {
        // Act
        const result = (service as any).getPaymentMethodInfo({ __typename: 'SettlementViaOnChain' });

        // Assert
        expect(result).toBe('⛓️ On-chain Bitcoin');
      });

      it('should return null for unknown payment method', () => {
        // Act
        const result = (service as any).getPaymentMethodInfo({ __typename: 'Unknown' });

        // Assert
        expect(result).toBeNull();
      });

      it('should return null for null input', () => {
        // Act
        const result = (service as any).getPaymentMethodInfo(null);

        // Assert
        expect(result).toBeNull();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large BTC amounts', () => {
      // Arrange
      const largeBtcTx: Transaction = {
        ...mockTransaction,
        settlementAmount: 2100000000000000 // 21M BTC in sats
      };

      // Act
      const result = service.formatTransaction(largeBtcTx);

      // Assert
      expect(result).toContain('21000000.00000000 BTC');
    });

    it('should handle zero amounts', () => {
      // Arrange
      const zeroAmountTx: Transaction = {
        ...mockTransaction,
        settlementAmount: 0
      };

      // Act
      const result = service.formatTransaction(zeroAmountTx);

      // Assert
      expect(result).toContain('0.00000000 BTC');
    });

    it('should handle malformed date strings', () => {
      // Arrange
      const badDateTx: Transaction = {
        ...mockTransaction,
        createdAt: 'invalid-date'
      };

      // Act
      const result = service.formatTransaction(badDateTx);

      // Assert
      expect(result).toBeDefined();
      expect(result).toContain('Invalid Date');
    });

    it('should handle missing settlement price gracefully', () => {
      // Arrange
      const noPriceTx: Transaction = {
        ...mockTransaction,
        settlementPrice: undefined
      };

      // Act
      const result = service.formatTransaction(noPriceTx);

      // Assert
      expect(result).toBeDefined();
      expect(result).not.toContain('null');
      expect(result).not.toContain('undefined');
    });

    it('should handle extremely long memos', () => {
      // Arrange
      const longMemoTx: Transaction = {
        ...mockTransaction,
        memo: 'A'.repeat(500)
      };

      // Act
      const result = service.formatTransaction(longMemoTx);

      // Assert
      expect(result).toBeDefined();
      expect(result.length).toBeLessThan(2000);
    });

    it('should handle special characters in memo', () => {
      // Arrange
      const specialMemoTx: Transaction = {
        ...mockTransaction,
        memo: '🚀 Payment for "services" & goods < $100 >'
      };

      // Act
      const result = service.formatTransaction(specialMemoTx);

      // Assert
      expect(result).toContain('🚀 Payment for "services" & goods < $100 >');
    });
  });
});