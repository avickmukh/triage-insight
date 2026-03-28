

# TriageInsight: Local End-to-End Testing Runbook

**Objective:** This document provides a step-by-step guide to set up and run the entire TriageInsight platform locally for end-to-end testing of all MVP features. It incorporates findings from the full codebase audit.

---

### 1. Prerequisites

Ensure you have the following software installed on your machine:

- **Node.js**: v18 or higher
- **pnpm**: `npm install -g pnpm`
- **Docker** & **Docker Compose**: For running backing services (PostgreSQL, Redis).
- **Git**: For cloning the repository.

---

### 2. One-Time Local Setup

Follow these steps to configure the project for the first time.

#### Step 1: Clone the Repository

```bash
git clone https://github.com/avickmukh/triage-insight.git
cd triage-insight
```

#### Step 2: Install Dependencies

This command installs all dependencies for the API, web, and worker applications.

```bash
pnpm install
```

#### Step 3: Configure Environment Variables

This is the most critical step. You need to provide secrets, especially your **OpenAI API key**.

1.  Create a `.env` file in the root of the project:

    ```bash
    touch .env
    ```

2.  Copy the entire block below and paste it into your new `.env` file. 

3.  **IMPORTANT:** Replace the placeholder values for `JWT_SECRET` and `OPENAI_API_KEY`.

```ini
# TriageInsight Local Environment
# Paste this entire block into your .env file

# ─── Application Settings ───────────────────────────────────────────────────
NODE_ENV=development
PORT=3000

# ─── Required Secrets ───────────────────────────────────────────────────────
# Replace with a new 32-character random string (e.g., run `openssl rand -hex 32` in your terminal)
JWT_SECRET="your_super_secret_jwt_key_here_32_chars_long"

# Replace with your actual OpenAI API key
OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# ─── Database & Redis (Docker) ──────────────────────────────────────────────
DATABASE_URL="postgresql://triage:triage@localhost:5432/triageinsight?schema=public"
REDIS_HOST=localhost
REDIS_PORT=6379

# ─── Web App URL ────────────────────────────────────────────────────────────
# This should match the port in apps/web/package.json dev script
CORS_ORIGIN=http://localhost:3002

# ─── Optional Services (can be left as is for local testing) ──────────────
AWS_S3_BUCKET=local-triage-bucket
AWS_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=dummy
AWS_SECRET_ACCESS_KEY=dummy

EMAIL_PROVIDER=console

STRIPE_SECRET_KEY=dummy
STRIPE_WEBHOOK_SECRET=dummy
```

#### Step 4: Start Infrastructure

This command starts the PostgreSQL and Redis containers in the background using Docker.

```bash
docker-compose up -d
```

#### Step 5: Run Database Migrations

This command applies the schema to the PostgreSQL database you just started.

```bash
pnpm --filter api db:migrate
```

**Setup is complete.** You are now ready to run the platform.

---

### 3. Running the Platform

To run the entire platform (API, web app, and background worker), open a **single terminal** in the project root and run:

```bash
pnpm dev
```

This single command uses Turborepo to start all three applications in parallel. You will see color-coded logs from each service in your terminal.

**Access Points:**
- **Web Application**: [http://localhost:3002](http://localhost:3002)
- **API Server**: [http://localhost:3000](http://localhost:3000)
- **API Documentation (Swagger)**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

---

### 4. End-to-End Testing Flow

After starting the platform, follow these test cases to validate the core MVP functionality.

#### Test Case 1: Workspace Creation & Onboarding

1.  **Navigate** to [http://localhost:3002](http://localhost:3002).
2.  You should be redirected to the **Signup** page.
3.  **Create an account** with your email and a password.
4.  On the next screen, **create a new workspace**. Give it a name (e.g., "My Test Workspace") and an organization slug (e.g., "my-test-co").
5.  **Verification:** You should land on the main application dashboard (`/app`). The audit noted the onboarding flow is a gap, so you will be dropped directly into the app. This is expected behavior.


#### Test Case 2: Feedback Ingestion (Manual & CSV)

**Objective:** Verify that feedback can be created manually and via CSV import, and that it appears in the inbox.

1.  **Manual Ingestion:**
    - In the left navigation, click **Inbox**.
    - Click the **New Feedback** button.
    - Fill in a title (e.g., "Users want a dark mode") and a description. Click **Create**.
    - **Verification:** The new feedback item should appear at the top of the inbox list.

2.  **CSV Import:**
    - In the left navigation, go to **Admin -> Settings**.
    - Find the **Import from CSV** section.
    - Create a simple CSV file named `test.csv` with the following content:
      ```csv
      title,description,customerId
      "Mobile app is slow to load","The iOS app takes over 5 seconds to start up on a new iPhone.","cust_123"
      "API needs better documentation","I had trouble understanding the authentication flow for the API.","cust_456"
      ```
    - Upload `test.csv`.
    - **Verification:** Navigate back to the **Inbox**. You should see two new feedback items corresponding to the rows in your CSV file.

#### Test Case 3: AI Pipeline (Theme Clustering & CIQ Scoring)

**Objective:** Verify that the background worker processes feedback, groups it into themes, and assigns a CIQ score.

**Note:** This process is asynchronous. It may take 30-60 seconds for the AI jobs to complete after feedback is created.

1.  **Trigger AI Processing:** By creating feedback in the previous step, you have already queued the necessary jobs.
2.  **Check for Themes:**
    - In the left navigation, click **Themes**.
    - You should see one or more themes automatically generated by the AI (e.g., "API Improvements", "Mobile App Performance").
    - Click on a theme to view its detail page.
    - **Verification:** You should see the feedback items you created earlier grouped under this theme.
3.  **Check CIQ Score:**
    - In the left navigation, click **CIQ**.
    - You will see a ranked list of themes.
    - **Verification:** Each theme has a **CIQ Score**. The audit noted that the UI does not yet show the score *breakdown*, so just seeing the score itself is the expected behavior.


#### Test Case 4: Public Portal & Roadmap

**Objective:** Verify that themes can be promoted to the roadmap and made visible on the customer-facing public portal.

1.  **Promote a Theme to Roadmap:**
    - In the left navigation, go to **Themes**.
    - Click on one of the themes generated by the AI.
    - On the theme detail page, click the **"Promote to Roadmap"** button.
    - Give the roadmap item a name and click **Create**.

2.  **Publish Roadmap Item:**
    - In the left navigation, go to **Roadmap**.
    - You should see your new item in the "Planned" column.
    - Click the item to open its details.
    - Find the toggle switch for **"Visible on public roadmap"** and turn it on.

3.  **View Public Portal:**
    - In the left navigation, go to **Admin -> Settings**.
    - Under the "Public Portal" section, find and copy your **Portal URL**. It will look like `http://localhost:3002/portal/your-org-slug`.
    - Open this URL in a new incognito browser window to simulate a public user.

4.  **Verification:**
    - On the public portal, click the **Roadmap** tab. You should see the roadmap item you just published.
    - Click the **Feedback** tab. You can submit new feedback as a public user. This feedback will appear in your workspace's main **Inbox**.

#### Test Case 5: Weekly Digest Generation

**Objective:** Verify that the weekly digest can be manually generated and viewed.

1.  **Ensure Feedback Exists:** Make sure you have at least 3-5 feedback items from the previous steps.
2.  **Manually Trigger Digest:**
    - In the left navigation, go to **Admin -> Settings**.
    - Find the **"Weekly Digest"** section.
    - Click the **"Generate Digest Now"** button. This queues a background job.
3.  **View the Digest:**
    - Wait about 60-90 seconds for the LLM to process the data and generate the summary.
    - In the left navigation, click **Digest**.
    - **Verification:** You should see a new digest card with the current date. It will contain an executive summary, top themes, and emerging trends based on the feedback you created. If you see a loading spinner, wait a bit longer and refresh.

---

### 5. Stopping the Environment

1.  **Stop the Applications**: Press `Ctrl+C` in the terminal where `pnpm dev` is running.
2.  **Stop the Infrastructure**: To stop the PostgreSQL and Redis containers, run:

    ```bash
    docker-compose down
    ```

    To stop the containers **and delete all data** (which is useful for a clean re-test), add the `-v` flag:

    ```bash
    docker-compose down -v
    ```
