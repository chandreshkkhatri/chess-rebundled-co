#!/bin/bash

# Oracle Cloud VM Initial Setup Script
# Run this ONCE on the Oracle VM to set up the environment
# Usage: curl -fsSL <raw-url> | bash
#    or: ./setup-oracle-vm.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Oracle Cloud VM Setup for Chess Rebundled ===${NC}"
echo ""

# Update system
echo -e "${YELLOW}[1/5] Updating system packages...${NC}"
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js 20.x
echo -e "${YELLOW}[2/5] Installing Node.js 20.x...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

# Install PM2
echo -e "${YELLOW}[3/5] Installing PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi
echo "PM2 version: $(pm2 --version)"

# Install git
echo -e "${YELLOW}[4/5] Installing git...${NC}"
sudo apt-get install -y git

# Configure firewall (iptables)
echo -e "${YELLOW}[5/5] Configuring firewall for port 3001...${NC}"

# Check if rule already exists
if ! sudo iptables -C INPUT -p tcp --dport 3001 -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3001 -j ACCEPT
    echo "Firewall rule added for port 3001"
else
    echo "Firewall rule for port 3001 already exists"
fi

# Save iptables rules
if command -v netfilter-persistent &> /dev/null; then
    sudo netfilter-persistent save
else
    sudo apt-get install -y iptables-persistent
    sudo netfilter-persistent save
fi

echo ""
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT: You still need to configure Oracle Cloud Security List${NC}"
echo ""
echo "In Oracle Cloud Console:"
echo "  1. Go to Networking → Virtual Cloud Networks → Your VCN"
echo "  2. Click on your Subnet → Security Lists"
echo "  3. Add Ingress Rule:"
echo "     - Source CIDR: 0.0.0.0/0"
echo "     - Protocol: TCP"
echo "     - Destination Port: 3001"
echo ""
echo "Then deploy with:"
echo "  ./scripts/deploy-backend.sh <this-server-ip>"
