# TriageInsight

TriageInsight is a feedback intelligence platform that transforms raw customer feedback into actionable product decisions using AI-powered theme clustering, CIQ scoring, and a prioritization board.

---

## Quick Start

For a complete step-by-step guide to running the platform locally, see the **[Local Development Guide](./docs/LOCAL_DEVELOPMENT_GUIDE.md)**.

### TL;DR

```bash
# 1. Clone and install
git clone https://github.com/avickmukh/triage-insight.git
cd triage-insight
pnpm install

# 2. Start infrastructure (PostgreSQL + Redis)
docker-compose up -d

# 3. Configure environment
cp .env.example .env
# Edit .env: set DATABASE_URL, JWT_SECRET, CORS_ORIGIN

# 4. Run database migrations
pnpm --filter api db:migrate

# 5. Start all services (API + Web + Worker)
pnpm dev
```

Once running, access the platform at:

- **Web App**: [http://localhost:3002](http://localhost:3002)
- **API**: [http://localhost:3000](http://localhost:3000)
- **API Docs (Swagger)**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

---

## Documentation

All project documentation is organized in the [`docs/`](./docs/README.md) folder. See the [Documentation Index](./docs/README.md) for a full list of available documents.

---

## Architecture

The project is a monorepo managed with `pnpm` and `Turborepo`, consisting of three applications:

| App | Description |
| :--- | :--- |
| `apps/api` | NestJS REST API server |
| `apps/web` | Next.js frontend application |
| `apps/worker` | Standalone NestJS BullMQ background worker |

Shared packages live in `packages/` (UI components, types, config, i18n).

## Docker

Dockerfiles are provided for the `api` and `worker` applications for production deployments. A `docker-compose.yml` is provided for running the local development infrastructure (PostgreSQL + Redis).

```bash
# Build the API image
docker build -t triage-insight-api -f apps/api/Dockerfile .

# Build the worker image
docker build -t triage-insight-worker -f apps/worker/Dockerfile .
```
