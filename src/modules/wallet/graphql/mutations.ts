// Lightning payment mutations
export const LN_INVOICE_PAYMENT_SEND_MUTATION = `
  mutation lnInvoicePaymentSend($input: LnInvoicePaymentInput!) {
    lnInvoicePaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }
`;

export const LN_NO_AMOUNT_INVOICE_PAYMENT_SEND_MUTATION = `
  mutation lnNoAmountInvoicePaymentSend($input: LnNoAmountInvoicePaymentInput!) {
    lnNoAmountInvoicePaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }
`;

export const LN_NO_AMOUNT_USD_INVOICE_PAYMENT_SEND_MUTATION = `
  mutation lnNoAmountUsdInvoicePaymentSend($input: LnNoAmountUsdInvoicePaymentInput!) {
    lnNoAmountUsdInvoicePaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }
`;

// Intraledger payment mutations
export const INTRA_LEDGER_PAYMENT_SEND_MUTATION = `
  mutation intraLedgerPaymentSend($input: IntraLedgerPaymentSendInput!) {
    intraLedgerPaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }
`;

export const INTRA_LEDGER_USD_PAYMENT_SEND_MUTATION = `
  mutation intraLedgerUsdPaymentSend($input: IntraLedgerUsdPaymentSendInput!) {
    intraLedgerUsdPaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }
`;

// On-chain payment mutations
export const ON_CHAIN_PAYMENT_SEND_MUTATION = `
  mutation onChainPaymentSend($input: OnChainPaymentSendInput!) {
    onChainPaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }
`;

export const ON_CHAIN_PAYMENT_SEND_ALL_MUTATION = `
  mutation onChainPaymentSendAll($input: OnChainPaymentSendAllInput!) {
    onChainPaymentSendAll(input: $input) {
      errors {
        message
      }
      status
    }
  }
`;

export const ON_CHAIN_USD_PAYMENT_SEND_MUTATION = `
  mutation onChainUsdPaymentSend($input: OnChainUsdPaymentSendInput!) {
    onChainUsdPaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }
`;

export const ON_CHAIN_USD_PAYMENT_SEND_AS_BTC_DENOMINATED_MUTATION = `
  mutation onChainUsdPaymentSendAsBtcDenominated($input: OnChainUsdPaymentSendAsBtcDenominatedInput!) {
    onChainUsdPaymentSendAsBtcDenominated(input: $input) {
      errors {
        message
      }
      status
    }
  }
`;

// Fee probe mutations for Lightning payments
export const LN_INVOICE_FEE_PROBE_MUTATION = `
  mutation lnInvoiceFeeProbe($input: LnInvoiceFeeProbeInput!) {
    lnInvoiceFeeProbe(input: $input) {
      errors {
        message
      }
      amount
    }
  }
`;

export const LN_NO_AMOUNT_INVOICE_FEE_PROBE_MUTATION = `
  mutation lnNoAmountInvoiceFeeProbe($input: LnNoAmountInvoiceFeeProbeInput!) {
    lnNoAmountInvoiceFeeProbe(input: $input) {
      errors {
        message
      }
      amount
    }
  }
`;

export const LN_NO_AMOUNT_USD_INVOICE_FEE_PROBE_MUTATION = `
  mutation lnNoAmountUsdInvoiceFeeProbe($input: LnNoAmountUsdInvoiceFeeProbeInput!) {
    lnNoAmountUsdInvoiceFeeProbe(input: $input) {
      errors {
        message
      }
      amount
    }
  }
`;

export const LN_USD_INVOICE_FEE_PROBE_MUTATION = `
  mutation lnUsdInvoiceFeeProbe($input: LnUsdInvoiceFeeProbeInput!) {
    lnUsdInvoiceFeeProbe(input: $input) {
      errors {
        message
      }
      amount
    }
  }
`;

// Fee probe queries for on-chain payments
export const ON_CHAIN_TX_FEE_QUERY = `
  query onChainTxFee($walletId: WalletId!, $address: OnChainAddress!, $amount: SatAmount!) {
    onChainTxFee(walletId: $walletId, address: $address, amount: $amount) {
      amount
    }
  }
`;

export const ON_CHAIN_USD_TX_FEE_QUERY = `
  query onChainUsdTxFee($walletId: WalletId!, $address: OnChainAddress!, $amount: CentAmount!) {
    onChainUsdTxFee(walletId: $walletId, address: $address, amount: $amount) {
      amount
    }
  }
`;

export const ON_CHAIN_USD_TX_FEE_AS_BTC_DENOMINATED_QUERY = `
  query onChainUsdTxFeeAsBtcDenominated($walletId: WalletId!, $address: OnChainAddress!, $amount: SatAmount!) {
    onChainUsdTxFeeAsBtcDenominated(walletId: $walletId, address: $address, amount: $amount) {
      amount
    }
  }
`;
