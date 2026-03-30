#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# infra/lightsail/create-ecr-repos.sh
#
# Run ONCE from your local machine (with AWS CLI configured) to create the
# three ECR repositories needed for the deployment pipeline.
#
# Usage:
#   AWS_REGION=us-east-1 bash infra/lightsail/create-ecr-repos.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"

for repo in triage-insight-api triage-insight-worker triage-insight-web; do
  echo "==> Creating ECR repository: ${repo}"
  aws ecr create-repository \
    --repository-name "${repo}" \
    --region "${REGION}" \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256 \
    2>/dev/null || echo "    (already exists, skipping)"
done

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo ""
echo "==> ECR Registry URI:"
echo "    ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
echo ""
echo "==> Add this as the ECR_REGISTRY secret in GitHub Actions."
