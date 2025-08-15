# WhatsApp Web QR Code Setup Guide

## Prerequisites
1. Pulse app running (`npm run start` or `pm2 start pulse`)
2. WhatsApp installed on your mobile phone
3. Active internet connection

## Steps to Initialize WhatsApp Web

### Step 1: Start the Application
```bash
# Development
npm run start:dev

# Production
pm2 start pulse
pm2 logs pulse  # Watch for QR code in logs
```

### Step 2: Get the QR Code

#### Option A: Terminal Display (Automatic)
When starting a new WhatsApp instance, the QR code automatically displays in the terminal as ASCII art.

#### Option B: API Endpoint
```bash
# Get QR for all instances
curl http://localhost:3000/whatsapp-web/qr

# Get QR for specific phone number
curl http://localhost:3000/whatsapp-web/instances/YOUR_PHONE_NUMBER/qr
```

Response:
```json
{
  "status": "pending_authentication",
  "phoneNumber": "YOUR_PHONE_NUMBER",
  "qrCode": "2@...",  // Raw QR data
  "qrImageUrl": "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=...",
  "message": "Scan this QR code with WhatsApp"
}
```

#### Option C: Browser
1. Open browser: `http://localhost:3000/whatsapp-web/qr`
2. Click on the `qrImageUrl` to view QR code image

### Step 3: Scan with WhatsApp Mobile

1. **Open WhatsApp** on your phone
2. **Android**: Tap 3 dots menu → **Linked Devices**
   **iPhone**: Go to **Settings** → **Linked Devices**
3. Tap **Link a Device**
4. **Scan the QR code** displayed in terminal or browser

### Step 4: Verify Connection

Check connection status:
```bash
curl http://localhost:3000/whatsapp-web/status
```

Successful response:
```json
{
  "status": "connected",
  "ready": true,
  "instances": [
    {
      "phoneNumber": "YOUR_PHONE_NUMBER",
      "status": "ready",
      "connected": true
    }
  ]
}
```

## Multiple WhatsApp Instances

Pulse supports multiple WhatsApp accounts simultaneously:

1. **Initialize first instance:**
   ```bash
   curl -X POST http://localhost:3000/whatsapp/instances \
     -H "Content-Type: application/json" \
     -d '{"phoneNumber": "PHONE1"}'
   ```

2. **Initialize second instance:**
   ```bash
   curl -X POST http://localhost:3000/whatsapp/instances \
     -H "Content-Type: application/json" \
     -d '{"phoneNumber": "PHONE2"}'
   ```

3. **Get QR codes for each:**
   ```bash
   curl http://localhost:3000/whatsapp-web/instances/PHONE1/qr
   curl http://localhost:3000/whatsapp-web/instances/PHONE2/qr
   ```

## Troubleshooting

### QR Code Not Appearing
1. Check logs: `pm2 logs pulse`
2. Verify Chrome/Chromium installed: `./scripts/diagnose-chrome.sh`
3. Fix permissions: `sudo ./scripts/fix-whatsapp-permissions.sh`

### "Permission Denied" Errors
```bash
# Fix WhatsApp session permissions
sudo ./scripts/fix-whatsapp-permissions.sh

# Clear sessions and restart
sudo rm -rf ./whatsapp-sessions/*
pm2 restart pulse
```

### Session Already Exists
```bash
# Clear specific session
curl -X DELETE http://localhost:3000/whatsapp-web/instances/YOUR_PHONE_NUMBER/session

# Or manually remove
rm -rf ./whatsapp-sessions/YOUR_PHONE_NUMBER
```

### Instance Stuck or Not Responding
```bash
# Restart specific instance
curl -X POST http://localhost:3000/whatsapp-web/instances/YOUR_PHONE_NUMBER/restart

# Or logout and re-scan
curl -X POST http://localhost:3000/whatsapp-web/instances/YOUR_PHONE_NUMBER/logout
```

## Session Persistence

- Sessions are saved in `./whatsapp-sessions/[PHONE_NUMBER]/`
- Sessions persist across app restarts
- No need to re-scan QR after restart (unless logged out from phone)

## Security Notes

1. **Keep QR codes private** - Anyone with the QR can link to your WhatsApp
2. **Sessions directory** should have restricted permissions (755)
3. **Monitor linked devices** in WhatsApp mobile app
4. **Logout when needed**: 
   ```bash
   curl -X POST http://localhost:3000/whatsapp-web/logout
   ```

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/whatsapp-web/status` | GET | Get all instances status |
| `/whatsapp-web/qr` | GET | Get QR codes for all instances |
| `/whatsapp-web/instances/:phone/status` | GET | Get specific instance status |
| `/whatsapp-web/instances/:phone/qr` | GET | Get QR for specific instance |
| `/whatsapp-web/instances/:phone/restart` | POST | Restart instance |
| `/whatsapp-web/instances/:phone/logout` | POST | Logout instance |
| `/whatsapp-web/instances/:phone/session` | DELETE | Clear session |

## Testing Connection

Send a test message:
```bash
curl -X POST http://localhost:3000/whatsapp-web/test-message \
  -H "Content-Type: application/json" \
  -d '{
    "to": "RECIPIENT_PHONE",
    "message": "Hello from Pulse!",
    "instancePhone": "YOUR_PHONE_NUMBER"
  }'
```

## Next Steps

After successful QR scan:
1. Test sending messages
2. Configure auto-reply handlers
3. Set up payment commands
4. Monitor with: `pm2 logs pulse`