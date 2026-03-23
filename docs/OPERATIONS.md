# Pulse Operations Guide

How to install and operate Pulse on a DigitalOcean droplet.

**Current production**: `pulse.flashapp.me` — Ubuntu 24.04, Node 20, PM2, Nginx, Redis, RabbitMQ.

---

## What Pulse Is

Pulse is a platform-agnostic conversational bot for [Flash](https://flashapp.me) that enables Lightning Network payments through natural language. Users interact with Pulse over **WhatsApp** or **Telegram** — the core logic is the same regardless of platform.

Under the hood it's a NestJS application using hexagonal architecture. Messaging platforms are adapters that plug into a canonical message model. All business logic (payments, account linking, AI responses, voice, plugins) is platform-independent. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.

**Key capabilities:**

- Lightning payments (send, receive, balance, invoices) via Flash API
- Account linking with OTP verification
- Conversational AI responses (Google Gemini)
- Voice messages (Speech-to-Text via Google Cloud / Whisper, TTS via ElevenLabs / Google Cloud)
- Plugins: trivia games, daily challenges, group polls, anonymous messaging, language translation, entertainment
- Admin dashboard and WhatsApp admin commands
- Nostr integration for content sharing

---

## Fresh Install

### 1. Create Droplet

- **Image**: Ubuntu 24.04 LTS
- **Plan**: Regular, 2 vCPU / 4 GB RAM / 80 GB SSD ($24/mo) — minimum for production
- **Region**: Whatever's closest to your users
- **Auth**: SSH keys (no password auth)

Point your domain's DNS A record to the droplet IP before proceeding.

### 2. Run Setup Script

SSH in as root:

```bash
wget https://raw.githubusercontent.com/lnflash/pulse/main/scripts/setup-ubuntu-vps.sh
chmod +x setup-ubuntu-vps.sh
./setup-ubuntu-vps.sh
```

The script is interactive. It will ask for:

- **Domain name** (e.g. `pulse.flashapp.me`)
- **SSL email** — for Let's Encrypt certificate
- **Flash API key** — required for payments, can add later
- **Admin phone numbers** — comma-separated, no `+` prefix (e.g. `13059244435,18764250250`)
- **Optional keys** — Gemini, Nostr, Google Cloud TTS

The script installs: Node.js 20, PM2, Google Chrome (for WhatsApp Web.js), Redis, RabbitMQ, Nginx with SSL, fail2ban, and automated backups.

### 3. Connect Messaging Platforms

Pulse supports multiple platforms simultaneously. Enable whichever you need.

#### WhatsApp

WhatsApp Web.js runs a headless Chrome instance that connects via QR code pairing.

```bash
pulse logs
```

Open WhatsApp on the phone you want to connect > Settings > Linked Devices > Link a Device > scan the QR code from the logs.

Use a dedicated phone number — **not** a personal one. WhatsApp may flag automation on personal accounts.

#### Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather) on Telegram (`/newbot`)
2. Copy the bot token
3. Add to `/opt/pulse/.env`:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   ```
4. Restart: `pm2 restart pulse-production`

The bot starts polling automatically when the token is present. No webhook configuration needed.

#### Adding Future Platforms

The platform layer is designed for extension. The `IMessagePlatform` interface (in `src/modules/messaging/abstractions/`) and the `Platform` enum (in `src/core/types/platform.ts`) define what a platform adapter must implement. Currently `WhatsAppCloud` and `Telegram` are the supported values.

### 4. Verify

```bash
pulse status                   # PM2 process should be "online"
curl localhost:3000/health     # Should return OK
```

Send a message on any connected platform — you should get a response.

---

## Daily Operations

### Management Commands

```bash
pulse start       # Start the bot
pulse stop        # Stop the bot
pulse restart     # Restart the bot
pulse status      # PM2 process status
pulse logs        # Tail logs (Ctrl+C to exit)
pulse logs --lines 200   # Show more history
pulse monitor     # Interactive PM2 monitor (CPU/mem)
pulse update      # Pull latest code, rebuild, restart
pulse backup      # Manual backup
```

### Checking Logs

PM2 logs:

```bash
# Combined (stdout + stderr)
pm2 logs pulse-production --lines 100 --nostream

# Errors only
pm2 logs pulse-production --err --lines 50 --nostream

# Live tail
pm2 logs pulse-production
```

Log files on disk:

```
~/.pm2/logs/pulse-production-out.log    # stdout
~/.pm2/logs/pulse-production-error.log  # stderr
/var/log/nginx/pulse_access.log         # Nginx access
/var/log/nginx/pulse_error.log          # Nginx errors
```

### Service Status

```bash
pm2 status                        # Pulse process
systemctl status redis-server     # Redis
systemctl status rabbitmq-server  # RabbitMQ
systemctl status nginx            # Nginx
```

---

## Updating Pulse

```bash
cd /opt/pulse
git pull origin main
npm install
npm run build
pm2 restart pulse-production
```

Or use the shortcut: `pulse update`

---

## Environment Configuration

The `.env` file lives at `/opt/pulse/.env`. After editing, restart: `pm2 restart pulse-production`

### Core (Required)

| Variable              | Description                                       |
| --------------------- | ------------------------------------------------- |
| `NODE_ENV`            | `production`                                      |
| `PORT`                | `3000` (Nginx proxies to this)                    |
| `FLASH_API_URL`       | `https://api.flashapp.me/graphql`                 |
| `FLASH_API_KEY`       | Flash API key — required for all payment features |
| `REDIS_HOST`          | `localhost`                                       |
| `REDIS_PORT`          | `6379`                                            |
| `REDIS_PASSWORD`      | Generated during setup                            |
| `RABBITMQ_URL`        | `amqp://pulse:<password>@localhost:5672`          |
| `ADMIN_PHONE_NUMBERS` | Comma-separated, no `+` prefix                    |

### Messaging Platforms

| Variable             | Description                                               |
| -------------------- | --------------------------------------------------------- |
| `WHATSAPP_INSTANCES` | Comma-separated phone numbers for multi-instance WhatsApp |
| `TELEGRAM_BOT_TOKEN` | Telegraf bot token — enables the Telegram platform        |

### AI & Voice (Optional)

| Variable               | Description                                        |
| ---------------------- | -------------------------------------------------- |
| `GEMINI_API_KEY`       | Google Gemini — conversational AI responses        |
| `OPENAI_API_KEY`       | OpenAI Whisper — speech-to-text for voice messages |
| `ELEVENLABS_API_KEY`   | ElevenLabs — ultra-realistic voice synthesis       |
| `GOOGLE_CLOUD_KEYFILE` | Path to GCP service account JSON — TTS and STT     |

### Integrations (Optional)

| Variable               | Description                                           |
| ---------------------- | ----------------------------------------------------- |
| `NOSTR_PRIVATE_KEY`    | Nostr nsec — enables content sharing / zap forwarding |
| `NOSTR_RELAYS`         | Comma-separated relay WSS URLs                        |
| `SUPPORT_PHONE_NUMBER` | Routes user support requests to this number           |

### Security (Generated during setup)

| Variable          | Description                 |
| ----------------- | --------------------------- |
| `JWT_SECRET`      | JWT signing key             |
| `ENCRYPTION_KEY`  | Session encryption key      |
| `ENCRYPTION_SALT` | Encryption salt             |
| `SESSION_SECRET`  | Session secret              |
| `WEBHOOK_SECRET`  | Webhook verification secret |

---

## Infrastructure Details

### Nginx

Config: `/etc/nginx/sites-enabled/pulse`

- Proxies HTTPS to `localhost:3000`
- Rate limiting: 10 req/s per IP, burst 20
- WebSocket support at `/socket.io`
- SSL via Let's Encrypt (auto-renews via certbot cron)
- Security headers (X-Frame-Options, X-Content-Type-Options, etc.)

Test config changes:

```bash
nginx -t && systemctl reload nginx
```

### Redis

Config: `/etc/redis/redis.conf`

- Bound to `127.0.0.1`, password-protected
- Used for session management, identity mapping, and caching
- Memory limit: 256 MB with LRU eviction

```bash
redis-cli -a <password> INFO memory    # Check memory usage
redis-cli -a <password> DBSIZE         # Key count
```

### RabbitMQ

Used for event messaging between services. The production config supports both monolith mode (in-process transport) and multi-process mode (RabbitMQ transport).

Management UI: `http://<server-ip>:15672` (username: `pulse`, password in `.env`)

### SSL Certificates

Managed by Certbot. Auto-renewal is configured via cron at `/etc/cron.d/pulse`.

Manual renewal:

```bash
certbot renew
systemctl reload nginx
```

### Firewall (UFW)

Open ports: 22 (SSH), 80 (HTTP), 443 (HTTPS). That's it.

```bash
ufw status    # Verify
```

### Backups

Automated daily at 3 AM. Backs up:

- WhatsApp session data (`/opt/pulse/whatsapp-sessions/`)
- `.env` configuration
- Redis dump

Stored in `/opt/pulse/backups/`, last 7 retained.

---

## Troubleshooting

### WhatsApp Disconnected

The most common issue. WhatsApp Web sessions expire or get disconnected periodically.

```bash
pm2 restart pulse-production
pm2 logs pulse-production    # Watch for new QR code
```

If no QR code appears and it keeps restarting, clear the session:

```bash
rm -rf /opt/pulse/whatsapp-sessions/*
pm2 restart pulse-production
pm2 logs pulse-production    # Scan new QR code
```

### Telegram Bot Not Responding

Check that `TELEGRAM_BOT_TOKEN` is set in `.env` and the token is valid. Look for Telegraf startup messages in logs:

```bash
pm2 logs pulse-production --lines 50 --nostream | grep -i telegram
```

If the bot was responding before and stopped, restart:

```bash
pm2 restart pulse-production
```

### High Restart Count

Check `pm2 status` — the restart counter accumulates over time. High restarts can mean:

- WhatsApp disconnections triggering restarts
- Memory limit exceeded (max 1 GB)
- Unhandled exceptions

Check error logs:

```bash
pm2 logs pulse-production --err --lines 50 --nostream
```

### Redis Connection Issues

```bash
systemctl status redis-server
redis-cli -a <password> ping    # Should return PONG
```

If Redis is down:

```bash
systemctl restart redis-server
pm2 restart pulse-production
```

### Nginx 502 Bad Gateway

Pulse isn't running or isn't listening on port 3000.

```bash
pm2 status                     # Is pulse online?
curl localhost:3000/health     # Is the app responding?
pm2 restart pulse-production   # Restart if needed
```

### Out of Disk Space

```bash
df -h /
# Clean up old logs
find /opt/pulse/logs -name "*.log" -mtime +7 -delete
pm2 flush    # Clear PM2 log files
```

---

## Admin Controls

### WhatsApp Admin Commands

Admins (numbers listed in `ADMIN_PHONE_NUMBERS`) can send these via WhatsApp:

| Command               | Effect                                            |
| --------------------- | ------------------------------------------------- |
| `admin status`        | Connection status for all platforms               |
| `admin disconnect`    | Disconnect current WhatsApp session               |
| `admin reconnect`     | Generate new QR code (sent as image via WhatsApp) |
| `admin clear-session` | Full WhatsApp session reset                       |

### Admin HTTP API

Pulse exposes admin endpoints at `/admin/` (JWT-protected):

| Endpoint                | Method | Description                |
| ----------------------- | ------ | -------------------------- |
| `/admin/auth/login`     | POST   | Admin login                |
| `/admin/auth/verify`    | POST   | Verify OTP                 |
| `/admin/auth/refresh`   | POST   | Refresh JWT token          |
| `/admin/status`         | GET    | System status              |
| `/admin/users/:userId`  | GET    | User details               |
| `/admin/stats`          | GET    | Usage statistics           |
| `/admin/broadcast`      | POST   | Broadcast message to users |
| `/admin/features`       | GET    | Feature flag list          |
| `/admin/features/:name` | PUT    | Toggle feature flag        |

---

## Architecture Overview

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.

Pulse uses hexagonal architecture (ports and adapters). The key insight is that **all business logic is platform-agnostic**:

```
Users (WhatsApp, Telegram, ...)
        ↓
Platform Adapters (translate to canonical messages)
        ↓
Message Orchestrator (NLP → intent detection → handler routing)
        ↓
Handlers (inject port interfaces, not platform specifics)
        ↓
Adapters (Flash API, Redis, AI services, voice services)
```

The app runs as a single process (`fork` mode in PM2). WhatsApp Web.js launches a headless Chrome instance. Telegram uses Telegraf in long-polling mode. Both feed into the same orchestrator and handler pipeline.
