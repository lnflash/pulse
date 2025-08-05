# Development Guide

This guide covers everything you need to know to develop Pulse locally.

## Prerequisites

### Required Software

- **Node.js**: Version 20 or higher
- **Redis**: For session management and caching
- **Chrome/Chromium**: For WhatsApp Web automation
- **Git**: For version control

### API Keys

- **Flash API Key**: Required for wallet integration
- **Google Gemini API Key**: Optional, for AI features
- **ElevenLabs API Key**: Optional, for voice synthesis
- **OpenAI API Key**: Optional, for Whisper speech-to-text

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/lnflash/pulse.git
cd pulse
```

### 2. Run Setup Script

```bash
./scripts/setup-local.sh
```

This script will:
- Install Node.js dependencies
- Set up Redis if not installed
- Create necessary directories
- Copy environment template

### 3. Configure Environment

Edit `.env` file with your API keys:

```env
# Flash API (Required)
FLASH_API_URL=https://api.flashapp.me/graphql
FLASH_API_KEY=your_auth_token_here

# AI Services (Optional)
GEMINI_API_KEY=your_gemini_key_here
ELEVENLABS_API_KEY=your_elevenlabs_key_here
OPENAI_API_KEY=your_openai_key_here

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# Admin Configuration
ADMIN_PHONE_NUMBERS=+1234567890,+0987654321
SUPPORT_PHONE_NUMBER=+1234567890

# Nostr Configuration (Optional)
NOSTR_PRIVATE_KEY=your_nsec_here
NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol
```

### 4. Start Development Server

```bash
npm run start:dev
```

The server will start and display a QR code for WhatsApp connection.

## Project Structure

```
pulse/
├── src/
│   ├── common/           # Shared utilities and decorators
│   ├── config/           # Configuration management
│   ├── modules/          # Feature modules
│   │   ├── flash/        # Flash API integration
│   │   ├── whatsapp/     # WhatsApp bot logic
│   │   ├── redis/        # Redis cache management
│   │   ├── nostr/        # Nostr integration
│   │   └── ai/           # AI services
│   └── main.ts           # Application entry point
├── scripts/              # Utility scripts
├── docs/                 # Documentation
└── tests/                # Test files
```

## Key Modules

### WhatsApp Module

Handles all WhatsApp interactions:
- Message processing
- Command parsing
- Voice note handling
- Session management

### Flash Module

Integrates with Flash API:
- Balance checking
- Payment sending
- Invoice creation
- Transaction history

### AI Module

Provides intelligent features:
- Natural language processing
- Voice synthesis
- Speech recognition
- Context-aware responses

## Available Scripts

```bash
# Development
npm run start:dev         # Start with hot reload
npm run debug            # Start with debugging

# Testing
npm test                 # Run all tests
npm run test:watch       # Run tests in watch mode
npm run test:cov         # Generate coverage report

# Code Quality
npm run lint             # Run ESLint
npm run format           # Format with Prettier
npm run typecheck        # TypeScript type checking

# Building
npm run build            # Build for production
npm run start:prod       # Start production build
```

## Testing

### Unit Tests

```bash
# Run specific test file
npm test -- whatsapp.service.spec.ts

# Run tests with coverage
npm run test:cov
```

### Integration Tests

```bash
# Test WhatsApp connection
npm run test:whatsapp

# Test Flash API integration
npm run test:flash
```

### Manual Testing

1. Connect a test WhatsApp number
2. Send commands to test functionality
3. Use test Flash account (not production)

## Debugging

### VS Code Configuration

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Pulse",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "debug"],
  "console": "integratedTerminal"
}
```

### Common Issues

1. **WhatsApp QR Code Not Showing**
   - Check Chrome/Chromium is installed
   - Verify no other instance is running
   - Clear session: `rm -rf .wwebjs_auth`

2. **Redis Connection Failed**
   - Ensure Redis is running: `redis-cli ping`
   - Check Redis configuration in .env

3. **Flash API Errors**
   - Verify API key is correct
   - Check network connectivity
   - Ensure API URL is correct

## Environment Variables

### Required Variables

- `FLASH_API_KEY`: Your Flash API authentication token
- `ADMIN_PHONE_NUMBERS`: Comma-separated admin phone numbers

### Optional Variables

- `GEMINI_API_KEY`: For AI responses
- `ELEVENLABS_API_KEY`: For voice synthesis
- `OPENAI_API_KEY`: For speech recognition
- `REDIS_PASSWORD`: If Redis requires authentication
- `NODE_ENV`: Set to 'development' or 'production'

## Best Practices

1. **Code Style**
   - Use TypeScript features
   - Follow NestJS conventions
   - Keep functions small and focused

2. **Error Handling**
   - Always catch and log errors
   - Provide user-friendly messages
   - Use custom error classes

3. **Security**
   - Never log sensitive data
   - Validate all user input
   - Use environment variables

4. **Performance**
   - Cache frequently accessed data
   - Use async/await properly
   - Optimize database queries

## Troubleshooting

### WhatsApp Issues

```bash
# Clear WhatsApp session
rm -rf .wwebjs_auth
rm -rf whatsapp-sessions

# Check Chrome installation
which chromium || which google-chrome
```

### Redis Issues

```bash
# Check Redis status
redis-cli ping

# Clear Redis cache
redis-cli FLUSHALL
```

### Build Issues

```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run build
```

## Additional Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [WhatsApp Web.js Guide](https://wwebjs.dev)
- [Flash API Documentation](https://docs.flashapp.me)
- [Redis Documentation](https://redis.io/docs)