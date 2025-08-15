#!/bin/bash

echo "Testing WhatsApp Routes Registration"
echo "===================================="
echo ""

BASE_URL="${1:-http://localhost:3000}"

echo "1. Testing main health endpoint:"
curl -s "$BASE_URL/health" | jq . 2>/dev/null || curl -s "$BASE_URL/health"
echo ""

echo "2. Testing WhatsApp-specific endpoints:"
echo "   a. WhatsApp Web health:"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/whatsapp-web/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)
echo "      Status: $HTTP_CODE"
echo "      Body: $BODY"
echo ""

echo "   b. WhatsApp Web status:"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/whatsapp-web/status")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)
echo "      Status: $HTTP_CODE"
echo "      Body: $BODY"
echo ""

echo "   c. WhatsApp Web QR:"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/whatsapp-web/qr")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)
echo "      Status: $HTTP_CODE"
echo "      Body: $BODY"
echo ""

echo "3. Testing admin endpoints:"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/admin/whatsapp/qr")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)
echo "   Admin QR Status: $HTTP_CODE"
echo ""

echo "4. Checking if it's a routing issue:"
echo "   Testing a non-existent route:"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/this-route-does-not-exist")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)
echo "   404 Status: $HTTP_CODE"
echo "   404 Body: $BODY"
echo ""

echo "===================================="
echo "Diagnosis:"
if [[ "$HTTP_CODE" == "404" ]]; then
    echo "❌ WhatsApp routes are not registered"
    echo "   Possible causes:"
    echo "   1. WhatsApp module not imported"
    echo "   2. Controller not exported from module"
    echo "   3. Routes being overridden by catch-all"
else
    echo "✅ Some routes are working"
fi