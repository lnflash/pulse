#!/bin/bash

# Deployment script for Pulse production server

echo "🚀 Starting Pulse deployment..."

# Pull latest changes
echo "📥 Pulling latest changes from GitHub..."
cd /opt/pulse
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --production

# Build the application
echo "🔨 Building application..."
npm run build

# Restart PM2 process
echo "🔄 Restarting Pulse service..."
pm2 restart pulse

# Show logs
echo "📋 Showing logs..."
pm2 logs pulse --lines 20

echo "✅ Deployment complete!"