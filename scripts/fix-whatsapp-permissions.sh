#!/bin/bash

# Fix WhatsApp Chrome session permission errors
# This script fixes permission issues for Chrome profiles in whatsapp-sessions directory

echo "🔧 Fixing WhatsApp Chrome session permissions..."

# Set the base directory
BASE_DIR="/opt/pulse"
SESSIONS_DIR="$BASE_DIR/whatsapp-sessions"

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "❌ This script must be run with sudo or as root"
    echo "Usage: sudo ./fix-whatsapp-permissions.sh"
    exit 1
fi

# Create sessions directory if it doesn't exist
if [ ! -d "$SESSIONS_DIR" ]; then
    echo "📁 Creating whatsapp-sessions directory..."
    mkdir -p "$SESSIONS_DIR"
fi

# Get the user running the PM2 process
PM2_USER=$(ps aux | grep "pm2" | grep -v grep | head -1 | awk '{print $1}')
if [ -z "$PM2_USER" ]; then
    # Fallback to common users
    if id "ubuntu" >/dev/null 2>&1; then
        PM2_USER="ubuntu"
    elif id "ec2-user" >/dev/null 2>&1; then
        PM2_USER="ec2-user"
    elif id "node" >/dev/null 2>&1; then
        PM2_USER="node"
    else
        echo "⚠️  Could not detect PM2 user. Using current user..."
        PM2_USER=$(whoami)
    fi
fi

echo "👤 Detected PM2 user: $PM2_USER"

# Set proper ownership for the entire pulse directory
echo "📝 Setting ownership for $BASE_DIR to $PM2_USER..."
chown -R $PM2_USER:$PM2_USER "$BASE_DIR"

# Set proper permissions for whatsapp-sessions
echo "🔐 Setting permissions for WhatsApp sessions directory..."
chmod -R 755 "$SESSIONS_DIR"

# Create Chrome directories for each phone number and set permissions
echo "📱 Creating Chrome profile directories..."
for dir in "$SESSIONS_DIR"/*/; do
    if [ -d "$dir" ]; then
        phone=$(basename "$dir")
        chrome_dir="$dir/chrome-profile"
        
        # Create chrome-profile directory if it doesn't exist
        if [ ! -d "$chrome_dir" ]; then
            mkdir -p "$chrome_dir"
            echo "  ✅ Created chrome-profile for $phone"
        fi
        
        # Set ownership and permissions
        chown -R $PM2_USER:$PM2_USER "$dir"
        chmod -R 755 "$chrome_dir"
        
        # Remove any existing SingletonLock files that might be causing issues
        if [ -f "$chrome_dir/SingletonLock" ]; then
            rm -f "$chrome_dir/SingletonLock"
            echo "  🗑️  Removed SingletonLock for $phone"
        fi
    fi
done

# Create a test directory to ensure new sessions can be created
TEST_DIR="$SESSIONS_DIR/test-session"
mkdir -p "$TEST_DIR/chrome-profile"
chown -R $PM2_USER:$PM2_USER "$TEST_DIR"
chmod -R 755 "$TEST_DIR"
echo "✅ Created test session directory with proper permissions"

# Clean up test directory
rm -rf "$TEST_DIR"

# Set SELinux context if SELinux is enabled (for RedHat-based systems)
if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" != "Disabled" ]; then
    echo "🔒 Setting SELinux context..."
    chcon -R -t httpd_sys_rw_content_t "$SESSIONS_DIR" 2>/dev/null || true
fi

# Display current permissions
echo ""
echo "📊 Current permissions:"
ls -la "$BASE_DIR" | head -5
echo ""
ls -la "$SESSIONS_DIR" | head -10

# Restart the app with PM2
echo ""
echo "🔄 Restarting Pulse app with PM2..."
su - $PM2_USER -c "pm2 restart pulse"

# Check PM2 status
echo ""
echo "📈 PM2 Status:"
su - $PM2_USER -c "pm2 status"

echo ""
echo "✅ WhatsApp session permissions have been fixed!"
echo ""
echo "📝 Next steps:"
echo "1. Monitor PM2 logs: pm2 logs pulse"
echo "2. Check if Chrome errors are resolved"
echo "3. Test WhatsApp connection through the app"
echo ""
echo "If issues persist, try:"
echo "- Clear all sessions: rm -rf $SESSIONS_DIR/*"
echo "- Restart PM2: pm2 restart pulse"
echo "- Check Chrome/Puppeteer installation: which chromium-browser || which google-chrome"