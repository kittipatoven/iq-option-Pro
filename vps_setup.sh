#!/bin/bash
# VPS Deployment Script for IQ Option Bot
# Run this script ON the VPS as root or xver user
# curl -fsSL https://raw.githubusercontent.com/kittipatoven/iq-option-Pro/main/vps_setup.sh | bash

set -e

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     🔥 IQ OPTION BOT - VPS PRODUCTION DEPLOYMENT               ║"
echo "║     Ubuntu 24.04 LTS Ready                                     ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    print_warning "Not running as root. Some commands may fail."
    print_info "Run as: sudo bash vps_setup.sh"
fi

# STEP 1: Update System
echo ""
echo "📦 STEP 1: Updating system packages..."
echo "────────────────────────────────────────────────────────────"
apt-get update -y
apt-get upgrade -y
print_status "System updated"

# STEP 2: Install Essential Tools
echo ""
echo "📦 STEP 2: Installing essential tools..."
echo "────────────────────────────────────────────────────────────"
apt-get install -y curl wget git build-essential software-properties-common apt-transport-https ca-certificates gnupg lsb-release net-tools htop
print_status "Essential tools installed"

# STEP 3: Install Node.js 20.x (LTS)
echo ""
echo "📦 STEP 3: Installing Node.js 20.x LTS..."
echo "────────────────────────────────────────────────────────────"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    print_status "Node.js $(node -v) installed"
    print_status "npm $(npm -v) installed"
else
    print_warning "Node.js already installed: $(node -v)"
fi

# STEP 4: Install PM2 Process Manager
echo ""
echo "📦 STEP 4: Installing PM2 Process Manager..."
echo "────────────────────────────────────────────────────────────"
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    print_status "PM2 installed"
else
    print_warning "PM2 already installed"
fi

# STEP 5: Install Python & Build Tools (for native modules)
echo ""
echo "📦 STEP 5: Installing Python & build tools..."
echo "────────────────────────────────────────────────────────────"
apt-get install -y python3 python3-pip make g++
print_status "Build tools installed"

# STEP 6: Configure Firewall (Optional but recommended)
echo ""
echo "🔒 STEP 6: Configuring firewall..."
echo "────────────────────────────────────────────────────────────"
if command -v ufw &> /dev/null; then
    ufw allow ssh
    ufw allow 80/tcp
    ufw allow 443/tcp
    print_status "UFW firewall configured"
else
    print_warning "UFW not installed, skipping firewall setup"
fi

# STEP 7: Setup Swap (important for Node.js apps)
echo ""
echo "💾 STEP 7: Setting up swap memory..."
echo "────────────────────────────────────────────────────────────"
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab
    print_status "2GB swap created"
else
    print_warning "Swap already exists"
fi

# STEP 8: Clone Repository
echo ""
echo "📥 STEP 8: Cloning repository..."
echo "────────────────────────────────────────────────────────────"
PROJECT_DIR="/home/xver/iq-option-Pro"
mkdir -p /home/xver
cd /home/xver

if [ -d "$PROJECT_DIR" ]; then
    print_warning "Directory exists, updating..."
    cd "$PROJECT_DIR"
    git fetch origin
    git reset --hard origin/main
else
    git clone https://github.com/kittipatoven/iq-option-Pro.git
    print_status "Repository cloned to $PROJECT_DIR"
fi

# Set ownership
chown -R xver:xver /home/xver/iq-option-Pro 2>/dev/null || chown -R root:root /home/xver/iq-option-Pro

# STEP 9: Install Dependencies
echo ""
echo "📦 STEP 9: Installing npm dependencies..."
echo "────────────────────────────────────────────────────────────"
cd "$PROJECT_DIR"
npm install
print_status "Dependencies installed"

# STEP 10: Create Logs Directory
echo ""
echo "📁 STEP 10: Setting up logs..."
echo "────────────────────────────────────────────────────────────"
mkdir -p logs
chmod 755 logs
print_status "Logs directory created"

# STEP 11: Create Environment File Template
echo ""
echo "⚙️  STEP 11: Creating environment template..."
echo "────────────────────────────────────────────────────────────"
if [ ! -f ".env" ]; then
    cat > .env << 'EOF'
# ═══════════════════════════════════════════════════════════════
# IQ OPTION BOT - VPS CONFIGURATION
# ═══════════════════════════════════════════════════════════════

# 🔐 IQ Option Credentials (REQUIRED)
# ⚠️  WARNING: Use DEMO mode first!
IQ_OPTION_EMAIL=your_email@example.com
IQ_OPTION_PASSWORD=your_password_here

# 💰 Account Mode: PRACTICE (DEMO) or REAL
ACCOUNT_MODE=PRACTICE

# 📊 Default Trading Settings
DEFAULT_ASSET=EURUSD-OTC
DEFAULT_AMOUNT=1
DEFAULT_EXPIRATION=1

# 🔌 Connection Settings
MAX_RETRY=50
RECONNECT_INTERVAL=5000
FORCE_LIVE=false

# 📡 WebSocket Settings
WS_RECONNECT=true
WS_HEARTBEAT_INTERVAL=30000
WS_TIMEOUT=30000

# 🛡️ Anti-Block System
ENABLE_PROXY_ROTATION=true
PROXY_HEALTH_CHECK=true
MAX_PROXY_SWITCHES=10
RATE_LIMIT_DELAY=1000
RECONNECT_BACKOFF=1.5

# 🖥️ VPS Mode Settings
VPS_MODE=true
VPS_HOST=localhost

# 🌐 Proxy Configuration (if needed)
# HTTPS_PROXY=http://127.0.0.1:8080
# HTTP_PROXY=http://127.0.0.1:8080

# 🔧 Debug Settings
DEBUG_MODE=false
LOG_LEVEL=info
VERBOSE_LOGGING=true

# 🧪 Test Mode (no real trades)
TEST_MODE=false
EOF
    print_status ".env template created"
    print_warning "⚠️  IMPORTANT: Edit .env file with your credentials!"
else
    print_warning ".env already exists"
fi

# STEP 12: Test Network
echo ""
echo "🌐 STEP 12: Testing network connectivity..."
echo "────────────────────────────────────────────────────────────"
node test_network.js || print_warning "Network test completed with warnings"

# STEP 13: Create PM2 Ecosystem
echo ""
echo "🚀 STEP 13: Creating PM2 ecosystem..."
echo "────────────────────────────────────────────────────────────"
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'iqoption-bot',
    script: './minimal_test.js',
    cwd: '/home/xver/iq-option-Pro',
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
    merge_logs: true,
    time: true,
    autorestart: true,
    restart_delay: 5000,
    max_restarts: 10,
    min_uptime: '30s',
    kill_timeout: 5000,
    listen_timeout: 10000,
    shutdown_with_message: true,
    wait_ready: true,
    // Health monitoring
    health_check_grace_period: 30000,
    // Log rotation
    log_rotate: true,
    log_max_size: '10M',
    log_retention: '7d'
  }]
};
EOF
print_status "PM2 ecosystem created"

# STEP 14: Create Start Script
echo ""
echo "🎮 STEP 14: Creating start script..."
echo "────────────────────────────────────────────────────────────"
cat > start_bot.sh << 'EOF'
#!/bin/bash
# Quick start script for IQ Option Bot

cd /home/xver/iq-option-Pro

echo "🚀 Starting IQ Option Bot..."
echo ""

# Check if .env is configured
if grep -q "your_email@example.com" .env; then
    echo "❌ ERROR: Please configure .env file first!"
    echo "   nano /home/xver/iq-option-Pro/.env"
    exit 1
fi

# Start with PM2
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "✅ Bot started!"
echo ""
echo "📊 Monitor commands:"
echo "   pm2 logs iqoption-bot    - View logs"
echo "   pm2 status               - Check status"
echo "   pm2 monit                - Monitor dashboard"
echo "   pm2 stop iqoption-bot    - Stop bot"
echo "   pm2 restart iqoption-bot - Restart bot"
EOF
chmod +x start_bot.sh
print_status "Start script created"

# STEP 15: Setup PM2 Startup
echo ""
echo "⚡ STEP 15: Setting up PM2 startup..."
echo "────────────────────────────────────────────────────────────"
env PATH=$PATH:/usr/bin pm2 startup systemd -u xver --hp /home/xver 2>/dev/null || pm2 startup systemd -u root --hp /root
pm2 save 2>/dev/null || true
print_status "PM2 startup configured"

# STEP 16: Create Systemd Service (backup method)
echo ""
echo "🔧 STEP 16: Creating systemd service..."
echo "────────────────────────────────────────────────────────────"
cat > /etc/systemd/system/iqoption-bot.service << 'EOF'
[Unit]
Description=IQ Option Trading Bot
After=network.target

[Service]
Type=forking
User=xver
WorkingDirectory=/home/xver/iq-option-Pro
ExecStart=/usr/bin/pm2 start ecosystem.config.js
ExecReload=/usr/bin/pm2 reload ecosystem.config.js
ExecStop=/usr/bin/pm2 stop ecosystem.config.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=VPS_MODE=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable iqoption-bot.service 2>/dev/null || true
print_status "Systemd service created"

# Final Summary
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     ✅ VPS SETUP COMPLETE!                                     ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 NEXT STEPS:"
echo ""
echo "   1️⃣  Configure credentials:"
echo "       nano /home/xver/iq-option-Pro/.env"
echo ""
echo "   2️⃣  Test the bot:"
echo "       cd /home/xver/iq-option-Pro"
echo "       node minimal_test.js"
echo ""
echo "   3️⃣  Start with PM2:"
echo "       ./start_bot.sh"
echo ""
echo "   4️⃣  Monitor:"
echo "       pm2 logs iqoption-bot"
echo ""
echo "   5️⃣  Check status:"
echo "       pm2 status"
echo ""
echo "📁 Installation directory: /home/xver/iq-option-Pro"
echo "📁 Logs directory: /home/xver/iq-option-Pro/logs"
echo ""
echo "🔧 Useful Commands:"
echo "   pm2 logs iqoption-bot        - Real-time logs"
echo "   pm2 monit                    - Dashboard"
echo "   pm2 stop iqoption-bot        - Stop bot"
echo "   pm2 restart iqoption-bot     - Restart bot"
echo "   systemctl status iqoption-bot - Systemd status"
echo ""
echo "⚠️  IMPORTANT:"
echo "   - Always start with DEMO mode first!"
echo "   - Check logs if bot doesn't start"
echo "   - Monitor network connectivity"
echo ""
