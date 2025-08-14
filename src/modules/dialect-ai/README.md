# Dialect AI Module

## Overview
The Dialect AI module enhances Pulse with sophisticated Caribbean dialect processing capabilities, making the WhatsApp bot feel truly native to Caribbean users while maintaining smooth payment interactions.

## Features

### 1. Dialect Detection & Classification
- Automatically detects 5 major Caribbean dialects:
  - Jamaican Patois
  - Trinidadian English
  - Barbadian (Bajan)
  - Haitian Kreyòl
  - Guyanese Creole
- Confidence scoring for accurate dialect identification
- Fallback to standard English when uncertain

### 2. Message Normalization
- Converts dialect phrases to standard English for processing
- Handles currency expressions (e.g., "two bills" → "200 dollars")
- Preserves meaning while standardizing grammar
- Extracts amounts and recipients from natural language

### 3. Enhanced Intent Recognition
- Recognizes payment intents in various dialects
- Supports commands like:
  - Send money: "mi waan send two bills to Sean"
  - Check balance: "check mi money"
  - Request payment: "ask John fi 50 dollars"
  - Account linking: "link mi wallet"
- Fuzzy matching for partial commands
- Context-aware clarification requests

### 4. Conversation Management
- Maintains user context across conversations
- Tracks dialect preference per user
- Handles multi-turn interactions
- Manages pending transactions with confirmations
- 30-minute context timeout for privacy

### 5. Payment Flow Enhancement
- Natural language payment processing
- Amount validation and confirmation
- Large amount warnings (>$100)
- Currency conversion support
- Insufficient funds handling in dialect

### 6. Response Styling
- Generates responses in user's detected dialect
- Natural, culturally appropriate messaging
- Voice response generation with appropriate accents
- Maintains consistency throughout conversation

## Usage Examples

### Jamaican Patois
```
User: "Wah gwaan"
Bot: "Wah gwaan! How mi can help yuh today?"

User: "Mi waan send two bills to Maria"
Bot: "Yuh want fi send 200 USD to Maria? Reply 'yes' fi confirm."

User: "Yes"
Bot: "Done! Mi send 200 USD to Maria. Check yuh wallet fi confirm."
```

### Trinidadian
```
User: "Aye, check meh balance"
Bot: "Yuh Flash wallet balance: 500 TTD"

User: "Send 100 to John"
Bot: "Allyuh sending 100 TTD to John? Say 'yes' to confirm."
```

### Haitian Kreyòl
```
User: "Mwen vle voye kob bay Pierre"
Bot: "Konbyen ou vle voye?"

User: "100 dola"
Bot: "Ou vle voye 100 USD bay Pierre? Di 'wi' pou konfime."
```

## Configuration

### Environment Variables
```env
# Enable/disable dialect AI features
DIALECT_AI_ENABLED=true

# Confidence thresholds
DIALECT_CONFIDENCE_THRESHOLD=0.6
INTENT_CONFIDENCE_THRESHOLD=0.7

# Payment settings
PAYMENT_CONFIRMATION_THRESHOLD=50

# Analytics
DIALECT_AI_ANALYTICS_ENABLED=true
```

### Config File
See `src/modules/dialect-ai/config/dialect-ai.config.ts` for detailed configuration options.

## Architecture

### Core Services

1. **DialectClassifierService**
   - Analyzes text for dialect patterns
   - Returns dialect type and confidence score
   - Maps dialects to appropriate currencies

2. **DialectNormalizerService**
   - Translates dialect phrases to standard English
   - Normalizes currency expressions
   - Extracts entities (amounts, recipients)

3. **IntentRecognizerService**
   - Identifies user intent from normalized text
   - Extracts relevant entities
   - Handles fuzzy matching for unclear commands

4. **ConversationManagerService**
   - Manages conversation context
   - Handles multi-turn interactions
   - Routes to appropriate handlers
   - Styles responses in user's dialect

5. **EnhancedPaymentFlowService**
   - Processes payment commands
   - Validates amounts and recipients
   - Handles confirmations
   - Generates dialect-appropriate messages

6. **EnhancedWhatsappService**
   - Integrates dialect AI with WhatsApp bot
   - Falls back to original service when needed
   - Handles voice message transcription
   - Tracks analytics

## Testing

Run the test suite:
```bash
npm test src/modules/dialect-ai/tests/dialect-ai.integration.spec.ts
```

## Performance

- Dialect detection: <50ms
- Intent recognition: <100ms
- Full message processing: <500ms
- Context retrieval: <10ms
- Voice generation: <2s

## Future Enhancements

1. **Additional Dialects**
   - Belizean Kriol
   - Bahamian Creole
   - Virgin Islands Creole
   - Grenadian Creole

2. **Advanced Features**
   - Sentiment analysis
   - Slang dictionary updates
   - User dialect learning
   - Group conversation support

3. **Voice Improvements**
   - Native accent TTS models
   - Better voice transcription for dialects
   - Real-time voice conversations

4. **Analytics Dashboard**
   - Dialect usage statistics
   - Intent success rates
   - Conversion tracking
   - User engagement metrics

## Contributing

When adding new dialects or features:
1. Update dialect patterns in `DialectClassifierService`
2. Add translations to `DialectNormalizerService`
3. Update intent patterns if needed
4. Add test cases
5. Update this documentation

## Support

For issues or questions about the Dialect AI module, please contact the development team or create an issue in the repository.