#!/bin/bash

# Production VPS Setup Script
# Run this on your VPS to set up the bot for 24/7 operation

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     🤖 IQ Option Bot - VPS Production Setup                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Update system
echo "📦 Updating system packages..."
apt-get update && apt-get upgrade -y

# Install Node.js 20
echo "📦 Installing Node.js 20..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ NPM version: $(npm --version)"

# Install PM2 globally
echo "📦 Installing PM2..."
npm install -g pm2

# Install Git
echo "📦 Installing Git..."
apt-get install -y git

# Install build tools (for native modules)
echo "📦 Installing build tools..."
apt-get install -y build-essential python3

# Create app directory
APP_DIR="/root/iq-option-bot"
echo "📁 Creating app directory: $APP_DIR"
mkdir -p $APP_DIR
cd $APP_DIR

# Clone repository (or you can upload files manually)
# git clone https://github.com/your-repo/iq-option-bot.git .

echo ""
echo "📋 Manual Steps Required:"
echo "   1. Upload your bot files to: $APP_DIR"
echo "   2. Create .env file with your credentials"
echo "   3. Run: npm install"
echo "   4. Run: pm2 start ecosystem.config.js"
echo ""

# Setup PM2 startup script
echo "⚙️  Setting up PM2 startup..."
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root

# Create log directory
echo "📁 Creating log directory..."
mkdir -p $APP_DIR/logs

echo ""
echo "✅ VPS setup complete!"
echo ""
echo "Next steps:"
echo "   1. Upload bot code to $APP_DIR"
echo "   2. cd $APP_DIR && npm install"
echo "   3. Configure .env file"
echo "   4. pm2 start ecosystem.config.js"
echo "   5. pm2 save"
echo ""
echo "Monitor: pm2 monit"
echo "Logs: pm2 logs"
echo ""
