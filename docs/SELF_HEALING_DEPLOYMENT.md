# Self-Healing WhatsApp Connection Deployment Guide

## Overview
This update implements comprehensive self-healing mechanisms to ensure WhatsApp stays connected and automatically recovers from failures.

## Features
- **Automatic Reconnection**: Detects disconnections and attempts to reconnect
- **Health Monitoring**: Continuous health checks every minute
- **Deep Health Checks**: Thorough connection verification every 5 minutes
- **Idle Detection**: Restarts instances idle for >30 minutes
- **Emergency Recovery**: Full restart after 3 consecutive failures
- **Activity Tracking**: Monitors all message activity for health metrics

## Deployment Steps

### 1. Update Code on Remote Server
```bash
cd /opt/pulse
git pull
npm install
npm run build
```

### 2. Apply Session Persistence Fix (if not done already)
```bash
chmod +x /tmp/fix-session-persistence.sh
sudo /tmp/fix-session-persistence.sh
```

### 3. Deploy Health Monitoring Script
```bash
# Copy monitoring script
cp scripts/monitor-health.sh /opt/pulse/scripts/
chmod +x /opt/pulse/scripts/monitor-health.sh

# Install as systemd service (optional)
sudo cp scripts/pulse-monitor.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable pulse-monitor
sudo systemctl start pulse-monitor
```

### 4. Restart Application
```bash
pm2 restart flash-whatsapp-dev
pm2 save
```

## Monitoring

### Check Health Status
```bash
# Application health
curl http://localhost:3000/health

# WhatsApp status
curl http://localhost:3000/whatsapp-web/status

# View logs
pulse logs --lines 100

# Monitor service logs
sudo journalctl -u pulse-monitor -f
```

### Manual Recovery Options
```bash
# Restart WhatsApp instances via API
curl -X POST http://localhost:3000/whatsapp-web/restart

# Restart application
pm2 restart flash-whatsapp-dev

# Check monitoring service
sudo systemctl status pulse-monitor
```

## Configuration

### Environment Variables
Add to `.env` if needed:
```env
# Health monitoring intervals (milliseconds)
HEALTH_CHECK_INTERVAL=60000      # 1 minute
DEEP_CHECK_INTERVAL=300000       # 5 minutes
MAX_IDLE_MINUTES=30               # Max idle before restart
MAX_CONSECUTIVE_FAILURES=3        # Failures before emergency recovery
```

## How It Works

### 1. Health Monitoring Flow
```
Every 1 minute:
├── Check instance status
├── Verify authentication
├── Update activity timestamps
└── Track consecutive failures

Every 5 minutes:
├── Deep connection verification
├── Test WhatsApp client state
├── Check idle instances
└── Restart if necessary
```

### 2. Auto-Recovery Process
```
Disconnection detected:
├── Wait 5 seconds for auto-reconnect
├── If still disconnected:
│   ├── Attempt graceful restart
│   ├── Wait 10 seconds
│   └── Verify reconnection
└── Log recovery status
```

### 3. Emergency Recovery
```
After 3 consecutive failures:
├── Restart all instances
├── Reset failure counters
├── Emit recovery event
└── If fails: Schedule app restart
```

## Troubleshooting

### Common Issues

#### WhatsApp Not Reconnecting
```bash
# Check instance status
curl http://localhost:3000/whatsapp-web/status

# Force restart
curl -X POST http://localhost:3000/whatsapp-web/restart

# Check Chrome processes
ps aux | grep chrome
```

#### High CPU Usage
```bash
# Check for zombie Chrome processes
pkill -f chrome
pm2 restart flash-whatsapp-dev
```

#### Session Lost
```bash
# Run session fix script
/tmp/fix-session-persistence.sh

# Clear and rescan QR
curl -X DELETE http://localhost:3000/whatsapp-web/instances/254700264922/session
curl http://localhost:3000/whatsapp-web/qr
```

## Logs and Debugging

### Application Logs
```bash
# PM2 logs
pulse logs

# Specific error logs
pm2 logs flash-whatsapp-dev --err

# Health monitor logs
tail -f /var/log/pulse-health-monitor.log
```

### Debug Health Service
```bash
# Enable debug logging
export DEBUG=pulse:health
pm2 restart flash-whatsapp-dev
```

## Performance Impact
- **CPU**: Minimal (<1% for health checks)
- **Memory**: ~10MB for health service
- **Network**: 1 health check/minute per instance
- **Disk**: Logs rotation recommended

## Security Notes
- Health endpoints are not authenticated (localhost only)
- Consider firewall rules for production
- Monitor logs for suspicious restart patterns

## Maintenance

### Weekly Tasks
- Review health monitor logs
- Check for failed recovery attempts
- Clear old Chrome session data if needed

### Monthly Tasks
- Analyze restart patterns
- Optimize idle timeout settings
- Update Chrome/Puppeteer if needed

## Support
For issues with self-healing:
1. Check health monitor logs
2. Verify environment variables
3. Test manual restart endpoint
4. Review Chrome process status

The system should now maintain stable WhatsApp connections with automatic recovery from most failure scenarios.