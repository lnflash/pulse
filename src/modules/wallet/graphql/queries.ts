export const TRANSACTION_LIST_QUERY = `
  query transactionListForDefaultAccount(
    $first: Int
    $after: String
    $last: Int
    $before: String
  ) {
    me {
      id
      defaultAccount {
        id
        transactions(first: $first, after: $after, last: $last, before: $before) {
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          edges {
            cursor
            node {
              __typename
              id
              status
              direction
              memo
              createdAt
              settlementAmount
              settlementFee
              settlementDisplayFee
              settlementCurrency
              settlementDisplayAmount
              settlementDisplayCurrency
              settlementPrice {
                base
                offset
                currencyUnit
                formattedAmount
              }
              initiationVia {
                ... on InitiationViaIntraLedger {
                  counterPartyWalletId
                  counterPartyUsername
                }
                ... on InitiationViaLn {
                  paymentHash
                }
                ... on InitiationViaOnChain {
                  address
                }
              }
              settlementVia {
                ... on SettlementViaIntraLedger {
                  counterPartyWalletId
                  counterPartyUsername
                }
                ... on SettlementViaLn {
                  paymentSecret
                }
                ... on SettlementViaOnChain {
                  transactionHash
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const REALTIME_PRICE_QUERY = `
  query realtimePrice {
    me {
      defaultAccount {
        realtimePrice {
          btcSatPrice {
            base
            offset
          }
          usdCentPrice {
            base
            offset
          }
          denominatorCurrency
        }
      }
    }
  }
`;

export const ACCOUNT_DEFAULT_WALLET_QUERY = `
  query accountDefaultWallet($username: Username!) {
    accountDefaultWallet(username: $username) {
      id
    }
  }
`;

export const ME_WALLETS_QUERY = `
  query meWallets {
    me {
      id
      defaultAccount {
        id
        defaultWalletId
        wallets {
          id
          balance
          walletCurrency
        }
      }
    }
  }
`;
