//! Flash API GraphQL mutations

/// Mutation to send a lightning invoice payment
pub const LN_INVOICE_PAYMENT_SEND_MUTATION: &str = r#"
  mutation lnInvoicePaymentSend($input: LnInvoicePaymentInput!) {
    lnInvoicePaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }
"#;

/// Mutation to send an intra-ledger payment
pub const INTRA_LEDGER_PAYMENT_SEND_MUTATION: &str = r#"
  mutation intraLedgerPaymentSend($input: IntraLedgerPaymentSendInput!) {
    intraLedgerPaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }
"#;

/// Mutation to send an intra-ledger USD payment
pub const INTRA_LEDGER_USD_PAYMENT_SEND_MUTATION: &str = r#"
  mutation intraLedgerUsdPaymentSend($input: IntraLedgerUsdPaymentSendInput!) {
    intraLedgerUsdPaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }
"#;

/// Mutation to create a lightning invoice
pub const LN_INVOICE_CREATE_MUTATION: &str = r#"
  mutation lnInvoiceCreate($input: LnInvoiceCreateInput!) {
    lnInvoiceCreate(input: $input) {
      errors {
        message
      }
      invoice {
        paymentRequest
        paymentHash
        paymentSecret
      }
    }
  }
"#;

/// Mutation to create a no-amount lightning invoice
pub const LN_NO_AMOUNT_INVOICE_CREATE_MUTATION: &str = r#"
  mutation lnNoAmountInvoiceCreate($input: LnNoAmountInvoiceCreateInput!) {
    lnNoAmountInvoiceCreate(input: $input) {
      errors {
        message
      }
      invoice {
        paymentRequest
        paymentHash
        paymentSecret
      }
    }
  }
"#;
