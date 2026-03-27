# TriageInsight — Final Product & Architecture Requirement Document  
*Updated with Phase Clarity, Portal/Workspace Distinction, and CIQ Positioning*

---

## 1. Product Vision

**TriageInsight** is an AI‑powered Customer Intelligence Platform designed for SaaS companies. Its core mission is to transform unstructured feedback and support signals into actionable product intelligence.

By unifying feedback, support tickets, revenue data, and voice inputs, TriageInsight enables product teams to:
- Understand what to build next based on real revenue impact.
- Detect product pain points early and reduce churn risk.
- Prioritise development efforts with business value in mind.
- Unify signals across feedback, support, and customer interactions.

---

## 2. Multi‑Tenancy Model

**Architecture Type:** Subdomain‑based multi‑tenant SaaS

Each customer (workspace) gets its own subdomain:
- `paypal.triageinsight.com`
- `notion.triageinsight.com`
- `stripe.triageinsight.com`

One subdomain = one workspace = one company. This provides clear separation of data, customisation, and a branded experience for end users.

---

## 3. Identity & Access Layers

### 3.1 Platform Level (TriageInsight Internal)

**Roles:**  
- `SUPER_ADMIN` – full system access  
- `PLATFORM_ADMIN` – operational administration

**Capabilities:**
- Manage all workspaces (activate, suspend, delete)
- Monitor system health and usage analytics
- Configure global pricing plans and integrations
- Manage AI model configurations and global settings
- Access audit logs for security and compliance

*This layer is isolated from workspace routes and accessed via a dedicated admin console.*

---

### 3.2 Workspace Level (Customer Company)

**Roles:**  
- `ADMIN` – payer / owner  
- `EDITOR` – product & support staff  
- `VIEWER` – stakeholders (read‑only)

| Role     | Capabilities |
|----------|--------------|
| **Admin** | Create workspace (initial registration), manage billing, invite staff, assign roles, configure portal, manage integrations, set AI prioritisation rules, configure surveys, manage custom domain |
| **Editor** | Triage feedback, merge duplicates, create themes, manage roadmap, use AI insights, tag revenue impact, correlate support tickets, analyse voice recordings |
| **Viewer** | View dashboards, roadmap, analytics, and insights (no write access) |

---

### 3.3 Public Layer (External Users)

**Identity Types:**  
- `PortalUser` – logged‑in external user (email/password)  
- `Anonymous` – not logged in (cookie‑based)

| Type       | Capabilities |
|------------|--------------|
| **PortalUser** | Submit feedback, vote, comment, view roadmap, participate in surveys |
| **Anonymous** | Submit feedback, vote (session/cookie), view roadmap |

> **Important:** The public portal is a **customer‑facing surface of a workspace**, not a separate tenant. Portal routes use `orgSlug` to map to the correct `workspace_id`. All portal data belongs to the workspace.

---

## 4. Authentication Model

**Workspace‑scoped authentication:**  
Users belong to a single workspace; authentication occurs at the subdomain level.

- **Workspace creation:** Only a workspace admin can register a new workspace (no self‑registration for staff).
- **Staff onboarding:**  
  1. Admin invites a user via email.  
  2. Invite email contains a secure link to `{subdomain}.triageinsight.com/invite-accept`.  
  3. User sets a password and logs in.  
- **Login:** Users authenticate at `{subdomain}.triageinsight.com/login`.  
- **Password reset:** Handled via email link scoped to the workspace.

**Signup flow:**  
- If a workspace already exists for a subdomain, signup is disabled.  
- Only a new workspace creation triggers the signup process.

---

## 5. Route Architecture

All routes are prefixed with the workspace subdomain.

### Auth Routes
```
/login
/reset-password
/verify
/invite-accept
/signup            (only for new workspace creation)
```

### Internal Product
```
/app/dashboard
/app/inbox
/app/themes
/app/roadmap
/app/support
/app/risk
/app/voice
/app/digest
/app/customers
```

### Workspace Settings
```
/admin/members
/admin/billing
/admin/integrations
/admin/settings
/admin/permissions
/admin/domain
/admin/portal-settings
```

### Public Portal
```
/portal/feedback
/portal/feedback/new
/portal/feedback/:id
/portal/roadmap
```

---

## 6. Core Product Pillars & Phased Roadmap

### Phase 1 – Feedback Intelligence (MVP)
- AI deduplication of similar feedback
- Automatic theme clustering
- Revenue‑aware prioritisation (ARR, deal influence)
- Roadmap generation and management
- Public feedback portal (submit, vote, comment)
- Voice upload MVP (transcribe, extract feedback)
- Digest (weekly email summary for stakeholders)
- Customer signals base (track ARR, lifecycle, feature requests)

### Phase 2 – Support & Voice Intelligence
- Integrations with Zendesk, Intercom
- Ticket clustering and issue spike detection
- Correlation between support tickets and feature requests
- Advanced voice analytics (sentiment, churn detection from calls)

### Phase 3 – Churn & Enterprise
- Customer health score (based on usage, sentiment, support)
- Churn risk prediction
- Intervention suggestions for CS teams
- Enterprise reporting (custom dashboards, export)
- Super admin console for platform management

---

## 7. CIQ (Customer Intelligence) – Internal Scoring Engine

**CIQ is not a UI module.**  
It is an internal intelligence layer that provides scoring, signals, and recommendations to other modules:

- **Prioritisation:** Combines feedback popularity, revenue impact, and support volume to suggest what to build next.
- **Churn detection:** Uses usage patterns, support tickets, and voice sentiment to flag at‑risk accounts.
- **Support intelligence:** Identifies ticket spikes and correlates them with feature gaps.
- **Survey analysis:** Automatically groups survey responses into themes and links them to revenue.

CIQ is implemented as a set of services (scoring, aggregation, ML predictions) that feed data into the product modules listed above. It has no standalone UI.

---

## 8. Workspace Admin Features

- **Member Management:** Invite, remove, assign roles
- **Billing Management:** Choose plan, update payment, view invoices
- **Integrations:** Configure connections (Zendesk, Intercom, CRM, etc.)
- **AI Configuration:** Adjust prioritisation weights, feedback clustering settings
- **Survey Creation:** Build and distribute in‑product surveys
- **Roadmap Visibility:** Control which roadmap items are public/private
- **Domain Configuration:** Set up custom domain for portal
- **Portal Customisation:** Branding, colour scheme, logo, custom messages

---

## 9. Public Portal Features

- **Feedback Submission:** Users can suggest ideas or report issues
- **Voting:** Upvote existing feedback (anonymous votes stored via cookie)
- **Commenting:** Discuss ideas with other users
- **Roadmap Visibility:** View planned, in‑progress, and completed items
- **Survey Participation:** Respond to surveys targeted to portal users

---

## 10. CRM Layer (Customer Intelligence)

The CRM layer is internal to the workspace and is not a full‑fledged CRM, but a lightweight customer intelligence database that tracks:

- **ARR / MRR** per customer account
- **Deal influence** – which feature requests influenced deals
- **Lifecycle stage** (trial, active, churned)
- **Churn signals** (downgrades, support inactivity)
- **Feature request mapping** – which accounts requested which features

This enables revenue‑aware prioritisation and health scoring.

---

## 11. Voice Intelligence

**MVP (Phase 1):**  
- Upload call recording (MP3, WAV, etc.)  
- Transcribe using speech‑to‑text  
- Extract feedback, pain points, and feature requests  
- Automatically create or attach to themes

**Future (Phase 2+):**  
- Live call integration (e.g., via Zoom, Teams)  
- Sentiment detection (positive/negative/neutral)  
- Churn detection from voice conversations

---

## 12. Billing Model

- **Only workspace admins** can manage billing.
- Plans are subscription‑based, per workspace (not per user):
  - **Free** – limited feedback volume, basic features
  - **Starter** – higher limits, core feedback intelligence
  - **Pro** – support integrations, voice upload, advanced analytics
  - **Enterprise** – custom domain, SSO, dedicated support, SLA

- Payment processing via Stripe (or equivalent). Admins can upgrade/downgrade at any time; proration handled automatically.

---

## 13. Enterprise Differentiation

TriageInsight is **not** just another feedback or roadmap tool. It is a **Customer Intelligence Operating System** that:

- Combines feedback, support, voice, and revenue into one platform.
- Uses AI to surface actionable insights, not just data.
- Prioritises development based on business impact.
- Provides a single source of truth for product decisions.

Competitive advantage lies in **revenue awareness** and **multi‑signal intelligence**.

---

## 14. System Architecture

### Frontend
- **Next.js (App Router)** – server‑rendered, multi‑tenant routing
- Shared design system (Tailwind + custom components)
- Workspace‑scoped API client

### Backend
- **NestJS** – modular, maintainable API layer
- **Prisma** – type‑safe database access
- **PostgreSQL + pgvector** – relational data with vector embeddings for AI clustering
- **Queue‑based AI pipeline** (BullMQ) – handles transcription, embedding, clustering asynchronously

### Infrastructure (AWS)
- **Compute:** ECS / Lambda for API, workers
- **Storage:** S3 for voice recordings, images
- **CDN:** CloudFront for portal assets
- **Database:** RDS PostgreSQL with pgvector
- **Caching:** Redis (for queues and session store)

---

## 15. Key Product Philosophy

- **AI‑first:** Automate repetitive tasks, surface intelligence, reduce manual triage.
- **Revenue‑aware:** Every insight is tied to business value.
- **Enterprise‑ready:** Security, scalability, customisation.
- **UX premium:** Intuitive, fast, and delightful.
- **Multi‑signal intelligence:** Unify feedback, support, voice, and revenue.
- **Product decision engine:** Provide clear “what to build next” recommendations.

---

## 16. MVP Scope Definition (For Engineering Validation)

To avoid over‑building, the following scope is considered **MVP (Phase 1)**. Features marked Phase 2/3 are excluded from initial validation.

| Module               | MVP Scope (Phase 1)                                 | Future Phases (2/3)                              |
|----------------------|-----------------------------------------------------|--------------------------------------------------|
| **Feedback**         | Deduplication, clustering, revenue‑aware prioritisation, roadmap generation | — |
| **Portal**           | Submit feedback, vote, comment, view roadmap        | Surveys, advanced customisation                  |
| **Voice**            | Upload, transcribe, extract feedback (basic)        | Live calls, sentiment, churn detection           |
| **Support**          | —                                                   | Zendesk/Intercom integration, ticket clustering  |
| **Churn**            | —                                                   | Health score, risk prediction, interventions     |
| **CIQ**              | Basic scoring for prioritisation                    | Full scoring engine for all modules               |
| **Integrations**     | Slack (notifications)                               | Zendesk, Intercom, CRM, etc.                     |
| **Billing**          | Stripe integration, plan selection, subscription    | Advanced invoicing, usage‑based billing          |
| **Admin**            | Member management, portal settings, basic AI config | Domain config, advanced permissions, audit logs  |
| **Platform Admin**   | —                                                   | Super admin console, global settings             |

**What is NOT in MVP:**
- Phase 2/3 features (Support, Churn, advanced integrations)
- Enterprise reporting and automation workflows
- Full super admin capabilities

---

*This document is the single source of truth for all stakeholders. Any future changes must be reflected here.*