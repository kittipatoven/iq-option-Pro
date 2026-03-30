#!/bin/bash
# One-command deployment for VPS
# Copy this to your VPS and run as root

echo "🔥 IQ OPTION BOT - VPS DEPLOYMENT"
echo "=================================="

# Download and run setup script
curl -fsSL https://raw.githubusercontent.com/kittipatoven/iq-option-Pro/main/vps_setup.sh -o /tmp/vps_setup.sh
bash /tmp/vps_setup.sh
