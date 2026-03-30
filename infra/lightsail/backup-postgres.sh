#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# infra/lightsail/backup-postgres.sh
#
# Creates a compressed pg_dump backup of the self-hosted PostgreSQL container
# and optionally uploads it to S3.
#
# Schedule with cron (daily at 02:00):
#   0 2 * * * /home/ubuntu/triage-insight/infra/lightsail/backup-postgres.sh >> /var/log/triage-backup.log 2>&1
#
# Required env vars (sourced from .env.production):
#   POSTGRES_USER, POSTGRES_DB, POSTGRES_PASSWORD, AWS_S3_BUCKET, AWS_REGION
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DEPLOY_DIR="/home/ubuntu/triage-insight"
BACKUP_DIR="${DEPLOY_DIR}/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/postgres_${TIMESTAMP}.sql.gz"

# Source production env vars
# shellcheck disable=SC1091
set -a && source "${DEPLOY_DIR}/.env.production" && set +a

mkdir -p "${BACKUP_DIR}"

echo "[$(date -Iseconds)] Starting PostgreSQL backup..."

# Run pg_dump inside the running postgres container, pipe through gzip
docker exec triage-postgres \
  pg_dump \
    --username="${POSTGRES_USER}" \
    --dbname="${POSTGRES_DB}" \
    --no-password \
    --format=plain \
    --clean \
    --if-exists \
  | gzip > "${BACKUP_FILE}"

BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
echo "[$(date -Iseconds)] Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# ── Upload to S3 (optional but strongly recommended) ─────────────────────────
if [[ -n "${AWS_S3_BUCKET:-}" ]]; then
  S3_KEY="backups/postgres/postgres_${TIMESTAMP}.sql.gz"
  echo "[$(date -Iseconds)] Uploading to s3://${AWS_S3_BUCKET}/${S3_KEY}..."
  aws s3 cp "${BACKUP_FILE}" "s3://${AWS_S3_BUCKET}/${S3_KEY}" \
    --region "${AWS_REGION:-us-east-1}" \
    --storage-class STANDARD_IA
  echo "[$(date -Iseconds)] Upload complete."
fi

# ── Prune local backups older than 7 days ────────────────────────────────────
find "${BACKUP_DIR}" -name "postgres_*.sql.gz" -mtime +7 -delete
echo "[$(date -Iseconds)] Old local backups pruned (kept last 7 days)."

echo "[$(date -Iseconds)] Backup finished successfully."
