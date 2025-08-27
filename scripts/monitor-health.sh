#!/bin/bash

# WhatsApp Health Monitor Script
# This script checks if Pulse is healthy and restarts if needed

# Configuration
HEALTH_ENDPOINT="http://localhost:3000/health"
WHATSAPP_STATUS_ENDPOINT="http://localhost:3000/whatsapp-web/status"
MAX_RETRIES=3
RETRY_DELAY=10
LOG_FILE="/var/log/pulse-health-monitor.log"

# Function to log messages
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to check health endpoint
check_health() {
    response=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_ENDPOINT")
    if [ "$response" = "200" ]; then
        return 0
    else
        return 1
    fi
}

# Function to check WhatsApp status
check_whatsapp() {
    response=$(curl -s "$WHATSAPP_STATUS_ENDPOINT" | grep -o '"connected":true' | wc -l)
    if [ "$response" -gt 0 ]; then
        return 0
    else
        return 1
    fi
}

# Function to restart Pulse
restart_pulse() {
    log_message "Restarting Pulse..."
    pm2 restart flash-whatsapp-dev
    sleep 30  # Wait for startup
}

# Main monitoring loop
main() {
    log_message "Starting Pulse health monitoring..."
    
    consecutive_failures=0
    
    while true; do
        # Check basic health
        if ! check_health; then
            consecutive_failures=$((consecutive_failures + 1))
            log_message "WARNING: Health check failed ($consecutive_failures/$MAX_RETRIES)"
            
            if [ "$consecutive_failures" -ge "$MAX_RETRIES" ]; then
                log_message "ERROR: Max consecutive failures reached. Restarting Pulse..."
                restart_pulse
                consecutive_failures=0
            fi
        else
            # Health check passed, now check WhatsApp
            if ! check_whatsapp; then
                log_message "WARNING: WhatsApp not connected"
                
                # Wait and check again
                sleep "$RETRY_DELAY"
                
                if ! check_whatsapp; then
                    log_message "ERROR: WhatsApp still not connected. Triggering restart..."
                    # Try to restart just WhatsApp first
                    curl -X POST "http://localhost:3000/whatsapp-web/restart" 2>/dev/null
                    
                    sleep 30
                    
                    # If still not working, restart the whole app
                    if ! check_whatsapp; then
                        restart_pulse
                    fi
                fi
            else
                # Everything is healthy
                if [ "$consecutive_failures" -gt 0 ]; then
                    log_message "INFO: System recovered. Resetting failure counter."
                fi
                consecutive_failures=0
            fi
        fi
        
        # Wait before next check
        sleep 60  # Check every minute
    done
}

# Create log file if it doesn't exist
touch "$LOG_FILE"

# Check if running as service or standalone
if [ "$1" = "daemon" ]; then
    # Run as daemon
    main &
    echo $! > /var/run/pulse-monitor.pid
    log_message "Monitor started as daemon (PID: $!)"
else
    # Run in foreground
    main
fi