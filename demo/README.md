# TriageInsight Demo Automation

This directory contains the full end-to-end demo automation for TriageInsight, including a Playwright browser recording script and a data seeding script.

## Directory Structure

```
demo/
├── README.md               — This file
├── seed-demo.js            — Node.js script to seed realistic demo data via the live API
└── playwright/
    └── demo.js             — Playwright script that records the full product walkthrough
```

## Prerequisites

Before running either script, ensure the following services are running locally:

| Service | Port | Start Command |
|---|---|---|
| API (NestJS) | 3000 | `pnpm dev --filter @triage-insight/api` |
| Web (Next.js) | 3002 | `pnpm dev --filter @triage-insight/web` |
| PostgreSQL | 5432 | `sudo systemctl start postgresql` |
| Redis | 6379 | `sudo systemctl start redis-server` |

Also ensure the API `.env` file is configured (see `apps/api/.env.example`) and the database migrations have been applied:

```bash
cd apps/api && npx prisma migrate deploy
```

## Step 1 — Seed Demo Data

The seed script creates a complete demo organisation with realistic data via the live API endpoints.

```bash
node demo/seed-demo.js
```

This creates the following data:

| Entity | Count | Details |
|---|---|---|
| Organisation | 1 | Acme SaaS (`acme-saas`) |
| Admin user | 1 | `founder@acme.com` / `Demo1234!` |
| Staff users | 2 | `support@acme.com`, `pm@acme.com` |
| Feedback entries | 16 | Feature requests, bug reports, churn signals |
| Customers | 8 | Enterprise, Mid-Market, SMB with ARR values |
| Themes | 6 | AI-clustered feedback themes |
| Roadmap items | 8 | Across BACKLOG, EXPLORING, PLANNED, COMMITTED |
| Support tickets | 12 | Open and resolved, with tags and ARR |

## Step 2 — Record the Demo Video

The Playwright script navigates through all 13 product screens, simulating human-like pauses and scrolling, and records a `.webm` video.

```bash
# Install dependencies (first time only)
cd demo/playwright
npm install playwright
npx playwright install chromium

# Run the recording
node demo/playwright/demo.js
```

The raw video is saved to `demo/playwright/videos/` and copied to `demo/playwright/raw-demo.webm`.

## Step 3 — Post-Process the Video (Optional)

To add the intro/outro title cards and export as MP4, use `ffmpeg`:

```bash
# Intro card: "TriageInsight — Autonomous Customer Intelligence"
# Outro card: "From Noise to North Star"

ffmpeg -y -f concat -safe 0 -i /tmp/concat.txt \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
  -movflags +faststart docs/triageinsight-demo.mp4
```

The full post-processing script is available in the CI/CD pipeline or can be recreated from the instructions in `docs/demo-report.md`.

## Demo Narrative (13 Steps)

1. Landing page overview
2. Login with admin credentials
3. Admin dashboard — Executive Intelligence panel
4. Team members management
5. Public feedback portal
6. Submit a new feedback entry
7. Feedback inbox and AI theme clustering
8. AI priority signals and intelligence
9. Support intelligence overview
10. Support ticket trends
11. Churn intelligence and at-risk customers
12. Roadmap prioritization board
13. Settings and billing page
