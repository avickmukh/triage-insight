#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# infra/lightsail/deploy.sh
#
# Called by GitHub Actions via SSH on every push to main.
# Pulls the three app images (api, worker, web) from ECR and restarts them.
# PostgreSQL and Redis containers are NEVER restarted by this script —
# they are stateful and only restart if they crash (restart: unless-stopped).
#
# Required env vars (injected by GitHub Actions):
#   REGISTRY   — ECR registry URI
#   IMAGE_TAG  — Git SHA or semver tag
#   AWS_REGION — e.g. us-east-1
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DEPLOY_DIR="/home/ubuntu/triage-insight"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.production.yml"

echo "==> [1/6] Logging into ECR (region: ${AWS_REGION})..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${REGISTRY}"

echo "==> [2/6] Pulling app images (tag: ${IMAGE_TAG})..."
docker pull "${REGISTRY}/triage-insight-api:${IMAGE_TAG}"
docker pull "${REGISTRY}/triage-insight-worker:${IMAGE_TAG}"
docker pull "${REGISTRY}/triage-insight-web:${IMAGE_TAG}"

cd "${DEPLOY_DIR}"
export REGISTRY IMAGE_TAG

echo "==> [3/6] Ensuring postgres and redis are running..."
docker compose -f "${COMPOSE_FILE}" up -d --no-recreate postgres redis

echo "==> [4/6] Running database migrations..."
docker compose -f "${COMPOSE_FILE}" run --rm migrate

echo "==> [5/6] Restarting app services (zero-downtime for stateless services)..."
docker compose -f "${COMPOSE_FILE}" up -d --no-build --force-recreate api worker web nginx

echo "==> [6/6] Cleaning up dangling images..."
docker image prune -f

echo ""
echo "✓ Deploy complete (tag: ${IMAGE_TAG})"
echo "  Running containers:"
docker compose -f "${COMPOSE_FILE}" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
