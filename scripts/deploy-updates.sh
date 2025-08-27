#!/bin/bash

# Deployment script for Pulse updates
# Run this on the remote server to update and rebuild

set -e  # Exit on error

echo "🚀 Starting Pulse deployment..."
echo "================================"

# Check if we're on the remote server
if [ ! -d "/opt/pulse" ]; then
    echo "❌ Error: /opt/pulse not found. Are you on the remote server?"
    exit 1
fi

cd /opt/pulse

# Step 1: Backup current .env
echo "📦 Backing up configuration..."
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Step 2: Save current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "📌 Current branch: $CURRENT_BRANCH"

# Step 3: Stash any local changes
echo "💾 Stashing local changes..."
git stash || true

# Step 4: Pull latest changes
echo "🔄 Pulling latest changes from git..."
git pull origin $CURRENT_BRANCH

# Step 5: Install dependencies
echo "📦 Installing dependencies..."
npm install

# Step 6: Build the application
echo "🔨 Building application..."
npm run build

# Step 7: Apply session persistence fix
echo "🔧 Checking session persistence..."
if ! grep -q "^ENCRYPTION_KEY=" .env; then
    echo "Adding encryption keys for session persistence..."
    cat >> .env << 'EOF'

# ============================================
# Encryption Keys (REQUIRED for session persistence)
# ============================================
ENCRYPTION_KEY=9169d0e247ef6a3f4f8aede160ffdd4679dcf2c6194cbc65e2962ad178c5d21d
ENCRYPTION_SALT=6e930f2a6278efcb7a0964063d6c594c
HASH_SALT=45a765cbc2fe71f2078dc76ba4afbfa9
EOF
fi

# Step 8: Ensure ElevenLabs API key is valid
echo "🔊 Checking ElevenLabs API key..."
if grep -q "sk_9a1c3ff0ccb2f5c74fb23736a77ff9142ac02ee331070bf8" .env; then
    echo "Updating to working ElevenLabs API key..."
    sed -i "s/sk_9a1c3ff0ccb2f5c74fb23736a77ff9142ac02ee331070bf8/sk_f734a0e2403342ea483631fc1e89ad2ff7c025dfcaeb89b8/" .env
fi

# Step 9: Set up health monitoring script
echo "🏥 Setting up health monitoring..."
if [ -f "scripts/monitor-health.sh" ]; then
    chmod +x scripts/monitor-health.sh
    echo "Health monitoring script ready"
    
    # Optional: Install as systemd service
    if [ -f "scripts/pulse-monitor.service" ] && [ "$1" == "--with-monitor" ]; then
        echo "Installing monitoring service..."
        sudo cp scripts/pulse-monitor.service /etc/systemd/system/
        sudo systemctl daemon-reload
        sudo systemctl enable pulse-monitor
        sudo systemctl start pulse-monitor
        echo "✅ Monitoring service installed and started"
    fi
fi

# Step 10: Restart PM2 application
echo "🔄 Restarting application..."
pm2 restart flash-whatsapp-dev

# Step 11: Save PM2 configuration
echo "💾 Saving PM2 configuration..."
pm2 save

# Step 12: Wait for application to start
echo "⏳ Waiting for application to start..."
sleep 10

# Step 13: Check application status
echo "🔍 Checking application status..."
pm2 status flash-whatsapp-dev

# Step 14: Test health endpoint
echo "🏥 Testing health endpoint..."
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/health" | grep -q "200"; then
    echo "✅ Health check passed"
else
    echo "⚠️  Health check failed - check logs with: pulse logs"
fi

# Step 15: Check WhatsApp status
echo "📱 Checking WhatsApp status..."
curl -s "http://localhost:3000/whatsapp-web/status" | python3 -m json.tool | head -20 || true

echo ""
echo "================================"
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Check logs: pulse logs"
echo "2. Check WhatsApp QR: curl http://localhost:3000/whatsapp-web/qr"
echo "3. Monitor health: watch 'curl -s http://localhost:3000/whatsapp-web/status | python3 -m json.tool'"
echo ""
echo "💡 Tips:"
echo "- To enable 24/7 monitoring, run: $0 --with-monitor"
echo "- To force restart WhatsApp: curl -X POST http://localhost:3000/whatsapp-web/restart"
echo "- View monitor logs: sudo journalctl -u pulse-monitor -f"
echo ""