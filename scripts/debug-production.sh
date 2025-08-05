#!/bin/bash

echo "🔍 Debugging Pulse production issue..."

# Commands to run on production server:
cat << 'EOF'

# 1. Stop PM2 to see raw output
pm2 stop pulse

# 2. Check for more error details in the log
tail -n 100 /opt/pulse/logs/pm2-error-0.log | grep -B 20 "Nest can't resolve dependencies"

# 3. Try running directly to see full error
cd /opt/pulse
node dist/main.js

# If that doesn't show the error, try:
# 4. Run with debug logging
NODE_ENV=production nest start

# 5. Check if all environment variables are set
cat .env | grep -E "(REDIS|JWT_SECRET|FLASH_API_URL)"

# 6. Verify the build files exist
ls -la dist/modules/auth/services/
ls -la dist/modules/whatsapp/services/

EOF