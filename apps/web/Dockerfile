# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /build

RUN npm install -g pnpm@9

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json                    ./apps/web/
COPY apps/api/package.json                    ./apps/api/
COPY apps/worker/package.json                 ./apps/worker/
COPY packages/config/package.json             ./packages/config/
COPY packages/types/package.json              ./packages/types/
COPY packages/ui/package.json                 ./packages/ui/
COPY packages/i18n/package.json               ./packages/i18n/

RUN pnpm install --frozen-lockfile

COPY . .

# NEXT_PUBLIC vars must be available at build time
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

RUN pnpm --filter @triage-insight/web build

# ─── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Next.js standalone output bundles everything needed
COPY --from=builder /build/apps/web/.next/standalone  ./
COPY --from=builder /build/apps/web/.next/static       ./apps/web/.next/static
COPY --from=builder /build/apps/web/public             ./apps/web/public

USER appuser

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
