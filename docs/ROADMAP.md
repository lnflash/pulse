# Pulse Roadmap

## Mission
Make Lightning payments accessible to everyone through familiar messaging platforms, with deployment as simple as possible across any infrastructure.

## Current Status (v3.0.0) ✅
- WhatsApp Web.js integration with multi-instance support
- Account linking with OTP verification
- Balance checking with multi-currency support
- Smart caching with manual refresh
- ✅ **AI-powered conversational interface via Google Gemini**
- ✅ **Natural language processing for all users (linked and unlinked)**
- ✅ **Message normalization engine foundation**
- ✅ Lightning invoice detection and payment
- ✅ Payment sending via username/phone/contact
- ✅ Transaction history viewing
- ✅ Contact management with vCard support
- ✅ Admin session management with QR delivery
- ✅ Content sharing ("vybz") for earning sats
- ✅ Pending payments for non-Flash users
- ✅ Admin panel for monitoring
- ✅ Production deployment scripts
- ✅ Voice response system with ElevenLabs integration
- ✅ Admin audio controls (replaced voice commands)

## Phase 1: Message Normalization Engine (Completed - v3.0.0) ✅

### v3.0.0 - Conversational AI Foundation
**Goal:** Transform Pulse from command-based bot to natural conversational assistant

#### Completed Features ✅
- [x] **AI-Powered Message Processing**: All unknown messages processed through Gemini AI
- [x] **Natural Language Understanding**: Questions like "What is Flash?" get informative responses
- [x] **Context-Aware Responses**: AI has full knowledge of Flash/Pulse capabilities
- [x] **Smart Onboarding**: Unlinked users get contextual help while exploring
- [x] **Greeting Detection**: Enhanced recognition of casual messages and greetings
- [x] **Multi-Instance WhatsApp**: Support for multiple WhatsApp numbers simultaneously
- [x] **Message Router**: Centralized routing system for all messaging platforms
- [x] **Admin Audio Controls**: Replaced 'admin voice' with 'admin audio' to avoid conflicts

#### Normalization Engine Components
The foundation for the message normalization engine has been established:

1. **Message Router** (`WhatsAppMessageRouter`):
   - Handles incoming messages from any WhatsApp instance
   - Normalizes message format before processing
   - Routes responses back through correct instance

2. **Command Parser** (`CommandParserService`):
   - Natural language pattern matching
   - Intent extraction from user messages
   - Flexible command recognition

3. **AI Integration** (`GeminiAiService`):
   - Processes unstructured text into actionable intents
   - Provides context-aware responses
   - Handles greetings and casual conversation

4. **Instance Manager** (`WhatsAppInstanceManager`):
   - Manages multiple WhatsApp connections
   - Provides abstraction layer for messaging
   - Foundation for multi-platform support

## Phase 2: WhatsApp Business API Migration (Q1 2025)

### v3.1.0 - Business API Foundation
**Goal:** Migrate from WhatsApp Web.js to official Business API for stability and Docker support

#### Migration Requirements
- [ ] WhatsApp Business API integration
- [ ] Cloud API webhook handling
- [ ] Session management refactoring
- [ ] Message template support
- [ ] Media handling updates

## Phase 3: Universal Deployment (Q2 2025)

### v3.2.0 - Docker-First Architecture
**Goal:** One-click deployment on any platform in under 60 seconds

#### Core Infrastructure
- [ ] Unified Docker image with multi-arch support (amd64, arm64)
- [ ] SQLite as default database (zero external dependencies)
- [ ] Environment auto-detection (VPS, Umbrel, Start9, etc.)
- [ ] Built-in SSL with Caddy/Traefik integration
- [ ] Health check and auto-recovery mechanisms

#### Deployment Targets
- [ ] **Docker Hub**: Official `lnflash/pulse` images
- [ ] **One-line installers**:
  - [ ] Universal: `curl -sSL https://pulse.sh | bash`
  - [ ] Docker: `docker run -d lnflash/pulse`
  - [ ] Compose: Single-file docker-compose.yml
- [ ] **Sovereign Platforms**:
  - [ ] Umbrel App Store package
  - [ ] Start9 Embassy package
  - [ ] Citadel app submission
  - [ ] MyNode integration
- [ ] **Cloud Platforms**:
  - [ ] Railway template
  - [ ] Render blueprint
  - [ ] Fly.io launcher
  - [ ] Vercel/Netlify edge functions
  - [ ] Google Cloud Run button
  - [ ] DigitalOcean Marketplace
- [ ] **Package Managers**:
  - [ ] npm: `npx create-pulse-bot`
  - [ ] Homebrew: `brew install pulse`
  - [ ] Snap: `snap install pulse`

#### Configuration Simplification
- [ ] Single required env var: `FLASH_API_KEY`
- [ ] Smart defaults for everything else
- [ ] Web-based configuration wizard
- [ ] QR code config sharing
- [ ] Auto-discovery of services

## Phase 4: Complete Messaging Abstraction (Q2-Q3 2025)

### v3.3.0 - Platform-Agnostic Architecture
**Goal:** Support any messaging platform with minimal code changes

#### Architecture Refactoring
- [ ] Create `src/modules/messaging/` module
- [ ] Define `MessagingPlatform` interface:
  ```typescript
  interface MessagingPlatform {
    sendMessage(to: string, message: string): Promise<void>
    sendMedia(to: string, media: MediaMessage): Promise<void>
    parseIncomingMessage(payload: any): IncomingMessage
    getConnectionStatus(): ConnectionStatus
    connect(): Promise<void>
    disconnect(): Promise<void>
  }
  ```
- [ ] Create `IncomingMessage` and `OutgoingMessage` DTOs
- [ ] Implement `WhatsAppMessagingService` with current logic
- [ ] Refactor all services to use abstraction
- [ ] Dependency injection with platform tokens

#### Platform Implementations
- [ ] **WhatsApp** (current, enhanced):
  - [ ] WhatsApp Web.js (existing)
  - [ ] WhatsApp Business API
  - [ ] WhatsApp Cloud API
- [ ] **Discord**:
  - [ ] Bot API integration
  - [ ] Slash commands support
  - [ ] Server/DM management
  - [ ] Rich embeds for payments
- [ ] **Telegram**:
  - [ ] Bot API integration
  - [ ] Inline keyboards for commands
  - [ ] Group management
- [ ] **Signal**:
  - [ ] Signal CLI integration
  - [ ] End-to-end encryption maintained
- [ ] **SMS**:
  - [ ] Twilio integration
  - [ ] Fallback for non-smartphone users
- [ ] **Nostr**:
  - [ ] NIP-04 encrypted DMs
  - [ ] Lightning address integration

## Phase 5: Enhanced Features (Q3-Q4 2025)

### v3.4.0 - Rich Media & Interactions
- [ ] Voice message transcription and commands
- [ ] Image-based invoice scanning
- [ ] Video content sharing
- [ ] Interactive payment buttons
- [ ] Rich payment receipts with charts

### v3.5.0 - Advanced Payment Features
- [ ] Scheduled payments
- [ ] Recurring payments/subscriptions
- [ ] Payment splitting for groups
- [ ] Multi-signature payment approval
- [ ] Payment request expiration

### v3.6.0 - AI Enhancement
- [ ] Multi-provider AI support (OpenAI, Anthropic, local LLMs)
- [ ] Context-aware responses
- [ ] Financial insights and analytics
- [ ] Spending pattern analysis
- [ ] Natural language payment commands

## Phase 6: Enterprise & Scale (Q4 2025 - Q1 2026)

### v4.0.0 - Business Tools
- [ ] Merchant dashboard
- [ ] Point-of-sale integration
- [ ] Invoice generation and tracking
- [ ] Payment links and QR codes
- [ ] Customer analytics
- [ ] Multi-user business accounts

### v4.1.0 - Scale & Performance
- [ ] Horizontal scaling with Kubernetes
- [ ] Message queue integration (RabbitMQ/Kafka)
- [ ] Caching layer (Redis Cluster)
- [ ] Load balancing across instances
- [ ] Geographic distribution

### v4.2.0 - Compliance & Security
- [ ] SOC 2 compliance
- [ ] GDPR compliance tools
- [ ] Audit logging
- [ ] Role-based access control
- [ ] End-to-end encryption for all platforms
- [ ] Hardware security module (HSM) support

## Phase 7: Bitcoin Ecosystem Integration (2026)

### v5.0.0 - On-chain & eCash Support
- [ ] On-chain Bitcoin support
  - [ ] UTXO management
  - [ ] Fee estimation
  - [ ] Batch transactions
  - [ ] Hardware wallet integration
- [ ] **Cashu Integration**:
  - [ ] Mint discovery
  - [ ] Token management
  - [ ] Offline transactions
  - [ ] Privacy-preserving payments
- [ ] **Fedimint Support**:
  - [ ] Federation discovery
  - [ ] Guardian communication
  - [ ] Multi-sig coordination
  - [ ] Community wallet features

### v5.1.0 - Plugin System
- [ ] Plugin marketplace
- [ ] Developer SDK
- [ ] Custom command creation
- [ ] Third-party integrations
- [ ] Revenue sharing for developers

## Implementation Priorities

### Recently Completed ✅
1. **Message Normalization Engine Foundation** (v3.0.0)
   - AI-powered conversational interface
   - Natural language processing for all users
   - Multi-instance WhatsApp support
   - Admin audio controls

### Immediate (Next 30 days)
1. Begin WhatsApp Business API migration planning
2. Research Business API requirements and costs
3. Create migration strategy document
4. Set up Business API test environment
5. Extend normalization engine for intent classification

### Short-term (Next 90 days)
1. Complete WhatsApp Business API migration
2. Create Docker Hub organization and CI/CD pipeline
3. Complete messaging abstraction layer
4. Add Discord support as proof of concept
5. Implement structured intent extraction from AI responses

### Medium-term (Next 180 days)
1. Docker deployment infrastructure
2. Create Umbrel and Start9 packages
3. Discord and Telegram integration completion
4. Voice message transcription and commands
5. Full normalization engine with multi-platform support

## Success Metrics

### Deployment Success
- Time to first message: < 5 minutes
- Platforms supported: > 10
- One-click install success rate: > 95%

### User Adoption
- Monthly active users: 10,000 by end of 2025
- Messages processed: 1M+ per month
- Payment volume: $100K+ per month

### Developer Ecosystem
- Third-party plugins: 50+
- Contributors: 100+
- Forks/implementations: 20+

## Technical Debt & Maintenance

### Ongoing
- Security audits quarterly
- Dependency updates monthly
- Performance optimization
- Documentation updates
- Community support

### Future Considerations
- WebAssembly for client-side deployment
- Decentralized message routing
- Peer-to-peer payment channels
- AI model fine-tuning
- Quantum-resistant cryptography

## Community & Governance

### Open Source Commitment
- MIT License maintained
- Public roadmap and planning
- Community feature requests
- Transparent development process

### Contribution Guidelines
- Clear contribution documentation
- Mentorship program
- Bug bounty program
- Regular community calls

## Feature Requests & Feedback
- GitHub Issues: https://github.com/lnflash/pulse/issues
- Telegram Group: https://t.me/pulsedevs
- Email: feedback@pulse.sh

---

*This roadmap is a living document and will be updated based on community feedback and market needs.*