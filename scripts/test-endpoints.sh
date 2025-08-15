#!/bin/bash

# Test WhatsApp endpoints availability
echo "🔍 Testing WhatsApp Endpoints..."
echo "================================"

BASE_URL="http://localhost:3000"

echo ""
echo "1. Testing health endpoint:"
curl -s "$BASE_URL/health" | jq . 2>/dev/null || curl -s "$BASE_URL/health"

echo ""
echo ""
echo "2. Testing WhatsApp Web status:"
curl -s "$BASE_URL/whatsapp-web/status" | jq . 2>/dev/null || curl -s "$BASE_URL/whatsapp-web/status"

echo ""
echo ""
echo "3. Testing WhatsApp Web QR endpoint:"
curl -s "$BASE_URL/whatsapp-web/qr" | jq . 2>/dev/null || curl -s "$BASE_URL/whatsapp-web/qr"

echo ""
echo ""
echo "4. Testing Admin Dashboard WhatsApp QR:"
curl -s "$BASE_URL/admin/whatsapp/qr" | jq . 2>/dev/null || curl -s "$BASE_URL/admin/whatsapp/qr"

echo ""
echo ""
echo "5. Testing WhatsApp Web health:"
curl -s "$BASE_URL/whatsapp-web/health" | jq . 2>/dev/null || curl -s "$BASE_URL/whatsapp-web/health"

echo ""
echo ""
echo "6. List all available routes (if development mode):"
curl -s "$BASE_URL/" | head -20

echo ""
echo ""
echo "7. Check if WhatsApp instance exists:"
# Try a common phone number format
curl -s "$BASE_URL/whatsapp-web/instances/254700000000/status" | jq . 2>/dev/null || curl -s "$BASE_URL/whatsapp-web/instances/254700000000/status"

echo ""
echo ""
echo "================================"
echo "✅ Endpoint test complete"