#!/bin/bash

# Oracle Cloud VM Initial Setup Script
# Run this ONCE on the Oracle VM to set up the environment
# Supports both Oracle Linux (yum/dnf) and Ubuntu (apt)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Oracle Cloud VM Setup for Chess Rebundled ===${NC}"
echo ""

# Detect package manager
if command -v dnf &> /dev/null; then
    PKG_MANAGER="dnf"
    PKG_INSTALL="sudo dnf install -y"
    PKG_UPDATE="sudo dnf update -y"
elif command -v yum &> /dev/null; then
    PKG_MANAGER="yum"
    PKG_INSTALL="sudo yum install -y"
    PKG_UPDATE="sudo yum update -y"
elif command -v apt-get &> /dev/null; then
    PKG_MANAGER="apt"
    PKG_INSTALL="sudo apt-get install -y"
    PKG_UPDATE="sudo apt-get update && sudo apt-get upgrade -y"
else
    echo -e "${RED}Error: No supported package manager found${NC}"
    exit 1
fi

echo "Detected package manager: $PKG_MANAGER"
echo ""

# Update system
echo -e "${YELLOW}[1/5] Updating system packages...${NC}"
eval $PKG_UPDATE || true

# Install Node.js 20.x
echo -e "${YELLOW}[2/5] Installing Node.js 20.x...${NC}"
if ! command -v node &> /dev/null; then
    if [ "$PKG_MANAGER" = "apt" ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        # For Oracle Linux / RHEL / CentOS
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        $PKG_INSTALL nodejs
    fi
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
if ! command -v git &> /dev/null; then
    $PKG_INSTALL git
fi
echo "Git version: $(git --version)"

# Configure firewall
echo -e "${YELLOW}[5/5] Configuring firewall for port 3001...${NC}"

# Check if firewalld is running (Oracle Linux default)
if command -v firewall-cmd &> /dev/null && systemctl is-active --quiet firewalld; then
    echo "Using firewalld..."
    sudo firewall-cmd --permanent --add-port=3001/tcp
    sudo firewall-cmd --reload
    echo "Firewall rule added for port 3001"
# Check for iptables
elif command -v iptables &> /dev/null; then
    echo "Using iptables..."
    if ! sudo iptables -C INPUT -p tcp --dport 3001 -j ACCEPT 2>/dev/null; then
        sudo iptables -I INPUT -p tcp --dport 3001 -j ACCEPT
        echo "Firewall rule added for port 3001"

        # Try to save iptables rules
        if command -v netfilter-persistent &> /dev/null; then
            sudo netfilter-persistent save
        elif [ -f /etc/sysconfig/iptables ]; then
            sudo iptables-save | sudo tee /etc/sysconfig/iptables > /dev/null
        fi
    else
        echo "Firewall rule for port 3001 already exists"
    fi
else
    echo -e "${YELLOW}Warning: Could not configure firewall automatically${NC}"
    echo "Please manually open port 3001"
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
echo "Then deploy from your local machine with:"
echo "  ./scripts/deploy-backend.sh <this-server-ip> <ssh-key> opc"
