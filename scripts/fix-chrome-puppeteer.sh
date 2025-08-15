#!/bin/bash

echo "🔧 Fixing Chrome/Puppeteer for WhatsApp Web"
echo "==========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Step 1: Check current Chrome installation
echo -e "${YELLOW}Step 1: Checking Chrome installation...${NC}"
CHROME_PATH=""

if command -v google-chrome &> /dev/null; then
    CHROME_PATH=$(which google-chrome)
    echo -e "${GREEN}✓ Found Google Chrome at: $CHROME_PATH${NC}"
elif command -v google-chrome-stable &> /dev/null; then
    CHROME_PATH=$(which google-chrome-stable)
    echo -e "${GREEN}✓ Found Google Chrome Stable at: $CHROME_PATH${NC}"
elif command -v chromium-browser &> /dev/null; then
    CHROME_PATH=$(which chromium-browser)
    echo -e "${GREEN}✓ Found Chromium at: $CHROME_PATH${NC}"
elif command -v chromium &> /dev/null; then
    CHROME_PATH=$(which chromium)
    echo -e "${GREEN}✓ Found Chromium at: $CHROME_PATH${NC}"
else
    echo -e "${RED}✗ No Chrome/Chromium installation found${NC}"
    INSTALL_NEEDED=true
fi

# Step 2: Install Chrome if needed
if [ "$INSTALL_NEEDED" = true ]; then
    echo -e "${YELLOW}Step 2: Installing Chromium...${NC}"
    
    # Detect OS
    if [ -f /etc/debian_version ]; then
        # Debian/Ubuntu
        sudo apt-get update
        sudo apt-get install -y chromium-browser chromium-codecs-ffmpeg chromium-codecs-ffmpeg-extra
        
        if [ $? -eq 0 ]; then
            CHROME_PATH="/usr/bin/chromium-browser"
            echo -e "${GREEN}✓ Chromium installed successfully${NC}"
        else
            echo -e "${YELLOW}Trying Google Chrome instead...${NC}"
            wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
            sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
            sudo apt-get update
            sudo apt-get install -y google-chrome-stable
            CHROME_PATH="/usr/bin/google-chrome-stable"
        fi
    elif [ -f /etc/redhat-release ]; then
        # RHEL/CentOS
        sudo yum install -y chromium
        CHROME_PATH="/usr/bin/chromium-browser"
    fi
else
    echo -e "${GREEN}Step 2: Chrome already installed, skipping...${NC}"
fi

# Step 3: Install required dependencies
echo -e "${YELLOW}Step 3: Installing Chrome dependencies...${NC}"
if [ -f /etc/debian_version ]; then
    sudo apt-get install -y \
        libnss3 \
        libxss1 \
        libasound2 \
        libatk-bridge2.0-0 \
        libgtk-3-0 \
        libgbm1 \
        libxshmfence1 \
        libx11-xcb1 \
        libxcomposite1 \
        libxcursor1 \
        libxdamage1 \
        libxi6 \
        libxtst6 \
        libappindicator3-1 \
        libxrandr2 \
        libxfixes3 \
        fonts-liberation \
        libgbm-dev \
        libpango-1.0-0 \
        libcairo2 \
        libatspi2.0-0 \
        libcups2
fi
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Step 4: Test Chrome
echo -e "${YELLOW}Step 4: Testing Chrome...${NC}"
if [ -n "$CHROME_PATH" ]; then
    $CHROME_PATH --version
    
    # Test headless mode
    timeout 5 $CHROME_PATH --headless --no-sandbox --disable-gpu --dump-dom https://example.com > /dev/null 2>&1
    if [ $? -eq 0 ] || [ $? -eq 124 ]; then
        echo -e "${GREEN}✓ Chrome headless mode works${NC}"
    else
        echo -e "${RED}✗ Chrome headless mode failed${NC}"
    fi
fi

# Step 5: Configure Puppeteer
echo -e "${YELLOW}Step 5: Configuring Puppeteer...${NC}"
ENV_FILE="/opt/pulse/.env"

# Remove old Puppeteer config
sed -i '/PUPPETEER_EXECUTABLE_PATH/d' "$ENV_FILE" 2>/dev/null

# Add new config
if [ -n "$CHROME_PATH" ]; then
    echo "PUPPETEER_EXECUTABLE_PATH=$CHROME_PATH" >> "$ENV_FILE"
    echo -e "${GREEN}✓ Added PUPPETEER_EXECUTABLE_PATH=$CHROME_PATH to .env${NC}"
fi

# Add skip download flag
if ! grep -q "PUPPETEER_SKIP_DOWNLOAD" "$ENV_FILE"; then
    echo "PUPPETEER_SKIP_DOWNLOAD=true" >> "$ENV_FILE"
    echo -e "${GREEN}✓ Added PUPPETEER_SKIP_DOWNLOAD=true to .env${NC}"
fi

# Step 6: Fix permissions
echo -e "${YELLOW}Step 6: Fixing permissions...${NC}"
SESSIONS_DIR="/opt/pulse/whatsapp-sessions"
mkdir -p "$SESSIONS_DIR"
chmod -R 755 "$SESSIONS_DIR"

# Get PM2 user
PM2_USER=$(ps aux | grep "pm2" | grep -v grep | head -1 | awk '{print $1}')
if [ -n "$PM2_USER" ]; then
    chown -R "$PM2_USER:$PM2_USER" "$SESSIONS_DIR"
    echo -e "${GREEN}✓ Permissions set for user: $PM2_USER${NC}"
fi

# Step 7: Clear old sessions
echo -e "${YELLOW}Step 7: Clearing old sessions...${NC}"
rm -rf "$SESSIONS_DIR"/*
echo -e "${GREEN}✓ Old sessions cleared${NC}"

# Step 8: Restart application
echo -e "${YELLOW}Step 8: Restarting application...${NC}"
if command -v pm2 &> /dev/null; then
    sudo -u ${PM2_USER:-pulse} pm2 restart pulse
    echo -e "${GREEN}✓ Application restarted${NC}"
    
    echo ""
    echo -e "${YELLOW}Waiting for initialization...${NC}"
    sleep 10
    
    # Check logs
    echo -e "${YELLOW}Recent logs:${NC}"
    pm2 logs pulse --lines 20 --nostream
fi

echo ""
echo "==========================================="
echo -e "${GREEN}Chrome/Puppeteer fix complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Check WhatsApp status:"
echo "   curl http://localhost:3000/whatsapp-web/status"
echo ""
echo "2. Get QR code:"
echo "   curl http://localhost:3000/whatsapp-web/instances/YOUR_PHONE/qr"
echo ""
echo "3. Monitor logs:"
echo "   pm2 logs pulse"
echo ""

# Final test
echo -e "${YELLOW}Testing WhatsApp endpoints...${NC}"
curl -s http://localhost:3000/whatsapp-web/status | jq . 2>/dev/null || curl -s http://localhost:3000/whatsapp-web/status