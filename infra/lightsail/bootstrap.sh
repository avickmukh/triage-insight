#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# infra/lightsail/bootstrap.sh
#
# Run ONCE on a fresh Lightsail Ubuntu 22.04 instance.
# Installs Docker, Docker Compose, AWS CLI, and sets up the deployment dir.
#
# Recommended instance: Lightsail 4 GB RAM / 2 vCPU / 80 GB SSD ($20/mo)
# Minimum instance:     Lightsail 2 GB RAM / 1 vCPU / 60 GB SSD ($10/mo)
#                       ⚠ 2 GB is tight — use only for demo/testing.
#
# Usage (as ubuntu user):
#   curl -fsSL https://raw.githubusercontent.com/avickmukh/triage-insight/main/infra/lightsail/bootstrap.sh | bash
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

echo "==> [1/7] Updating system packages..."
sudo apt-get update -y && sudo apt-get upgrade -y

echo "==> [2/7] Installing Docker Engine..."
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
sudo systemctl enable docker
sudo systemctl start docker

echo "==> [3/7] Installing Docker Compose v2..."
COMPOSE_VERSION="v2.24.5"
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
# Symlink for legacy `docker-compose` command
sudo ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose
docker compose version

echo "==> [4/7] Installing AWS CLI v2..."
sudo apt-get install -y unzip curl
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp/
sudo /tmp/aws/install --update
aws --version

echo "==> [5/7] Configuring UFW firewall..."
sudo ufw allow 22/tcp    comment "SSH"
sudo ufw allow 80/tcp    comment "HTTP (Nginx container)"
# Do NOT open 443 — CloudFront terminates HTTPS and forwards plain HTTP
# Do NOT open 3000/3001/5432/6379 — internal Docker network only
sudo ufw --force enable
sudo ufw status verbose

echo "==> [6/7] Creating deployment directory..."
mkdir -p /home/ubuntu/triage-insight
mkdir -p /home/ubuntu/triage-insight/backups

echo "==> [7/7] Setting up log rotation for Docker..."
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "5"
  }
}
EOF
sudo systemctl restart docker

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  Bootstrap complete!                                             ║"
echo "║                                                                  ║"
echo "║  Next steps:                                                     ║"
echo "║  1. Copy .env.production  →  ~/triage-insight/.env.production   ║"
echo "║  2. Copy docker-compose.production.yml  →  ~/triage-insight/    ║"
echo "║  3. Copy infra/lightsail/nginx-docker.conf  →  ~/triage-insight/infra/lightsail/ ║"
echo "║  4. Run the GitHub Actions workflow to deploy                    ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "  NOTE: Log out and back in (or run 'newgrp docker') for the"
echo "        docker group membership to take effect."
