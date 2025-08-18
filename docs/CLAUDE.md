# Claude AI Context for Pulse WhatsApp Service

This file contains important context and guidelines for AI assistants working on this codebase.

## Project Name
- Service is branded as **"Pulse"** - capturing the pulse of the Lightning Network
- Bot introduces itself as "Pulse, your personal payment assistant"

## Critical Policies

### BTC Wallet Policy - IMPORTANT
**BTC wallets should be DISABLED and HIDDEN by default.**

- Flash BTC wallets are **non-custodial** - Flash cannot see or control BTC wallet balances
- USD wallets are custodial and should be the default for all operations
- **ALWAYS** show USD balances in notifications, not BTC
- **NEVER** default to BTC operations unless explicitly requested
- When implementing features, check for USD wallet first: `balance.fiatBalance > 0 || balance.btcBalance === 0`

See `/docs/BTC_WALLET_POLICY.md` for full details.

### Voice Features Policy
**Payment recipients automatically get voice notifications**

- When someone receives money, they get a voice-only message (no text)
- Recipients are automatically set to 'voice on' mode for future interactions
- Voice management is dynamic - users can add custom ElevenLabs voices
- Keep voice messages short and natural for better speech synthesis

## Service Architecture (v3.0.0+)

### Core Services
- **WhatsApp Integration**: Multi-instance support with whatsapp-web.js
- **Message Normalization Engine**: Foundation for multi-platform messaging
- **AI Conversational Interface**: Gemini AI processes all unknown messages
- **Flash API**: GraphQL API for payments and account management
- **Payment Types**: 
  - Intraledger (Flash-to-Flash) - Instant and free
  - Lightning Network - For external payments
  - Escrow - For users without Flash accounts

### Message Processing Flow (v3.0.0+)
1. Message received by WhatsAppInstanceManager
2. Routed through WhatsAppMessageRouter for normalization
3. Parsed by CommandParserService for intent extraction
4. Unknown messages processed by GeminiAiService for natural responses
5. Context-aware responses based on user link status

### Key Implementation Notes

1. **Payment Notifications**
   - WebSocket subscriptions only work for Lightning payments
   - Intraledger payments use polling (10-second intervals)
   - Always show USD balance in notifications for USD wallet users

2. **Contact Payments**
   - Check if contact has linked Flash account first
   - Use their Flash username for direct payments
   - Fall back to escrow for unlinked contacts

3. **Security**
   - Never log authentication tokens or full payment hashes
   - Sanitize all user input before logging
   - Use Redis for session management with encryption

4. **Testing Commands**
   - Run linting: `npm run lint`
   - Run type checking: `npm run typecheck`
   - Always run these before considering a task complete

## Common Issues and Solutions

1. **Duplicate Notifications on Restart**
   - Last transaction IDs are persisted in Redis
   - Notification deduplication uses 24-hour timeout

2. **Contact Payments Going to Escrow**
   - Ensure `lightningAddress` is cleared when using username flow
   - Check contact's linked Flash account before defaulting to escrow

3. **Wrong Currency in Notifications**
   - Always check wallet type and show appropriate currency
   - USD users should see USD balance, not BTC

## Voice System Architecture

### Voice Management
- **Dynamic Voices**: Users can add/remove custom ElevenLabs voices
- **Voice Storage**: Voice configurations stored in Redis with persistence
- **Auto-naming**: Voices can be auto-named from a pool of friendly names
- **Reserved Words**: System prevents using command names as voice names

### Voice Response Flow
1. Check user's voice mode (on/off/only)
2. For 'only' mode, generate natural conversational response
3. Convert numbers to words for better speech (e.g., "$10.50" → "ten dollars and fifty cents")
4. Use ElevenLabs API for high-quality voice synthesis

### Voice Commands
- `voice on/off/only` - Set voice mode
- `voice list` - Show available voices
- `voice [name]` - Select a voice
- `voice add [name] [id]` - Add custom voice
- `voice remove [name]` - Remove voice

### Admin Audio Commands (v3.0.0+)
- `admin audio on/off/always` - Control voice response modes
- `admin audio default [name]` - Set default voice for all users
- `admin audio default` - View current default voice
- `admin audio default clear` - Clear default voice setting

Note: Commands changed from `admin voice` to `admin audio` in v3.0.0 to avoid conflicts with regular voice commands.

## Development Guidelines

- Keep logs minimal and sanitized for production
- Prefer USD operations over BTC
- Test with both USD and BTC wallets (when BTC is explicitly needed)
- Always handle both Lightning and Intraledger payment types
- Use TypeScript strict mode and fix all type errors
- Keep voice messages concise and natural-sounding
- Test voice features with different accents and speaking speeds