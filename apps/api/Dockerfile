# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /build

RUN npm install -g pnpm@9

# Copy workspace manifests first (layer-cache friendly)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json                    ./apps/api/
COPY apps/worker/package.json                 ./apps/worker/
COPY packages/config/package.json             ./packages/config/
COPY packages/types/package.json              ./packages/types/
COPY packages/ui/package.json                 ./packages/ui/
COPY packages/i18n/package.json               ./packages/i18n/

# Copy Prisma schema before install so postinstall prisma generate works
COPY apps/api/prisma ./apps/api/prisma

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter api build

# ─── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /build/apps/api/dist          ./apps/api/dist
COPY --from=builder /build/apps/api/prisma        ./apps/api/prisma
COPY --from=builder /build/node_modules           ./node_modules
COPY --from=builder /build/apps/api/node_modules  ./apps/api/node_modules
COPY --from=builder /build/apps/api/package.json  ./apps/api/package.json
COPY --from=builder /build/package.json           ./package.json

USER appuser

EXPOSE 3000

# Run DB migrations then start API
CMD ["sh", "-c", "node node_modules/.bin/prisma migrate deploy --schema=apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
