#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# infra/lightsail/bootstrap.sh
#
# Run ONCE on a fresh Lightsail Ubuntu 22.04 instance to install Docker,
# AWS CLI, and set up the deployment directory.
#
# Usage (as ubuntu user):
#   curl -fsSL https://raw.githubusercontent.com/avickmukh/triage-insight/main/infra/lightsail/bootstrap.sh | bash
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

echo "==> Updating system packages..."
sudo apt-get update -y && sudo apt-get upgrade -y

echo "==> Installing Docker..."
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
sudo systemctl enable docker
sudo systemctl start docker

echo "==> Installing Docker Compose plugin..."
sudo apt-get install -y docker-compose-plugin
# Also install the legacy standalone for compatibility
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-linux-x86_64" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

echo "==> Installing AWS CLI v2..."
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
sudo apt-get install -y unzip
unzip /tmp/awscliv2.zip -d /tmp/
sudo /tmp/aws/install
rm -rf /tmp/awscliv2.zip /tmp/aws

echo "==> Creating deployment directory..."
mkdir -p /home/ubuntu/triage-insight

echo "==> Configuring UFW firewall..."
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (Nginx reverse proxy)
sudo ufw allow 443/tcp   # HTTPS (Nginx reverse proxy)
sudo ufw allow 3000/tcp  # API (internal, can restrict later)
sudo ufw allow 3001/tcp  # Web (internal, can restrict later)
sudo ufw --force enable

echo "==> Installing Nginx (reverse proxy)..."
sudo apt-get install -y nginx
sudo systemctl enable nginx

echo ""
echo "==> Bootstrap complete!"
echo "    Next steps:"
echo "    1. Copy .env.production to /home/ubuntu/triage-insight/.env.production"
echo "    2. Copy docker-compose.production.yml to /home/ubuntu/triage-insight/"
echo "    3. Configure Nginx: copy infra/lightsail/nginx.conf to /etc/nginx/sites-available/triage-insight"
echo "    4. Run: sudo ln -s /etc/nginx/sites-available/triage-insight /etc/nginx/sites-enabled/"
echo "    5. Run: sudo nginx -t && sudo systemctl reload nginx"
echo "    6. Run the deploy script to pull images and start services"
