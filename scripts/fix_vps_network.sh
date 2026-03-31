#!/bin/bash

# ============================================================
# VPS Network Fix & WARP Setup Script
# Auto-fix connectivity issues for IQ Option Bot
# ============================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Log file
LOG_FILE="/root/vps_network_fix.log"

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a $LOG_FILE
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a $LOG_FILE
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a $LOG_FILE
}

# ============================================================
# STEP 1: Check Current Network Status
# ============================================================
log "=== Step 1: Checking Current Network Status ==="

echo -e "\n${BLUE}--- Checking Internet Connection ---${NC}"
if ping -c 3 8.8.8.8 > /dev/null 2>&1; then
    log "✓ Basic internet connectivity: OK"
else
    error "✗ No basic internet connectivity"
fi

echo -e "\n${BLUE}--- Testing IQ Option Connectivity ---${NC}"
if curl -I https://iqoption.com --max-time 10 > /dev/null 2>&1; then
    log "✓ IQ Option connection: OK"
else
    error "✗ IQ Option connection: FAILED"
fi

# ============================================================
# STEP 2: Check and Fix WARP
# ============================================================
log "\n=== Step 2: Checking WARP Status ==="

# Check if warp-cli exists
if ! command -v warp-cli &> /dev/null; then
    warn "WARP not installed. Installing..."
    
    # Install WARP
    curl https://pkg.cloudflareclient.com/pubkey.gpg | sudo gpg --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflare-client.list
    
    sudo apt-get update
    sudo apt-get install -y cloudflare-warp
    
    log "✓ WARP installed"
fi

# Check WARP service
echo -e "\n${BLUE}--- Checking WARP Service ---${NC}"
if ! systemctl is-active --quiet warp-svc; then
    warn "WARP service not running. Starting..."
    sudo systemctl enable warp-svc
    sudo systemctl start warp-svc
    sleep 2
    
    if systemctl is-active --quiet warp-svc; then
        log "✓ WARP service started"
    else
        error "✗ Failed to start WARP service"
    fi
else
    log "✓ WARP service already running"
fi

# Check WARP registration
echo -e "\n${BLUE}--- Checking WARP Registration ---${NC}"
WARP_STATUS=$(warp-cli status 2>&1 || echo "Unknown")

if echo "$WARP_STATUS" | grep -q "Registration Missing"; then
    warn "WARP not registered. Registering..."
    sudo warp-cli registration new
    log "✓ WARP registered"
    
    # Connect after registration
    sudo warp-cli connect
    sleep 3
    
    NEW_STATUS=$(warp-cli status 2>&1 || echo "Unknown")
    if echo "$NEW_STATUS" | grep -q "Connected"; then
        log "✓ WARP connected successfully"
    else
        error "✗ WARP connection failed"
    fi
elif echo "$WARP_STATUS" | grep -q "Disconnected"; then
    warn "WARP disconnected. Connecting..."
    sudo warp-cli connect
    sleep 3
    
    NEW_STATUS=$(warp-cli status 2>&1 || echo "Unknown")
    if echo "$NEW_STATUS" | grep -q "Connected"; then
        log "✓ WARP connected"
    else
        error "✗ WARP connection failed"
    fi
elif echo "$WARP_STATUS" | grep -q "Connected"; then
    log "✓ WARP already connected"
else
    warn "Unknown WARP status: $WARP_STATUS"
fi

# ============================================================
# STEP 3: Test Connection After WARP
# ============================================================
log "\n=== Step 3: Testing Connection After WARP ==="

echo -e "\n${BLUE}--- Current WARP Status ---${NC}"
warp-cli status

echo -e "\n${BLUE}--- Testing IQ Option Again ---${NC}"
if curl -I https://iqoption.com --max-time 15 > /dev/null 2>&1; then
    log "✓ IQ Option connection via WARP: SUCCESS"
else
    error "✗ IQ Option connection via WARP: FAILED"
    
    # Try with explicit proxy
    echo -e "\n${BLUE}--- Trying with SOCKS5 Proxy ---${NC}"
    if curl -I --socks5 localhost:40000 https://iqoption.com --max-time 15 > /dev/null 2>&1; then
        log "✓ IQ Option via SOCKS5: SUCCESS"
    else
        error "✗ IQ Option via SOCKS5: FAILED"
    fi
fi

# ============================================================
# STEP 4: Alternative Solutions if WARP Fails
# ============================================================
log "\n=== Step 4: Setting Up Alternative Solutions ==="

# Check if we need alternative proxy
IQ_TEST=$(curl -I https://iqoption.com --max-time 10 2>&1)

if [[ "$IQ_TEST" == *"Failed to connect"* ]] || [[ "$IQ_TEST" == *"Connection refused"* ]]; then
    warn "WARP not working. Setting up alternative proxy..."
    
    # Install and configure Dante SOCKS proxy as fallback
    if ! command -v sockd &> /dev/null; then
        log "Installing Dante SOCKS proxy..."
        sudo apt-get update
        sudo apt-get install -y dante-server
    fi
    
    # Create simple SOCKS config
    sudo tee /etc/danted.conf > /dev/null <<EOF
logoutput: syslog
internal: 0.0.0.0 port = 1080
external: eth0

socksmethod: username none
clientmethod: none

user.privileged: root
user.unprivileged: nobody

client pass {
    from: 0.0.0.0/0 to: 0.0.0.0/0
    log: connect disconnect error
}

socks pass {
    from: 0.0.0.0/0 to: 0.0.0.0/0
    command: bind connect udpassociate
    log: connect disconnect error
}
EOF
    
    sudo systemctl restart danted
    log "✓ SOCKS proxy configured on port 1080"
    warn "Update bot config to use SOCKS5 proxy: 127.0.0.1:1080"
fi

# ============================================================
# STEP 5: Summary and Recommendations
# ============================================================
log "\n=== Step 5: Summary ==="

echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}         NETWORK FIX SUMMARY           ${NC}"
echo -e "${BLUE}========================================${NC}"

echo -e "\n${GREEN}Network Status:${NC}"
ip addr show | grep "inet " | head -3

echo -e "\n${GREEN}WARP Status:${NC}"
warp-cli status 2>&1 || echo "WARP not available"

echo -e "\n${GREEN}DNS Configuration:${NC}"
cat /etc/resolv.conf | grep nameserver | head -3

echo -e "\n${GREEN}Connectivity Tests:${NC}"
echo "Google DNS: $(ping -c 1 8.8.8.8 > /dev/null 2>&1 && echo '✓ OK' || echo '✗ FAIL')"
echo "IQ Option:  $(curl -I https://iqoption.com --max-time 5 > /dev/null 2>&1 && echo '✓ OK' || echo '✗ FAIL')"
echo "Cloudflare: $(curl -I https://cloudflare.com --max-time 5 > /dev/null 2>&1 && echo '✓ OK' || echo '✗ FAIL')"

echo -e "\n${YELLOW}========================================${NC}"
echo -e "${YELLOW}         RECOMMENDATIONS               ${NC}"
echo -e "${YELLOW}========================================${NC}"

# Check if we can connect to IQ Option
if curl -I https://iqoption.com --max-time 5 > /dev/null 2>&1; then
    echo -e "\n${GREEN}✓ Network is ready for trading bot!${NC}"
    echo -e "  You can now run your bot normally."
else
    echo -e "\n${RED}✗ Network still has issues${NC}"
    echo -e "\n${YELLOW}Recommended actions:${NC}"
    echo "  1. Check if VPS provider blocks trading traffic"
    echo "  2. Consider changing VPS region (Singapore/Japan)"
    echo "  3. Use external proxy service"
    echo "  4. Contact VPS support about outbound HTTPS blocking"
    
    # Save proxy config for bot
    echo -e "\n${YELLOW}Bot Configuration (save this):${NC}"
    echo '  PROXY_URL=socks5://127.0.0.1:1080'
    echo '  Or set in your .env file: USE_PROXY=true'
fi

echo -e "\n${BLUE}Log saved to: $LOG_FILE${NC}"
echo -e "${BLUE}Run this script again anytime: bash /root/fix_vps_network.sh${NC}"

log "\n=== Script Complete ==="
