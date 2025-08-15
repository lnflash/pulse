#!/bin/bash

# Initialize WhatsApp Web instance
echo "📱 WhatsApp Web Instance Initialization"
echo "========================================"
echo ""

# Check if phone number is provided
if [ -z "$1" ]; then
    echo "Usage: ./init-whatsapp.sh <phone_number>"
    echo "Example: ./init-whatsapp.sh 254700000000"
    echo ""
    echo "Phone number should be in international format without + sign"
    exit 1
fi

PHONE_NUMBER=$1
BASE_URL="${2:-http://localhost:3000}"

echo "Phone Number: $PHONE_NUMBER"
echo "Server URL: $BASE_URL"
echo ""

# Step 1: Check current status
echo "1️⃣ Checking current WhatsApp status..."
STATUS=$(curl -s "$BASE_URL/whatsapp-web/status")
echo "$STATUS" | jq . 2>/dev/null || echo "$STATUS"
echo ""

# Step 2: Check if instance exists
echo "2️⃣ Checking if instance exists for $PHONE_NUMBER..."
INSTANCE_STATUS=$(curl -s "$BASE_URL/whatsapp-web/instances/$PHONE_NUMBER/status")
echo "$INSTANCE_STATUS" | jq . 2>/dev/null || echo "$INSTANCE_STATUS"
echo ""

# Step 3: Create instance (if needed)
echo "3️⃣ Creating/Initializing WhatsApp instance..."
# First, try to restart the instance if it exists
RESTART_RESPONSE=$(curl -s -X POST "$BASE_URL/whatsapp-web/instances/$PHONE_NUMBER/restart")
echo "$RESTART_RESPONSE" | jq . 2>/dev/null || echo "$RESTART_RESPONSE"
echo ""

# Wait a moment for initialization
echo "⏳ Waiting for instance to initialize..."
sleep 3

# Step 4: Get QR Code
echo "4️⃣ Getting QR Code..."
QR_RESPONSE=$(curl -s "$BASE_URL/whatsapp-web/instances/$PHONE_NUMBER/qr")

# Check if we got a QR code
if echo "$QR_RESPONSE" | grep -q "qrImageUrl"; then
    echo "✅ QR Code generated successfully!"
    echo ""
    
    # Extract and display QR details
    QR_URL=$(echo "$QR_RESPONSE" | grep -o '"qrImageUrl":"[^"]*' | cut -d'"' -f4)
    
    echo "📱 TO CONNECT WHATSAPP:"
    echo "======================="
    echo ""
    echo "Option 1: Open this URL in your browser to see the QR code:"
    echo "$QR_URL"
    echo ""
    echo "Option 2: Check your terminal/PM2 logs for the QR code:"
    echo "pm2 logs pulse"
    echo ""
    echo "Option 3: Use curl to get raw QR data:"
    echo "curl $BASE_URL/whatsapp-web/instances/$PHONE_NUMBER/qr"
    echo ""
    echo "📲 On your phone:"
    echo "1. Open WhatsApp"
    echo "2. Go to Settings → Linked Devices"
    echo "3. Tap 'Link a Device'"
    echo "4. Scan the QR code"
    echo ""
    
elif echo "$QR_RESPONSE" | grep -q "already_authenticated"; then
    echo "✅ Instance is already authenticated!"
    echo "No QR code needed - WhatsApp is already connected."
    
elif echo "$QR_RESPONSE" | grep -q "404"; then
    echo "❌ WhatsApp Web endpoints not available"
    echo ""
    echo "Possible issues:"
    echo "1. WhatsApp module might be disabled"
    echo "2. Instance not configured in environment"
    echo ""
    echo "To fix:"
    echo "1. Check your .env file has:"
    echo "   WHATSAPP_INSTANCES='[{\"phoneNumber\":\"$PHONE_NUMBER\",\"enabled\":true}]'"
    echo "   or"
    echo "   WHATSAPP_DEFAULT_PHONE=$PHONE_NUMBER"
    echo ""
    echo "2. Make sure DISABLE_WHATSAPP_WEB is not set to 'true'"
    echo ""
    echo "3. Restart the application:"
    echo "   pm2 restart pulse"
    
else
    echo "⚠️ Unexpected response:"
    echo "$QR_RESPONSE" | jq . 2>/dev/null || echo "$QR_RESPONSE"
fi

echo ""
echo "========================================"
echo ""

# Step 5: Monitor status
echo "5️⃣ Monitoring connection status..."
echo "Run this command to check if WhatsApp is connected:"
echo "curl $BASE_URL/whatsapp-web/instances/$PHONE_NUMBER/status"
echo ""
echo "Or watch the logs:"
echo "pm2 logs pulse --lines 50"