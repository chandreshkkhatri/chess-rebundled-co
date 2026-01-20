#!/bin/bash

# SSL Setup Script for Oracle Linux
# Sets up Nginx reverse proxy with Let's Encrypt SSL
# Usage: ./setup-ssl.sh <domain>
# Example: ./setup-ssl.sh api.example.com

set -e

DOMAIN="${1}"
BACKEND_PORT="${2:-3001}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ -z "$DOMAIN" ]; then
    echo -e "${RED}Error: Domain is required${NC}"
    echo "Usage: $0 <domain> [backend-port]"
    echo "Example: $0 api.example.com 3001"
    exit 1
fi

echo -e "${GREEN}=== SSL Setup for $DOMAIN ===${NC}"
echo ""

# Detect package manager
if command -v dnf &> /dev/null; then
    PKG_INSTALL="sudo dnf install -y"
elif command -v yum &> /dev/null; then
    PKG_INSTALL="sudo yum install -y"
elif command -v apt-get &> /dev/null; then
    PKG_INSTALL="sudo apt-get install -y"
else
    echo -e "${RED}Error: No supported package manager found${NC}"
    exit 1
fi

# Step 1: Install Nginx
echo -e "${YELLOW}[1/5] Installing Nginx...${NC}"
$PKG_INSTALL nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# Step 2: Install Certbot
echo -e "${YELLOW}[2/5] Installing Certbot...${NC}"
if command -v certbot &> /dev/null; then
    echo "Certbot already installed"
elif command -v snap &> /dev/null; then
    # Use snap (preferred method)
    sudo snap install --classic certbot
    sudo ln -sf /snap/bin/certbot /usr/bin/certbot
elif command -v dnf &> /dev/null || command -v yum &> /dev/null; then
    # Oracle Linux / RHEL - try EPEL first, fall back to pip
    $PKG_INSTALL epel-release 2>/dev/null || true
    $PKG_INSTALL certbot python3-certbot-nginx 2>/dev/null || {
        echo "Installing certbot via pip..."
        $PKG_INSTALL python3 python3-pip
        sudo pip3 install certbot certbot-nginx
    }
else
    # Ubuntu/Debian
    $PKG_INSTALL certbot python3-certbot-nginx
fi

# Step 3: Configure Nginx
echo -e "${YELLOW}[3/5] Configuring Nginx...${NC}"

# Determine nginx config directory
if [ -d "/etc/nginx/conf.d" ]; then
    NGINX_CONF="/etc/nginx/conf.d/${DOMAIN}.conf"
else
    NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"
    NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"
fi

sudo tee $NGINX_CONF > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://localhost:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # WebSocket timeout settings
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
EOF

# Enable site (for Ubuntu-style config)
if [ -n "$NGINX_ENABLED" ] && [ ! -L "$NGINX_ENABLED" ]; then
    sudo ln -s $NGINX_CONF $NGINX_ENABLED
fi

# Test nginx config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# Step 4: Open firewall ports for HTTP/HTTPS
echo -e "${YELLOW}[4/5] Configuring firewall...${NC}"
if command -v firewall-cmd &> /dev/null && systemctl is-active --quiet firewalld; then
    sudo firewall-cmd --permanent --add-service=http
    sudo firewall-cmd --permanent --add-service=https
    sudo firewall-cmd --reload
    echo "Firewall configured for HTTP/HTTPS"
fi

# Step 5: Get SSL certificate
echo -e "${YELLOW}[5/5] Obtaining SSL certificate...${NC}"
echo ""
echo -e "${YELLOW}Make sure your domain $DOMAIN points to this server's IP before continuing.${NC}"
echo ""
read -p "Press Enter to continue with SSL certificate generation..."

sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN || {
    echo ""
    echo -e "${YELLOW}Certbot automatic mode failed. Running interactive mode...${NC}"
    sudo certbot --nginx -d $DOMAIN
}

# Setup auto-renewal
echo ""
echo -e "${YELLOW}Setting up auto-renewal...${NC}"
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo tee -a /var/spool/cron/root > /dev/null 2>&1 || \
    (sudo crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | sudo crontab -

echo ""
echo -e "${GREEN}=== SSL Setup Complete ===${NC}"
echo ""
echo "Your backend is now available at:"
echo "  https://$DOMAIN"
echo ""
echo "Update your frontend environment variable:"
echo "  NEXT_PUBLIC_SOCKET_URL=https://$DOMAIN"
echo ""
echo -e "${YELLOW}Don't forget to add HTTPS (443) to Oracle Cloud Security List!${NC}"
