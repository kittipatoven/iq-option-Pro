#!/bin/bash
# VPS Deployment Script for IQ Option Bot
# Run this on your Ubuntu 24.04 VPS

set -e

echo "🔥 IQ OPTION BOT - VPS DEPLOYMENT"
echo "=============================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# STEP 1: Update system
echo ""
echo "📦 STEP 1: Updating system packages..."
apt update -y
apt upgrade -y
print_status "System updated"

# STEP 2: Install Node.js 20.x
echo ""
echo "📦 STEP 2: Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
print_status "Node.js $(node -v) installed"
print_status "npm $(npm -v) installed"

# STEP 3: Install Git
echo ""
echo "📦 STEP 3: Installing Git..."
apt install -y git
print_status "Git $(git --version) installed"

# STEP 4: Install PM2
echo ""
echo "📦 STEP 4: Installing PM2..."
npm install -g pm2
print_status "PM2 installed"

# STEP 5: Install build tools
echo ""
echo "📦 STEP 5: Installing build tools..."
apt install -y build-essential python3 make g++
print_status "Build tools installed"

# STEP 6: Clone repository
echo ""
echo "📦 STEP 6: Cloning repository..."
cd /root
if [ -d "iq-option-Pro" ]; then
    print_warning "Directory exists, pulling latest changes..."
    cd iq-option-Pro
    git pull origin main
else
    git clone https://github.com/kittipatoven/iq-option-Pro.git
    cd iq-option-Pro
fi
print_status "Repository ready"

# STEP 7: Install dependencies
echo ""
echo "📦 STEP 7: Installing npm dependencies..."
npm install
print_status "Dependencies installed"

# STEP 8: Create .env if not exists
echo ""
echo "📦 STEP 8: Setting up environment..."
if [ ! -f ".env" ]; then
    cat > .env << 'EOF'
# IQ Option Credentials
IQ_OPTION_EMAIL=your_email@example.com
IQ_OPTION_PASSWORD=your_password

# Account Mode (PRACTICE/REAL)
ACCOUNT_MODE=PRACTICE

# Trading Settings
DEFAULT_ASSET=EURUSD
DEFAULT_AMOUNT=1
DEFAULT_EXPIRATION=1

# Connection Settings
MAX_RETRY=50
RECONNECT_INTERVAL=5000
FORCE_LIVE=false

# WebSocket Settings
WS_RECONNECT=true
WS_HEARTBEAT_INTERVAL=30000

# Anti-Block Settings
ENABLE_PROXY_ROTATION=true
PROXY_HEALTH_CHECK=true
MAX_PROXY_SWITCHES=10
RATE_LIMIT_DELAY=1000

# VPS Mode
VPS_MODE=true
VPS_HOST=localhost
EOF
    print_warning "Created .env template - PLEASE EDIT WITH YOUR CREDENTIALS"
else
    print_status ".env already exists"
fi

# STEP 9: Test network
echo ""
echo "📦 STEP 9: Testing network connectivity..."
node test_network.js || print_warning "Network test completed with issues"

# STEP 10: Setup PM2 ecosystem
echo ""
echo "📦 STEP 10: Creating PM2 ecosystem..."
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'iqoption-bot',
    script: './minimal_test.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      VPS_MODE: 'true'
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    autorestart: true,
    restart_delay: 5000,
    max_restarts: 10,
    min_uptime: '10s',
    kill_timeout: 5000,
    listen_timeout: 10000,
    shutdown_with_message: true
  }]
};
EOF
print_status "PM2 ecosystem created"

# STEP 11: Create logs directory
mkdir -p logs

# STEP 12: Setup PM2 startup
echo ""
echo "📦 STEP 11: Setting up PM2 startup..."
pm2 startup systemd -u root --hp /root
pm2 save
print_status "PM2 startup configured"

echo ""
echo "=============================================="
echo "✅ DEPLOYMENT COMPLETE!"
echo "=============================================="
echo ""
echo "📋 NEXT STEPS:"
echo "   1. Edit .env file with your credentials:"
echo "      nano /root/iq-option-Pro/.env"
echo ""
echo "   2. Test the bot:"
echo "      cd /root/iq-option-Pro"
echo "      node minimal_test.js"
echo ""
echo "   3. Start with PM2:"
echo "      pm2 start ecosystem.config.js"
echo "      pm2 save"
echo ""
echo "   4. Monitor logs:"
echo "      pm2 logs iqoption-bot"
echo ""
echo "   5. Check status:"
echo "      pm2 status"
echo ""
