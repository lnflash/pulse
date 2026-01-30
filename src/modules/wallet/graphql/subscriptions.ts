export const MY_LN_UPDATES_SUBSCRIPTION = `
  subscription myLnUpdates {
    myUpdates {
      errors {
        message
      }
      update {
        ... on LnUpdate {
          __typename
          paymentHash
          status
        }
      }
    }
  }
`;

export const MY_UPDATES_SUBSCRIPTION = `
  subscription myUpdates {
    myUpdates {
      errors {
        message
      }
      update {
        ... on LnUpdate {
          paymentHash
          status
        }
        ... on Price {
          base
          offset
          currencyUnit
        }
      }
    }
  }
`;
