#!/bin/bash

# Fix session persistence issues on remote server
# This script ensures encryption keys are properly set to prevent session loss

echo "🔧 Fixing session persistence issues..."

# Check if we're on the remote server
if [ ! -f "/opt/pulse/.env" ]; then
    echo "❌ This script should be run on the remote server at /opt/pulse"
    exit 1
fi

cd /opt/pulse

# Backup current .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Check if encryption keys are set
if ! grep -q "^ENCRYPTION_KEY=" .env; then
    echo "⚠️  ENCRYPTION_KEY not found in .env"
    echo "Adding encryption keys..."
    
    # Add encryption keys if missing
    cat >> .env << 'EOF'

# ============================================
# Encryption Keys (REQUIRED for session persistence)
# ============================================
# These keys MUST remain constant to preserve sessions across restarts
ENCRYPTION_KEY=9169d0e247ef6a3f4f8aede160ffdd4679dcf2c6194cbc65e2962ad178c5d21d
ENCRYPTION_SALT=6e930f2a6278efcb7a0964063d6c594c
HASH_SALT=45a765cbc2fe71f2078dc76ba4afbfa9
EOF
    
    echo "✅ Encryption keys added to .env"
else
    echo "✅ ENCRYPTION_KEY already exists in .env"
    
    # Verify the values match expected ones
    CURRENT_KEY=$(grep "^ENCRYPTION_KEY=" .env | cut -d'=' -f2)
    EXPECTED_KEY="9169d0e247ef6a3f4f8aede160ffdd4679dcf2c6194cbc65e2962ad178c5d21d"
    
    if [ "$CURRENT_KEY" != "$EXPECTED_KEY" ]; then
        echo "⚠️  WARNING: ENCRYPTION_KEY differs from expected value"
        echo "Current: $CURRENT_KEY"
        echo "Expected: $EXPECTED_KEY"
        echo ""
        echo "This may cause existing sessions to become unreadable."
        read -p "Update to expected value? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sed -i "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$EXPECTED_KEY/" .env
            sed -i "s/^ENCRYPTION_SALT=.*/ENCRYPTION_SALT=6e930f2a6278efcb7a0964063d6c594c/" .env
            sed -i "s/^HASH_SALT=.*/HASH_SALT=45a765cbc2fe71f2078dc76ba4afbfa9/" .env
            echo "✅ Encryption keys updated"
        fi
    fi
fi

# Ensure session TTL is set properly (24 hours)
if ! grep -q "^SESSION_EXPIRES_IN=" .env; then
    echo "SESSION_EXPIRES_IN=86400" >> .env
    echo "✅ Session expiry set to 24 hours"
fi

# Ensure ElevenLabs API key is set
if ! grep -q "^ELEVENLABS_API_KEY=" .env; then
    echo "ELEVENLABS_API_KEY=sk_f734a0e2403342ea483631fc1e89ad2ff7c025dfcaeb89b8" >> .env
    echo "✅ ElevenLabs API key added"
else
    # Update if it's the invalid one
    if grep -q "sk_9a1c3ff0ccb2f5c74fb23736a77ff9142ac02ee331070bf8" .env; then
        sed -i "s/sk_9a1c3ff0ccb2f5c74fb23736a77ff9142ac02ee331070bf8/sk_f734a0e2403342ea483631fc1e89ad2ff7c025dfcaeb89b8/" .env
        echo "✅ Updated to working ElevenLabs API key"
    fi
fi

echo ""
echo "🔄 Restarting application..."
pm2 restart flash-whatsapp-dev

echo ""
echo "✅ Session persistence fix applied!"
echo ""
echo "⚠️  IMPORTANT:"
echo "1. Users who were linked before may need to re-link one more time"
echo "2. Future sessions will persist correctly across restarts"
echo "3. Keep encryption keys consistent to avoid session loss"
echo ""
echo "To monitor logs: pulse logs"