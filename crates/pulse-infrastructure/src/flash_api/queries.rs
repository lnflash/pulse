//! Flash API GraphQL queries

/// Query to get user info and wallets
pub const ME_WALLETS_QUERY: &str = r#"
  query meWallets {
    me {
      id
      phone
      username
      defaultAccount {
        id
        defaultWalletId
        wallets {
          id
          balance
          walletCurrency
        }
        realtimePrice {
          id
          timestamp
          denominatorCurrency
          btcSatPrice {
            base
            offset
          }
          usdCentPrice {
            base
            offset
          }
        }
      }
    }
  }
"#;

/// Query to get real-time BTC price
pub const REALTIME_PRICE_QUERY: &str = r#"
  query realtimePrice($currency: DisplayCurrency = "USD") {
    realtimePrice(currency: $currency) {
      id
      timestamp
      denominatorCurrency
      btcSatPrice {
        base
        offset
      }
      usdCentPrice {
        base
        offset
      }
    }
  }
"#;

/// Query to get transaction history for default account
pub const TRANSACTION_LIST_QUERY: &str = r#"
  query transactionListForDefaultAccount(
    $first: Int
    $after: String
  ) {
    me {
      id
      defaultAccount {
        id
        transactions(first: $first, after: $after) {
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          edges {
            cursor
            node {
              id
              status
              direction
              memo
              createdAt
              settlementAmount
              settlementCurrency
            }
          }
        }
      }
    }
  }
"#;

/// Query to check if username is available
pub const USERNAME_AVAILABLE_QUERY: &str = r#"
  query usernameAvailable($username: Username!) {
    usernameAvailable(username: $username)
  }
"#;

/// Mutation to create captcha challenge
pub const CAPTCHA_CREATE_CHALLENGE_MUTATION: &str = r#"
  mutation captchaCreateChallenge {
    captchaCreateChallenge {
      errors {
        message
      }
      result {
        id
        challengeCode
        newCaptcha
        failbackMode
      }
    }
  }
"#;

/// Mutation to request auth code (OTP)
pub const CAPTCHA_REQUEST_AUTH_CODE_MUTATION: &str = r#"
  mutation captchaRequestAuthCode($input: CaptchaRequestAuthCodeInput!) {
    captchaRequestAuthCode(input: $input) {
      errors {
        message
      }
      success
    }
  }
"#;

/// Mutation to login with phone and OTP code
pub const USER_LOGIN_MUTATION: &str = r#"
  mutation userLogin($input: UserLoginInput!) {
    userLogin(input: $input) {
      errors {
        message
      }
      authToken
    }
  }
"#;
