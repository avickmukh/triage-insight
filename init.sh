#!/usr/bin/env bash
# TriageInsight — First-time local setup script
# Usage: bash init.sh
# Run this once after cloning the repo.

set -e

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

info()    { echo -e "${BOLD}[init]${RESET} $*"; }
success() { echo -e "${GREEN}[ok]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[warn]${RESET} $*"; }
error()   { echo -e "${RED}[error]${RESET} $*"; exit 1; }

echo ""
echo -e "${BOLD}TriageInsight — Local Setup${RESET}"
echo "────────────────────────────────────────"
echo ""

# ─── 1. Check prerequisites ───────────────────────────────────────────────────
info "Checking prerequisites..."

command -v node  >/dev/null 2>&1 || error "Node.js is not installed. Install v20+ from https://nodejs.org"
command -v pnpm  >/dev/null 2>&1 || error "pnpm is not installed. Run: npm install -g pnpm"
command -v docker >/dev/null 2>&1 || error "Docker is not installed. Install from https://docs.docker.com/get-docker/"

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  error "Node.js v20+ is required. Current: $(node -v)"
fi

success "Node $(node -v), pnpm $(pnpm -v), Docker $(docker -v | awk '{print $3}' | tr -d ',')"

# ─── 2. Copy .env if not present ──────────────────────────────────────────────
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    warn ".env created from .env.example"
    warn "  → Open .env and fill in OPENAI_API_KEY and JWT_SECRET before continuing."
    echo ""
    read -p "Press Enter once you have updated .env to continue, or Ctrl+C to abort: "
  else
    error ".env.example not found. Cannot create .env."
  fi
else
  success ".env already exists"
fi

# ─── 3. Validate critical env vars ────────────────────────────────────────────
source .env 2>/dev/null || true
if [ -z "$OPENAI_API_KEY" ] || [ "$OPENAI_API_KEY" = "sk-your-openai-key-here" ]; then
  error "OPENAI_API_KEY is not set in .env. All AI features will fail without it."
fi
if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "change-me-in-production" ]; then
  warn "JWT_SECRET is using the default value. Change it in .env for security."
fi
success "Critical env vars validated"

# ─── 4. Start Docker services ─────────────────────────────────────────────────
info "Starting Docker services (postgres + redis)..."
docker-compose up -d postgres redis

info "Waiting for postgres to be healthy..."
for i in $(seq 1 30); do
  if docker-compose exec -T postgres pg_isready -U triage -d triageinsight >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    error "Postgres did not become healthy after 30 attempts. Check: docker-compose logs postgres"
  fi
  sleep 1
done
success "Postgres is healthy"

info "Waiting for redis to be healthy..."
for i in $(seq 1 15); do
  if docker-compose exec -T redis redis-cli ping >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 15 ]; then
    error "Redis did not respond after 15 attempts. Check: docker-compose logs redis"
  fi
  sleep 1
done
success "Redis is healthy"

# ─── 5. Install dependencies ──────────────────────────────────────────────────
info "Installing workspace dependencies..."
pnpm install
success "Dependencies installed"

# ─── 6. Run database migrations ───────────────────────────────────────────────
info "Running Prisma migrations..."
cd apps/api
npx prisma migrate deploy
success "Migrations applied"

# ─── 7. Seed the database ─────────────────────────────────────────────────────
info "Seeding the database..."
npx prisma db seed 2>/dev/null && success "Database seeded" || warn "Seed script not found or failed — skipping"
cd ../..

# ─── 8. Done ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Setup complete!${RESET}"
echo ""
echo "  Start the platform:  ${BOLD}pnpm dev${RESET}"
echo ""
echo "  Services:"
echo "    Web    → http://localhost:3000"
echo "    API    → http://localhost:3001"
echo "    Prisma → cd apps/api && npx prisma studio"
echo ""
echo "  Stop Docker:  ${BOLD}docker-compose down${RESET}"
echo ""
