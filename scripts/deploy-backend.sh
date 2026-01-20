#!/bin/bash

# Chess Rebundled Backend Deployment Script for Oracle Cloud VM
# Usage: ./scripts/deploy-backend.sh <server-ip> [ssh-key-path] [ssh-user]
#
# Example:
#   ./scripts/deploy-backend.sh 192.168.1.100
#   ./scripts/deploy-backend.sh 192.168.1.100 ~/.ssh/oracle_key
#   ./scripts/deploy-backend.sh 192.168.1.100 ~/.ssh/oracle_key opc

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SERVER_IP="${1}"
SSH_KEY="${2:-~/.ssh/id_rsa}"
SSH_USER="${3:-opc}"  # Oracle Cloud default is 'opc' for Oracle Linux
REMOTE_DIR="/home/$SSH_USER/chess-rebundled"
APP_NAME="chess-backend"

# Validate arguments
if [ -z "$SERVER_IP" ]; then
    echo -e "${RED}Error: Server IP is required${NC}"
    echo "Usage: $0 <server-ip> [ssh-key-path] [ssh-user]"
    echo "  ssh-user defaults to 'opc' (use 'ubuntu' for Ubuntu images)"
    exit 1
fi

echo -e "${GREEN}=== Chess Rebundled Backend Deployment ===${NC}"
echo "Server: $SSH_USER@$SERVER_IP"
echo "SSH Key: $SSH_KEY"
echo ""

# Function to run commands on remote server
run_remote() {
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "$1"
}

# Step 1: Check SSH connection
echo -e "${YELLOW}[1/7] Testing SSH connection...${NC}"
if ! run_remote "echo 'SSH connection successful'"; then
    echo -e "${RED}Failed to connect to server${NC}"
    exit 1
fi

# Step 2: Install Node.js if not present
echo -e "${YELLOW}[2/7] Checking Node.js installation...${NC}"
if ! run_remote "command -v node &> /dev/null"; then
    echo "Installing Node.js 20.x..."
    run_remote "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
fi
run_remote "node --version"

# Step 3: Install PM2 if not present
echo -e "${YELLOW}[3/7] Checking PM2 installation...${NC}"
if ! run_remote "command -v pm2 &> /dev/null"; then
    echo "Installing PM2..."
    run_remote "sudo npm install -g pm2"
fi

# Step 4: Create directory and sync files
echo -e "${YELLOW}[4/7] Syncing backend files...${NC}"
run_remote "mkdir -p $REMOTE_DIR/backend"

# Use rsync to copy backend files (excluding node_modules and dist)
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude '.env' \
    -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
    ./backend/ "$SSH_USER@$SERVER_IP:$REMOTE_DIR/backend/"

echo "Files synced successfully"

# Step 5: Install dependencies and build
echo -e "${YELLOW}[5/7] Installing dependencies and building...${NC}"
run_remote "cd $REMOTE_DIR/backend && npm install && npm run build"

# Step 6: Configure environment
echo -e "${YELLOW}[6/7] Configuring environment...${NC}"
read -p "Enter your frontend URL (e.g., https://your-app.vercel.app): " CLIENT_URL
CLIENT_URL="${CLIENT_URL:-http://localhost:3000}"

run_remote "cat > $REMOTE_DIR/backend/.env << EOF
PORT=3001
HOST=0.0.0.0
CLIENT_URL=$CLIENT_URL
EOF"

# Step 7: Start/restart with PM2
echo -e "${YELLOW}[7/7] Starting application with PM2...${NC}"
run_remote "cd $REMOTE_DIR/backend && pm2 delete $APP_NAME 2>/dev/null || true && pm2 start dist/index.js --name $APP_NAME"
run_remote "pm2 save"

# Setup PM2 to start on boot (only needs to be done once)
run_remote "pm2 startup 2>/dev/null | tail -1 | sudo bash || true"

echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo "Backend is running at: http://$SERVER_IP:3001"
echo ""
echo -e "${YELLOW}Important: Make sure port 3001 is open in Oracle Cloud Security List${NC}"
echo ""
echo "Useful commands:"
echo "  View logs:     ssh -i $SSH_KEY $SSH_USER@$SERVER_IP 'pm2 logs $APP_NAME'"
echo "  Restart:       ssh -i $SSH_KEY $SSH_USER@$SERVER_IP 'pm2 restart $APP_NAME'"
echo "  Stop:          ssh -i $SSH_KEY $SSH_USER@$SERVER_IP 'pm2 stop $APP_NAME'"
echo "  Status:        ssh -i $SSH_KEY $SSH_USER@$SERVER_IP 'pm2 status'"
echo ""
echo "Set this in your frontend environment:"
echo "  NEXT_PUBLIC_SOCKET_URL=http://$SERVER_IP:3001"
