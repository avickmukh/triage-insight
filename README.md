# triage-insight
Triage Insight codebase

## Local Development

### Prerequisites

- Node.js (v18+)
- pnpm
- Docker and Docker Compose
- A local PostgreSQL database
- A local Redis instance

### 1. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/avickmukh/triage-insight.git
cd triage-insight
pnpm install
```

### 2. Environment Setup

Copy the example environment file and fill in the required values:

```bash
cp .env.example .env
```

You will need to provide:

- `DATABASE_URL`: Your PostgreSQL connection string.
- `JWT_SECRET`: A secure random string for signing tokens.
- `REDIS_HOST` and `REDIS_PORT`: Connection details for your Redis instance.

### 3. Database Migration

Apply the Prisma schema to your database:

```bash
pnpm --filter api prisma migrate dev
```

### 4. Running the Applications

You can run the API, web, and worker applications in separate terminals:

```bash
# Terminal 1: API Server
pnpm --filter api start:dev

# Terminal 2: Web Application
pnpm --filter web start:dev

# Terminal 3: Worker Process
pnpm --filter worker start:dev
```

The applications will be available at:

- **API:** `http://localhost:3000`
- **Web:** `http://localhost:3001`

## Docker

Dockerfiles are provided for the `api` and `worker` applications for production deployments.

### Building the Images

From the root of the monorepo, run:

```bash
# Build the API image
docker build -t triage-insight-api -f apps/api/Dockerfile .

# Build the worker image
docker build -t triage-insight-worker -f apps/worker/Dockerfile .
```

### Running with Docker Compose

A `docker-compose.yml` file is recommended for running the full stack in production. An example is not yet provided.
