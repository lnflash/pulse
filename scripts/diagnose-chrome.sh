#!/bin/bash

# Diagnose Chrome/Puppeteer issues for WhatsApp Web
echo "🔍 Diagnosing Chrome/Puppeteer installation..."
echo ""

# Check Chrome installations
echo "📦 Checking Chrome installations:"
echo "--------------------------------"

# Check for Google Chrome
if command -v google-chrome >/dev/null 2>&1; then
    echo "✅ Google Chrome found: $(which google-chrome)"
    google-chrome --version
elif command -v google-chrome-stable >/dev/null 2>&1; then
    echo "✅ Google Chrome Stable found: $(which google-chrome-stable)"
    google-chrome-stable --version
else
    echo "❌ Google Chrome not found"
fi

# Check for Chromium
if command -v chromium-browser >/dev/null 2>&1; then
    echo "✅ Chromium found: $(which chromium-browser)"
    chromium-browser --version
elif command -v chromium >/dev/null 2>&1; then
    echo "✅ Chromium found: $(which chromium)"
    chromium --version
else
    echo "❌ Chromium not found"
fi

echo ""
echo "📦 Checking Puppeteer Chrome:"
echo "-----------------------------"

# Check Puppeteer's bundled Chrome
PUPPETEER_CHROME_PATHS=(
    "/opt/pulse/node_modules/puppeteer/.local-chromium"
    "/opt/pulse/node_modules/puppeteer-core/.local-chromium"
    "$HOME/.cache/puppeteer"
    "/root/.cache/puppeteer"
)

for path in "${PUPPETEER_CHROME_PATHS[@]}"; do
    if [ -d "$path" ]; then
        echo "✅ Puppeteer Chrome cache found: $path"
        find "$path" -name "chrome" -o -name "chromium" 2>/dev/null | head -5
    fi
done

echo ""
echo "🔧 System Dependencies:"
echo "----------------------"

# Check required libraries
REQUIRED_LIBS=(
    "libx11-6"
    "libxcomposite1"
    "libxdamage1"
    "libxext6"
    "libxfixes3"
    "libxrandr2"
    "libxrender1"
    "libxtst6"
    "libgbm1"
    "libnss3"
    "libnspr4"
    "libasound2"
    "libatk1.0-0"
    "libatk-bridge2.0-0"
    "libcups2"
    "libdrm2"
    "libgtk-3-0"
    "libxss1"
)

missing_libs=()
for lib in "${REQUIRED_LIBS[@]}"; do
    if dpkg -l | grep -q "^ii  $lib"; then
        echo "✅ $lib installed"
    else
        echo "❌ $lib missing"
        missing_libs+=("$lib")
    fi
done

if [ ${#missing_libs[@]} -gt 0 ]; then
    echo ""
    echo "⚠️  Missing libraries detected!"
    echo "Install them with:"
    echo "sudo apt-get update && sudo apt-get install -y ${missing_libs[*]}"
fi

echo ""
echo "📁 WhatsApp Sessions Directory:"
echo "------------------------------"
if [ -d "/opt/pulse/whatsapp-sessions" ]; then
    echo "✅ Directory exists"
    echo "Permissions: $(ls -ld /opt/pulse/whatsapp-sessions)"
    echo "Contents:"
    ls -la /opt/pulse/whatsapp-sessions 2>/dev/null | head -10
else
    echo "❌ Directory does not exist"
fi

echo ""
echo "🔍 Chrome Process Check:"
echo "-----------------------"
ps aux | grep -E "(chrome|chromium)" | grep -v grep | head -5

echo ""
echo "💾 Disk Space:"
echo "-------------"
df -h /opt /tmp /var

echo ""
echo "🔍 Recommendations:"
echo "------------------"

if ! command -v google-chrome >/dev/null 2>&1 && ! command -v chromium-browser >/dev/null 2>&1; then
    echo "1. Install Chrome or Chromium:"
    echo "   For Ubuntu/Debian:"
    echo "   wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -"
    echo "   sudo sh -c 'echo \"deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main\" >> /etc/apt/sources.list.d/google.list'"
    echo "   sudo apt-get update && sudo apt-get install -y google-chrome-stable"
    echo ""
    echo "   OR install Chromium:"
    echo "   sudo apt-get install -y chromium-browser"
fi

if [ ${#missing_libs[@]} -gt 0 ]; then
    echo "2. Install missing dependencies (see above)"
fi

echo ""
echo "3. If Chrome is installed but WhatsApp still fails:"
echo "   - Run: sudo ./fix-whatsapp-permissions.sh"
echo "   - Clear sessions: sudo rm -rf /opt/pulse/whatsapp-sessions/*"
echo "   - Restart app: pm2 restart pulse"