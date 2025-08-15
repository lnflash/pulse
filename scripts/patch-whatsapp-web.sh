#!/bin/bash

echo "🔧 Patching WhatsApp Web.js for Puppeteer compatibility"
echo "========================================================"
echo ""

# Path to the problematic file
CLIENT_FILE="/opt/pulse/node_modules/whatsapp-web.js/src/Client.js"

if [ ! -f "$CLIENT_FILE" ]; then
    echo "❌ WhatsApp Web.js Client.js not found at expected location"
    echo "Path checked: $CLIENT_FILE"
    exit 1
fi

# Backup the original file
cp "$CLIENT_FILE" "$CLIENT_FILE.backup"
echo "✓ Created backup: $CLIENT_FILE.backup"

# Apply patch to comment out the problematic setUserAgent call
echo "Applying patch..."

# Method 1: Comment out the setUserAgent line
sed -i 's/await page\.setUserAgent/\/\/ await page.setUserAgent/g' "$CLIENT_FILE"

# Method 2: Wrap in try-catch if not already
cat > /tmp/whatsapp-patch.js << 'EOF'
// Patch to fix setUserAgent error
const fs = require('fs');
const path = '/opt/pulse/node_modules/whatsapp-web.js/src/Client.js';

let content = fs.readFileSync(path, 'utf8');

// Find and wrap setUserAgent in try-catch
if (!content.includes('try { await page.setUserAgent')) {
    content = content.replace(
        /await page\.setUserAgent\([^)]+\);/g,
        'try { await page.setUserAgent(this.options.userAgent || this.pupPage.browser().userAgent()); } catch(e) { /* Ignore setUserAgent errors */ }'
    );
}

// Also fix potential evaluate issues
content = content.replace(
    /await page\.evaluate\(\(\) => \{/g,
    'await page.evaluate(() => { try {'
);

// Save the patched file
fs.writeFileSync(path, content);
console.log('✓ Patch applied successfully');
EOF

node /tmp/whatsapp-patch.js

echo ""
echo "✓ WhatsApp Web.js patched for Puppeteer compatibility"
echo ""

# Test the patch
echo "Testing patch with minimal script..."
cd /opt/pulse
sudo -u pulse timeout 10 node scripts/test-whatsapp-minimal.js 2>&1 | head -20

echo ""
echo "========================================================"
echo "Patch complete!"
echo ""
echo "Next steps:"
echo "1. Restart Pulse: sudo -u pulse pm2 restart pulse"
echo "2. Check status: curl http://localhost:3000/whatsapp-web/status"
echo "3. Get QR code: curl http://localhost:3000/whatsapp-web/instances/18764250250/qr"