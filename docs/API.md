# API Documentation

## Overview

Pulse integrates with multiple APIs to provide its functionality. This document covers the API integrations and endpoints.

## Flash API Integration

### GraphQL Endpoint
```
https://api.flashapp.me/graphql
```

### Authentication
```typescript
headers: {
  'Authorization': `Bearer ${FLASH_API_KEY}`
}
```

### Key Queries

#### Get Balance
```graphql
query GetBalance {
  me {
    defaultAccount {
      wallets {
        id
        balance
        walletCurrency
      }
    }
  }
}
```

#### Get Transaction History
```graphql
query TransactionHistory($first: Int!, $after: String) {
  me {
    defaultAccount {
      transactions(first: $first, after: $after) {
        edges {
          node {
            id
            status
            direction
            memo
            createdAt
            settlementAmount
            settlementCurrency
            settlementDisplayAmount
            settlementDisplayCurrency
            initiation {
              ... on InitiationViaLn {
                paymentHash
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
```

### Key Mutations

#### Send Payment
```graphql
mutation SendPayment($input: LnInvoicePaymentInput!) {
  lnInvoicePaymentSend(input: $input) {
    status
    transaction {
      id
      status
      direction
      memo
      createdAt
    }
    errors {
      message
      code
    }
  }
}
```

#### Create Invoice
```graphql
mutation CreateInvoice($input: LnUsdInvoiceCreateInput!) {
  lnUsdInvoiceCreate(input: $input) {
    invoice {
      paymentRequest
      paymentHash
      expiresAt
    }
    errors {
      message
      code
    }
  }
}
```

## Google Gemini AI

### Endpoint
```
https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent
```

### Request Format
```typescript
{
  contents: [{
    parts: [{
      text: "User message"
    }]
  }],
  generationConfig: {
    temperature: 0.7,
    topK: 1,
    topP: 1,
    maxOutputTokens: 2048
  }
}
```

## ElevenLabs Voice API

### Text-to-Speech Endpoint
```
https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
```

### Request Format
```typescript
{
  text: "Text to synthesize",
  model_id: "eleven_monolingual_v1",
  voice_settings: {
    stability: 0.5,
    similarity_boost: 0.5
  }
}
```

## OpenAI Whisper API

### Speech-to-Text Endpoint
```
https://api.openai.com/v1/audio/transcriptions
```

### Request Format
```typescript
const formData = new FormData();
formData.append('file', audioFile);
formData.append('model', 'whisper-1');
formData.append('language', 'en');
```

## WhatsApp Web.js Events

### Message Events

```typescript
client.on('message', async (message: Message) => {
  // Handle incoming message
});

client.on('message_create', async (message: Message) => {
  // Handle sent and received messages
});
```

### Connection Events

```typescript
client.on('qr', (qr: string) => {
  // Display QR code for authentication
});

client.on('ready', () => {
  // Client is ready to receive messages
});

client.on('disconnected', (reason: string) => {
  // Handle disconnection
});
```

## Internal REST Endpoints

### Admin Endpoints

#### Get Status
```
GET /admin/status
```

Response:
```json
{
  "connected": true,
  "phoneNumber": "+1234567890",
  "uptime": 3600,
  "version": "2.0.0"
}
```

#### Reconnect WhatsApp
```
POST /admin/reconnect
```

Response:
```json
{
  "success": true,
  "qrCode": "data:image/png;base64,..."
}
```

### Health Check

```
GET /health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00Z",
  "services": {
    "whatsapp": "connected",
    "redis": "connected",
    "flash": "connected"
  }
}
```

## Webhook Integration

### Payment Notifications

Pulse can receive webhooks for payment notifications:

```
POST /webhooks/payment
```

Payload:
```json
{
  "event": "payment.received",
  "data": {
    "amount": 1000,
    "currency": "USD",
    "memo": "Payment memo",
    "from": "sender_username"
  }
}
```

## Error Codes

### Flash API Errors
- `INSUFFICIENT_BALANCE`: Not enough balance
- `INVALID_PAYMENT_REQUEST`: Invalid Lightning invoice
- `EXPIRED_PAYMENT_REQUEST`: Invoice has expired
- `ROUTE_NOT_FOUND`: No route to destination

### Internal Errors
- `USER_NOT_LINKED`: User hasn't linked their Flash account
- `INVALID_COMMAND`: Command not recognized
- `RATE_LIMITED`: Too many requests
- `SESSION_EXPIRED`: WhatsApp session expired

## Rate Limits

- Flash API: 100 requests per minute
- Gemini AI: 60 requests per minute
- ElevenLabs: 100 characters per second
- OpenAI: 50 requests per minute

## Caching Strategy

- Balance: 30 seconds TTL
- Exchange rates: 5 minutes TTL
- User sessions: 24 hours TTL
- Transaction history: 1 minute TTL