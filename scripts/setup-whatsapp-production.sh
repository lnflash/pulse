#!/bin/bash

# Setup WhatsApp for production
echo "🚀 WhatsApp Production Setup"
echo "============================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get phone number
if [ -z "$1" ]; then
    echo -e "${YELLOW}Enter your WhatsApp phone number (international format, no +):${NC}"
    echo "Example: 254700000000"
    read -p "Phone number: " PHONE_NUMBER
else
    PHONE_NUMBER=$1
fi

if [ -z "$PHONE_NUMBER" ]; then
    echo -e "${RED}Phone number is required!${NC}"
    exit 1
fi

echo ""
echo "Setting up WhatsApp for: $PHONE_NUMBER"
echo ""

# Step 1: Check if .env exists
ENV_FILE="/opt/pulse/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    cp /opt/pulse/.env.example "$ENV_FILE" 2>/dev/null || touch "$ENV_FILE"
fi

# Step 2: Update .env with WhatsApp configuration
echo -e "${GREEN}Updating WhatsApp configuration...${NC}"

# Check if WHATSAPP_INSTANCES exists in .env
if grep -q "WHATSAPP_INSTANCES" "$ENV_FILE"; then
    echo "Updating existing WHATSAPP_INSTANCES..."
    # Comment out old line and add new one
    sed -i "s/^WHATSAPP_INSTANCES=/#WHATSAPP_INSTANCES=/g" "$ENV_FILE"
fi

# Check if WHATSAPP_DEFAULT_PHONE exists
if grep -q "WHATSAPP_DEFAULT_PHONE" "$ENV_FILE"; then
    echo "Updating existing WHATSAPP_DEFAULT_PHONE..."
    sed -i "s/^WHATSAPP_DEFAULT_PHONE=/#WHATSAPP_DEFAULT_PHONE=/g" "$ENV_FILE"
fi

# Check if DISABLE_WHATSAPP_WEB exists and remove it
if grep -q "DISABLE_WHATSAPP_WEB=true" "$ENV_FILE"; then
    echo "Removing DISABLE_WHATSAPP_WEB=true..."
    sed -i "s/^DISABLE_WHATSAPP_WEB=true/#DISABLE_WHATSAPP_WEB=true/g" "$ENV_FILE"
fi

# Add new configuration (using simpler format)
echo "" >> "$ENV_FILE"
echo "# WhatsApp Configuration (added by setup script)" >> "$ENV_FILE"
echo "WHATSAPP_DEFAULT_PHONE=$PHONE_NUMBER" >> "$ENV_FILE"
echo "# Alternative: Use JSON format for multiple instances" >> "$ENV_FILE"
echo "# WHATSAPP_INSTANCES='[{\"phoneNumber\":\"$PHONE_NUMBER\",\"enabled\":true}]'" >> "$ENV_FILE"

echo -e "${GREEN}✅ Configuration updated${NC}"
echo ""

# Step 3: Create session directory with proper permissions
echo -e "${GREEN}Creating session directory...${NC}"
SESSION_DIR="/opt/pulse/whatsapp-sessions/$PHONE_NUMBER"
mkdir -p "$SESSION_DIR/chrome-profile"
chmod -R 755 "$SESSION_DIR"

# Get the user running PM2
PM2_USER=$(ps aux | grep "pm2" | grep -v grep | head -1 | awk '{print $1}')
if [ -n "$PM2_USER" ]; then
    chown -R "$PM2_USER:$PM2_USER" "/opt/pulse/whatsapp-sessions"
    echo -e "${GREEN}✅ Permissions set for user: $PM2_USER${NC}"
fi
echo ""

# Step 4: Install Chrome if not present
echo -e "${GREEN}Checking Chrome installation...${NC}"
if ! command -v google-chrome &> /dev/null && ! command -v chromium-browser &> /dev/null; then
    echo -e "${YELLOW}Chrome not found. Installing...${NC}"
    
    # Detect OS
    if [ -f /etc/debian_version ]; then
        # Debian/Ubuntu
        wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - 2>/dev/null
        sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
        apt-get update
        apt-get install -y google-chrome-stable
    elif [ -f /etc/redhat-release ]; then
        # RHEL/CentOS
        wget https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm
        yum install -y google-chrome-stable_current_x86_64.rpm
        rm google-chrome-stable_current_x86_64.rpm
    fi
    
    echo -e "${GREEN}✅ Chrome installed${NC}"
else
    echo -e "${GREEN}✅ Chrome is already installed${NC}"
fi
echo ""

# Step 5: Restart PM2 application
echo -e "${GREEN}Restarting application...${NC}"
cd /opt/pulse

# First, try pm2
if command -v pm2 &> /dev/null; then
    pm2 restart pulse
    echo -e "${GREEN}✅ Application restarted with PM2${NC}"
    echo ""
    
    # Wait for app to start
    echo -e "${YELLOW}Waiting for application to start...${NC}"
    sleep 5
    
    # Show logs
    echo -e "${GREEN}Recent logs:${NC}"
    pm2 logs pulse --lines 20 --nostream
    
else
    # Try systemctl
    if systemctl status pulse &> /dev/null; then
        systemctl restart pulse
        echo -e "${GREEN}✅ Application restarted with systemctl${NC}"
    else
        echo -e "${RED}Could not restart application. Please restart manually.${NC}"
    fi
fi
echo ""

# Step 6: Check status
echo -e "${GREEN}Checking WhatsApp status...${NC}"
sleep 3

STATUS=$(curl -s "http://localhost:3000/whatsapp-web/status" 2>/dev/null)
if echo "$STATUS" | grep -q "404"; then
    echo -e "${RED}❌ WhatsApp endpoints not available yet${NC}"
    echo "The application might still be starting. Wait a moment and try:"
    echo "curl http://localhost:3000/whatsapp-web/status"
else
    echo "$STATUS" | jq . 2>/dev/null || echo "$STATUS"
    echo ""
    echo -e "${GREEN}✅ WhatsApp service is running${NC}"
fi
echo ""

# Step 7: Get QR Code
echo -e "${YELLOW}To get QR code for scanning:${NC}"
echo "1. Wait for app to fully start (30 seconds)"
echo "2. Run: curl http://localhost:3000/whatsapp-web/instances/$PHONE_NUMBER/qr"
echo "3. Or check logs: pm2 logs pulse"
echo ""

echo "============================"
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Get QR code: ./scripts/init-whatsapp.sh $PHONE_NUMBER"
echo "2. Monitor logs: pm2 logs pulse"
echo "3. Check status: curl http://localhost:3000/whatsapp-web/status"
echo ""

# Final check - try to get QR
echo -e "${YELLOW}Attempting to get QR code...${NC}"
sleep 5
curl -s "http://localhost:3000/whatsapp-web/instances/$PHONE_NUMBER/qr" | jq . 2>/dev/null || echo "QR endpoint not ready yet. Try again in a few seconds."