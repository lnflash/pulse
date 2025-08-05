# Deployment Guide

## Production Deployment

### System Requirements

#### Minimum Specs (Development/Testing)
- CPU: 1 vCPU
- RAM: 2GB
- Storage: 25GB SSD
- OS: Ubuntu 22.04 or 24.04 LTS
- Cost: ~$12/month (DigitalOcean)

#### Recommended Specs (Production)
- CPU: 2-4 vCPUs
- RAM: 4-8GB
- Storage: 80-160GB SSD
- OS: Ubuntu 22.04 or 24.04 LTS
- Cost: $24-48/month (DigitalOcean)

### Quick Deploy

Deploy to Ubuntu VPS with our automated script:

```bash
# Download setup script
wget https://raw.githubusercontent.com/lnflash/pulse/main/scripts/setup-ubuntu-vps.sh

# Make executable
chmod +x setup-ubuntu-vps.sh

# Run setup
sudo ./setup-ubuntu-vps.sh
```

The script will:
- Install all dependencies (Node.js, PM2, Redis, Nginx)
- Configure SSL certificates with Let's Encrypt
- Set up firewall and security
- Create systemd service for auto-start
- Configure automatic backups
- Set up monitoring and alerts

### Post-Installation

1. **Configure Environment Variables**
   ```bash
   cd /opt/pulse
   sudo nano .env
   ```

2. **Required Configuration**
   - `FLASH_API_KEY` - Your Flash API key
   - `ADMIN_PHONE_NUMBERS` - Admin WhatsApp numbers
   - `SUPPORT_PHONE_NUMBER` - Support routing number

3. **Start the Service**
   ```bash
   pulse start
   pulse logs  # View logs and QR code
   ```

4. **Connect WhatsApp**
   - Scan the QR code with WhatsApp
   - Use a dedicated number (not personal)

## Manual Deployment

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx redis-server chromium-browser

# Install PM2
sudo npm install -g pm2

# Create app directory
sudo mkdir -p /opt/pulse
sudo chown $USER:$USER /opt/pulse
```

### 2. Application Setup

```bash
# Clone repository
cd /opt
git clone https://github.com/lnflash/pulse.git
cd pulse

# Install dependencies
npm install

# Build application
npm run build

# Copy environment template
cp .env.example .env
# Edit .env with your configuration
```

### 3. Nginx Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3456;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4. SSL Setup

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com
```

### 5. PM2 Process Management

```bash
# Start application
pm2 start npm --name pulse -- run start:prod

# Save PM2 configuration
pm2 save
pm2 startup
```

## Docker Deployment

⚠️ **WARNING**: Docker is NOT recommended for Pulse due to WhatsApp Web.js browser requirements. Use native PM2 deployment instead.

## Environment Configuration

### Production Environment Variables

```env
# Node Environment
NODE_ENV=production
PORT=3456

# Flash API
FLASH_API_URL=https://api.flashapp.me/graphql
FLASH_API_KEY=your_production_key

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=strong_password

# Security
SESSION_SECRET=random_32_char_string
ENCRYPTION_KEY=random_32_char_string

# Admin
ADMIN_PHONE_NUMBERS=+1234567890
SUPPORT_PHONE_NUMBER=+0987654321

# Optional Services
GEMINI_API_KEY=your_key
ELEVENLABS_API_KEY=your_key
OPENAI_API_KEY=your_key
```

## Monitoring

### Health Checks

```bash
# Check service status
pulse status

# View logs
pulse logs

# Monitor resources
htop
```

### Logging

Logs are stored in:
- Application logs: `/opt/pulse/logs/`
- PM2 logs: `~/.pm2/logs/`
- Nginx logs: `/var/log/nginx/`

### Metrics

Monitor key metrics:
- CPU usage < 80%
- Memory usage < 80%
- Redis memory < 1GB
- Response time < 2s

## Backup and Recovery

### Automated Backups

The setup script configures daily backups:
- WhatsApp session data
- Redis data
- Environment configuration
- Application logs

### Manual Backup

```bash
pulse backup
```

### Restore

```bash
pulse restore backup-2024-01-01.tar.gz
```

## Security Hardening

### Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Fail2ban Setup

```bash
# Install fail2ban
sudo apt install fail2ban

# Configure for SSH protection
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo systemctl restart fail2ban
```

### Security Best Practices

1. Use strong passwords for all services
2. Keep system and dependencies updated
3. Monitor logs for suspicious activity
4. Use SSH keys instead of passwords
5. Configure automatic security updates

## Scaling

### Horizontal Scaling

For high traffic, deploy multiple instances:

1. Use Redis for shared session storage
2. Configure load balancer (Nginx/HAProxy)
3. Ensure WhatsApp sessions are sticky
4. Share Redis between instances

### Vertical Scaling

Upgrade server resources:
```bash
# Resize DigitalOcean droplet
doctl compute droplet-action resize <droplet-id> --size s-4vcpu-8gb
```

## Troubleshooting

### Common Issues

1. **WhatsApp Connection Lost**
   ```bash
   pulse restart
   pulse logs  # Check for new QR code
   ```

2. **High Memory Usage**
   ```bash
   # Clear Redis cache
   redis-cli FLUSHALL
   
   # Restart service
   pulse restart
   ```

3. **SSL Certificate Issues**
   ```bash
   sudo certbot renew
   sudo nginx -s reload
   ```

### Debug Mode

```bash
# Enable debug logging
export DEBUG=pulse:*
pulse restart
```

## Maintenance

### Updates

```bash
# Update application
pulse update

# Update system
sudo apt update && sudo apt upgrade
```

### Performance Tuning

1. **Redis Optimization**
   ```bash
   # Edit Redis config
   sudo nano /etc/redis/redis.conf
   
   # Set maxmemory
   maxmemory 1gb
   maxmemory-policy allkeys-lru
   ```

2. **Node.js Optimization**
   ```bash
   # Increase memory limit
   export NODE_OPTIONS="--max-old-space-size=4096"
   ```

## Support

For deployment issues:
- Check [Troubleshooting Guide](TROUBLESHOOTING.md)
- Open issue on [GitHub](https://github.com/lnflash/pulse/issues)
- Contact support via WhatsApp bot