# TriageInsight Local Development Guide

**Version:** 1.0  
**Date:** March 28, 2026  
**Author:** Manus AI

---

## 1. Introduction

This guide provides step-by-step instructions for setting up and running the TriageInsight platform on a local machine for development purposes. The platform is a monorepo managed with `pnpm` and `Turborepo`, consisting of three main applications:

| Application | Path                | Description                                                                 |
| :---------- | :------------------ | :-------------------------------------------------------------------------- |
| **Web**     | `apps/web/`         | The Next.js frontend application.                                           |
| **API**     | `apps/api/`         | The NestJS backend server that provides the REST API.                       |
| **Worker**  | `apps/worker/`      | A standalone NestJS application that processes background jobs using BullMQ. |

This guide uses Docker and Docker Compose to simplify the setup of the required backing services (PostgreSQL and Redis).

## 2. Prerequisites

Before you begin, ensure you have the following software installed on your system:

- **Node.js**: Version 18.x or later.
- **pnpm**: The package manager used for this monorepo. Install via `npm install -g pnpm`.
- **Docker**: The containerization platform.
- **Docker Compose**: The tool for defining and running multi-container Docker applications.
- **Git**: For cloning the repository.
- **OpenSSL**: (Optional, recommended) For generating a secure `JWT_SECRET`.

## 3. Step-by-Step Setup

### Step 1: Clone the Repository

Open your terminal and clone the TriageInsight repository:

```bash
git clone https://github.com/avickmukh/triage-insight.git
cd triage-insight
```

### Step 2: Install Dependencies

Install all project dependencies using `pnpm`. This will install dependencies for all apps and packages in the monorepo.

```bash
pnpm install
```

### Step 3: Start Infrastructure Services

The project requires a PostgreSQL database (with the `pgvector` extension) and a Redis instance. A `docker-compose.yml` file is provided to set these up automatically.

From the root of the project, run:

```bash
docker-compose up -d
```

This command will download the required images and start the containers in the background. You can verify they are running with `docker ps`.

- **PostgreSQL** will be available on `localhost:5432`.
- **Redis** will be available on `localhost:6379`.

### Step 4: Configure Environment Variables

Next, you need to set up the environment variables for the API and worker applications. Copy the example file to a new `.env` file:

```bash
cp .env.example .env
```

Now, open the `.env` file in your editor and fill in the following **required** values:

1.  **`DATABASE_URL`**: This is the connection string for the PostgreSQL database running in Docker. Use the following value:

    ```ini
    DATABASE_URL="postgresql://triage:triage@localhost:5432/triageinsight?schema=public"
    ```

2.  **`JWT_SECRET`**: This is a secret key for signing authentication tokens. Generate a secure, random 32-character string. You can use OpenSSL for this:

    ```bash
    openssl rand -hex 32
    ```

    Copy the output and paste it into your `.env` file:

    ```ini
    JWT_SECRET="your_generated_secret_string_here"
    ```

3.  **`CORS_ORIGIN`**: For local development, set this to the URL of the web application to allow cross-origin requests.

    ```ini
    CORS_ORIGIN="http://localhost:3002"
    ```

The other variables in `.env` (for Redis, OpenAI, AWS S3, etc.) have safe defaults for local development and can be left as they are. The application is designed to degrade gracefully if optional services like OpenAI or S3 are not configured.

### Step 5: Run Database Migrations

With the database container running and the `.env` file configured, apply the database schema using Prisma Migrate.

```bash
pnpm --filter api db:migrate
```

This command executes the `prisma migrate deploy` script for the `api` application, which applies all existing migrations to your database to create the necessary tables and extensions (`pgvector`).

### Step 6: Run the Applications

The easiest way to run all three applications (API, web, worker) simultaneously is to use the root `dev` script, which leverages Turborepo.

Open a **single terminal** in the project root and run:

```bash
pnpm dev
```

This will start all services in parallel with hot-reloading enabled. You will see interleaved logs from all three applications in your terminal.

#### Alternative: Running Services Separately

If you prefer to run each service in its own terminal to keep the logs separate, you can run these commands in three different terminals:

```bash
# Terminal 1: Start the API Server
pnpm --filter api start:dev

# Terminal 2: Start the Web Application
pnpm --filter web dev

# Terminal 3: Start the Background Worker
pnpm --filter worker start:dev
```

### Step 7: Access the Platform

Once the applications are running, you can access them in your browser:

- **Web Application**: [http://localhost:3002](http://localhost:3002)
- **API Server**: [http://localhost:3000](http://localhost:3000)
- **API Documentation (Swagger)**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

## 4. Stopping the Environment

1.  **Stop the Applications**: Press `Ctrl+C` in the terminal(s) where the applications are running.

2.  **Stop the Infrastructure**: To stop the PostgreSQL and Redis containers, run:

    ```bash
    docker-compose down
    ```

    To stop the containers **and delete all data** (database contents, Redis cache), add the `-v` flag:

    ```bash
    docker-compose down -v
    ```

## 5. Troubleshooting

- **Port Conflicts**: If you have other services running on ports `3000`, `3002`, `5432`, or `6379`, you will need to stop them or change the port mappings in the `package.json` scripts and `docker-compose.yml` file.
- **`pnpm install` fails**: Ensure you are using Node.js v18 or higher.
- **Database connection errors**: Double-check that your Docker containers are running (`docker ps`) and that the `DATABASE_URL` in your `.env` file is correct.
- **`db:migrate` fails**: Ensure the database container is running and accessible. If it persists, you can try resetting the database with `docker-compose down -v`, `docker-compose up -d`, and then running the migration command again.
