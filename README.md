# Pulse v4.0.0

**Keep your finger on it.**

![logo](https://github.com/user-attachments/assets/f54a0c3e-0614-404f-a98f-087a0d61a056)

A conversational AI-powered WhatsApp bot for Flash that enables Lightning Network payments through natural language.

## Quick Start

### Prerequisites

- Node.js 20+
- Redis server
- Chrome/Chromium browser
- Flash API access token

### Local Development

```bash
# Clone and setup
git clone https://github.com/lnflash/pulse.git
cd pulse
./scripts/setup-local.sh

# Configure .env file with your API keys
# Start development server
npm run start:dev
```

### Production Deployment

Deploy to Ubuntu VPS (22.04 or 24.04 LTS):

```bash
# Download and run setup script
wget https://raw.githubusercontent.com/lnflash/pulse/main/scripts/setup-ubuntu-vps.sh
chmod +x setup-ubuntu-vps.sh
sudo ./setup-ubuntu-vps.sh

# View logs and QR code
pulse logs

# Management commands
pulse start|stop|restart|status|update|backup
```

## Key Features

### 🤖 Conversational AI Interface

- **Natural Conversations**: Ask questions like "What is Flash?" or "How do I send money?"
- **Smart Onboarding**: Contextual help for new users exploring features
- **No More Command Errors**: Every message gets a helpful response

### 💸 Payment Features

- Send and receive Lightning payments via WhatsApp
- Phone number-based account linking with OTP verification
- Real-time balance checking with currency conversion
- Contact management and payment requests
- Push notifications for received payments
- Anonymous tips and group tip splitting

### 🎙️ Voice & AI

- Voice note support with Speech-to-Text
- Natural language voice responses with ElevenLabs
- AI-powered assistance with Google Gemini
- Voice-only mode for hands-free operation

### 🔧 Technical Capabilities

- Multi-instance WhatsApp support
- Message normalization engine foundation
- Platform-agnostic messaging architecture
- Admin controls for system management

## Architecture

Pulse v4.0.0 is built using **hexagonal architecture** (ports and adapters pattern), providing:

- **Clean Separation**: Domain logic isolated from infrastructure concerns
- **Testability**: Easy to mock interfaces and test components independently
- **Flexibility**: Swap implementations without changing business logic
- **Maintainability**: Clear module boundaries and dependency flow

### Key Architectural Components

- **Ports**: Interface definitions for domain services (WalletPort, SessionPort, etc.)
- **Adapters**: Implementations that connect to external services (Flash API, Redis, etc.)
- **Handlers**: Intent-based command processors with dependency injection
- **Orchestrator**: Central message routing and handler discovery

For detailed architecture documentation, see [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## How to Use Pulse

### Natural Language

Just chat naturally! Try:

- "How are you?"
- "What is Flash?"
- "How do I send money to a friend?"
- "Tell me about Lightning Network"
- "What can you do?"

### Basic Commands

- `link` - Connect your Flash account
- `balance` - Check wallet balance
- `send [amount] to [username/phone]` - Send payment
- `receive [amount]` - Create Lightning invoice
- `help` - Show all commands

### Voice Features

- Send voice notes for hands-free operation
- `voice on/off/only` - Control voice responses
- `voice list` - See available voices

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Documentation

- [Development Guide](docs/DEVELOPMENT.md) - Detailed development setup
- [Architecture](docs/ARCHITECTURE.md) - System design and structure
- [Security](docs/SECURITY.md) - Security implementation details
- [API Documentation](docs/API.md) - API reference
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment

## Support

- Create an issue on [GitHub](https://github.com/lnflash/pulse/issues)
- WhatsApp support: Send "support" to the bot

## License

MIT License - Island Bitcoin LLC
