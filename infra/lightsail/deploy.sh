#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# infra/lightsail/deploy.sh
#
# Run on the Lightsail instance by the GitHub Actions deploy job (via SSH).
# Pulls the latest images and restarts all services with zero-downtime.
#
# Required env vars (set as GitHub Actions secrets / passed via SSH):
#   REGISTRY   — ECR registry URI, e.g. 123456789.dkr.ecr.us-east-1.amazonaws.com
#   IMAGE_TAG  — Git SHA or semver tag, e.g. abc1234
#   AWS_REGION — e.g. us-east-1
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DEPLOY_DIR="/home/ubuntu/triage-insight"

echo "==> Logging into ECR..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${REGISTRY}"

echo "==> Pulling images (tag: ${IMAGE_TAG})..."
docker pull "${REGISTRY}/triage-insight-api:${IMAGE_TAG}"
docker pull "${REGISTRY}/triage-insight-worker:${IMAGE_TAG}"
docker pull "${REGISTRY}/triage-insight-web:${IMAGE_TAG}"

echo "==> Updating image tags in compose env..."
cd "${DEPLOY_DIR}"
export REGISTRY IMAGE_TAG

echo "==> Running migrations..."
docker-compose -f docker-compose.production.yml run --rm migrate

echo "==> Restarting services..."
docker-compose -f docker-compose.production.yml up -d --no-build api worker web

echo "==> Removing dangling images..."
docker image prune -f

echo "==> Deploy complete (tag: ${IMAGE_TAG})"
