# 🧠 TRIAGEINSIGHT
## Source of Truth Product Requirements Document (PRD)

---

### 1️⃣ PRODUCT VISION

TriageInsight is an AI-powered Customer Intelligence Platform that helps SaaS companies:
- understand customer feedback
- prioritize product decisions
- detect support risk signals
- predict churn
- align roadmap with revenue impact

**Core Philosophy**  
Turn feedback noise into product clarity.

**MVP Focus: AI-Powered Feedback Intelligence**  
The initial release delivers the Feedback Intelligence module, Public Portal, Roadmap Intelligence, and the CIQ engine. This provides immediate value: unified feedback ingestion, AI clustering, prioritization, and a customer-facing portal. Support Intelligence, Churn Intelligence, and deep integrations follow in later phases.

---

### 2️⃣ TARGET USERS

**Platform Level**  
- TriageInsight Super Admin (internal team)

**Workspace Level**  
- **Company Admin** (Founder / Product Leader)  
- **Editor** (PM / Analyst / Support Lead)  
- **Viewer** (Exec / Stakeholder)

**Public Level**  
- **Portal User** (identified customer)  
- **Anonymous visitor**

---

### 3️⃣ CORE PRODUCT MODULES (MVP & ROADMAP)

#### MODULE 1 — FEEDBACK INTELLIGENCE ✅ MVP
**Purpose:** Central place where all feedback is unified.

**Sources:**  
- Public portal, Slack (MVP), CSV upload, API ingestion

**Capabilities:**  
- **Feedback ingestion:** manual entry, bulk import, integration sync, API push  
- **Data model:** title, description, source, customer, account value, sentiment score, embedding vector, theme linkage, duplicate linkage, priority score  
- **AI duplicate detection:** embedding similarity, cluster candidate detection, merge suggestions  
- **Theme clustering:** auto theme generation, manual theme creation, theme hierarchy  
- **Prioritization signals:** revenue impact, frequency, sentiment, strategic tag

#### MODULE 2 — SUPPORT INTELLIGENCE 📅 Phase 2
**Purpose:** Convert support chaos into product signals.

**Inputs:** ticket sync, call transcripts, chat transcripts  
**Outputs:** issue spikes, high-risk themes, support-product correlation, unresolved trend detection

#### MODULE 3 — ROADMAP INTELLIGENCE ✅ MVP
**Purpose:** Turn insights into roadmap.

**Capabilities:**  
- Theme → roadmap mapping  
- Priority score calculation  
- Public roadmap publishing  
- Progress tracking & release notes

#### MODULE 4 — PUBLIC PORTAL ✅ MVP
**Purpose:** Customer-facing interaction layer.

**Pages:** feedback board, submit feedback, vote, comment, roadmap  
**Identity model:** anonymous via cookie, portal user via email

#### MODULE 5 — CUSTOMER INTELLIGENCE (CRM Layer) ✅ MVP (basic)
**Purpose:** Connect feedback with revenue.

**Entities:** Customer, Deal, ARR, segment, lifecycle stage  
**Signals:** feature demand by revenue, churn risk linkage

#### MODULE 6 — CHURN INTELLIGENCE 📅 Phase 3
**Purpose:** Predict churn before it happens.

**Inputs:** support intensity, feedback sentiment, usage metrics, deal signals  
**Outputs:** churn risk score, retention alert, product gap insight

#### MODULE 7 — AI ENGINE ✅ MVP (core)
**Purpose:** Core intelligence engine powering all decision layers.

**AI Jobs (MVP):** dedupe, clustering, summarization, prioritization scoring  
**Architecture:** async queue, embedding storage, model abstraction

#### MODULE 8 — SURVEY ENGINE 📅 Phase 2
**Capabilities:**  
- Create NPS, feature validation, and roadmap validation surveys  
- Survey types: public, targeted customers, segment-based

#### MODULE 9 — INTEGRATIONS
- **MVP:** Slack, CSV, API  
- **Phase 2:** Zendesk, Intercom, HubSpot, Jira

#### MODULE 10 — BILLING & PLANS ✅ MVP
**Model:** Workspace-based. Billing owner is Company Admin.

**Suggested Pricing:**  
- **Starter:** 1 workspace, 5 users, basic AI, public portal  
- **Growth:** Unlimited feedback, integrations, prioritization  
- **Enterprise:** Churn intelligence, SSO, deep integrations, advanced reporting

#### MODULE 11 — ENTERPRISE REPORTING 📅 Phase 3
**Capabilities:** theme trend report, product ROI report, churn risk report, executive summary export

#### MODULE 12 — VOICE FEEDBACK 📅 Phase 2
**Capabilities:** upload recording, transcription, sentiment detection, theme mapping

---

### 4️⃣ CIQ – CUSTOMER INTELLIGENCE QUANTUM (INTERNAL DECISION LAYER)

**CIQ** is TriageInsight’s proprietary intelligence engine. It transforms raw customer signals into product decisions and is the hidden layer powering all prioritization, risk detection, and churn prediction.

**Inputs:**  
- Feedback volume, sentiment intensity, customer ARR, deal stage signals, support ticket spikes, product usage trends, survey responses

**Outputs:**  
- Priority score, revenue impact score, risk level, opportunity signal, confidence index

**Architecture:**  
- Async scoring engine, vector similarity engine, aggregation workers, batch scoring pipeline, real-time recalculation triggers

---

### 5️⃣ SIGNAL LIFECYCLE MODEL

Every piece of feedback or signal moves through a structured lifecycle, ensuring traceability and clarity.

| Stage | Description |
|-------|-------------|
| **Ingestion** | Signal enters via any source (portal, integration, upload). Metadata captured: source, timestamp, customer identity, sentiment. |
| **Normalization** | Raw text is cleaned, standardized, and enriched with customer context (ARR, segment, lifecycle stage). |
| **Enrichment** | CIQ adds embedding vector, sentiment score, and links to existing customers/themes. |
| **Clustering** | Signal is grouped into themes (auto or manual). Duplicate detection links related signals. |
| **Scoring** | CIQ calculates priority score based on revenue impact, frequency, sentiment, and strategic tags. |
| **Review** | Editor triages, merges, or reclassifies. Manual overrides feed back into CIQ training. |
| **Action** | Signal influences roadmap items, support alerts, or churn risk flags. |
| **Feedback Loop** | Outcome (e.g., feature shipped, ticket resolved) is linked back to original signals for ROI measurement. |

---

### 6️⃣ ICP CLARITY (IDEAL CUSTOMER PROFILE)

TriageInsight is designed for **B2B SaaS companies** with:
- **Product-led or sales-assisted motions** – need to align product decisions with revenue.
- **Annual Recurring Revenue (ARR):** $1M–$50M (expandable enterprise).
- **Team structure:** Has dedicated product managers, customer support, and leadership.
- **Existing feedback channels:** Scattered across support tickets, Slack, sales calls, and spreadsheets.
- **Pain points:** Unable to prioritize features by revenue impact; high churn risk due to poor visibility.

**Personas within ICP:**
- **Product-Led Growth (PLG) SaaS:** Heavy usage of portal, Slack, and community feedback.
- **Sales-Led SaaS:** Need integration with CRM (HubSpot/Salesforce) and support systems (Zendesk/Intercom).
- **High-Touch Enterprise:** Require churn intelligence, executive reporting, and security/compliance.

---

### 7️⃣ DATA OWNERSHIP MODEL

TriageInsight operates under a **clear data ownership framework** to ensure trust and compliance.

| Entity | Ownership | Rights |
|--------|-----------|--------|
| **Customer (End User)** | Owns their submitted feedback content | Can request deletion, export, or anonymization per privacy laws. |
| **Workspace (SaaS Company)** | Owns all aggregated insights, derived scores, and their configuration | Can export all data, delete workspace, manage integrations. |
| **TriageInsight (Platform)** | Owns the platform, algorithms, and aggregated anonymized data for model improvement | Cannot access workspace data except for support with explicit permission. |

**Data Portability:**  
- Full export (CSV/JSON) available for workspace admins.  
- API access for pulling insights into internal BI tools.

**Deletion & Retention:**  
- Feedback deletion is immediate upon request.  
- Aggregated metrics may be retained for platform improvement after anonymization.  
- Workspace deletion triggers complete data erasure after 30-day grace period.

---

### 8️⃣ CIQ EXPLAINABILITY

CIQ’s outputs (priority scores, risk alerts) are not black boxes. Every decision is accompanied by an **explanation layer** to build trust and enable action.

**Explainability Features:**
- **Score Breakdown:** Each priority score shows contributing factors (e.g., revenue impact: 40%, frequency: 35%, sentiment: 25%).
- **Signal Sources:** Lists all feedback items contributing to a theme or alert, with drill-down to original content.
- **Confidence Intervals:** CIQ outputs include confidence levels (e.g., “High confidence based on 15+ signals from top-tier accounts”).
- **Audit Trail:** Every automated action (merge, clustering, scoring) is logged with timestamp and rationale.
- **User Override:** Editors can adjust scores or recluster; these manual inputs are tracked and can be used to retrain models.

**Why It Matters:**  
- Product managers can justify roadmap decisions to stakeholders.  
- Support teams trust risk alerts when they see underlying ticket patterns.  
- Enterprise buyers require transparency for compliance and accountability.

---

### 9️⃣ DISTRIBUTION STRATEGY

TriageInsight will reach the market through a multi-channel approach tailored to B2B SaaS buyers.

| Channel | Target | Tactics |
|---------|--------|--------|
| **Product-Led Growth (PLG)** | Individual PMs, small teams | Free trial with portal + basic AI; in-app upgrade prompts; self-serve signup. |
| **Sales-Assisted** | Mid-market (10–100 employees) | Outbound SDRs targeting product leaders; demo-driven; integration with CRM. |
| **Partnerships** | Agencies, consultancies, dev shops | Partner program for implementation and referral fees; co-marketing. |
| **Marketplace** | Ecosystem integrations | List on Slack, Zendesk, Intercom marketplaces; drive discovery via existing user bases. |
| **Content & Community** | Product managers, SaaS founders | Blog, webinars, case studies; active in PM communities (Mind the Product, Lenny’s Newsletter). |
| **PLG + Sales Hybrid** | Enterprise expansion | In-app leads to sales for enterprise features (SSO, churn intelligence). |

**GTM Phases:**
1. **Launch:** PLG focus with free tier; early adopters via Product Hunt, LinkedIn.
2. **Scale:** Sales team targets mid-market; build case studies from early customers.
3. **Expand:** Enterprise outbound; partnerships; international.

---

### 🔟 COMPETITIVE NARRATIVE

TriageInsight competes in the **Customer Feedback & Product Intelligence** space. Our positioning:

| Competitor | TriageInsight Advantage |
|------------|-------------------------|
| **Productboard** | TriageInsight includes **support intelligence** and **churn prediction**, not just roadmap prioritization. Deeper revenue linkage. |
| **Aha!** | TriageInsight is **AI-first**, with automated clustering, duplicate detection, and CIQ scoring. More modern UX and faster setup. |
| **Canny / Frill** | TriageInsight offers **enterprise-grade analytics** (ARR impact, churn risk) and **integrations** beyond just a feedback board. |
| **Gainsight / ChurnZero** | TriageInsight focuses on **product-led growth** and **feature prioritization**, not just customer success workflows. Differentiated via CIQ. |
| **In-house spreadsheets** | TriageInsight automates the entire feedback-to-roadmap pipeline, saving hours and adding revenue-weighted insights. |

**Key Differentiators:**
- **Revenue-Weighted Prioritization:** CIQ scores features by ARR impact, not just votes.
- **Unified Signal Sources:** Combines support tickets, sales calls, and portal feedback into one view.
- **Churn Intelligence:** Predicts churn based on product feedback and support patterns.
- **Explainable AI:** Transparent scoring builds trust.
- **Modern Architecture:** API-first, multi-tenant, built for scale.

**Narrative:**  
“Stop guessing what to build. TriageInsight turns scattered feedback into revenue-backed product decisions—so you build what matters, reduce churn, and align your roadmap with growth.”

---

### 1️⃣1️⃣ FINAL PAGE MAP (ENTERPRISE-GRADE)

The following pages represent the complete product surface area. Pages are grouped by section, with access roles and purpose clearly defined. Build in phases as outlined below.

#### 🌐 MARKETING SITE (Public) — ~12 Pages

| # | Page | Access | Purpose |
|---|------|--------|---------|
| 1 | Home | All visitors | Product positioning, hero narrative, trust building, CTA signup |
| 2 | Pricing | Founders / decision makers | Plan comparison, pricing psychology, conversion |
| 3 | Features (Overview) | All visitors | Module overview, AI differentiation |
| 4 | Feature — AI Deduplication | All visitors | Explain AI clustering |
| 5 | Feature — Theme Clustering | All visitors | Explain product insight layer |
| 6 | Feature — Weekly Digest | All visitors | Executive reporting automation |
| 7 | Feature — Voice Feedback | All visitors | Future-forward differentiation |
| 8 | Feature — Public Portal | All visitors | Customer engagement story |
| 9 | Feature — Public Roadmap | All visitors | Transparency narrative |
| 10 | Integrations | All visitors | Ecosystem trust |
| 11 | Security | All visitors | Enterprise credibility |
| 12 | Alternatives | SEO / decision makers | SEO + positioning |
| 13 | Compare Canny | SEO / decision makers | Competitor SEO |
| 14 | Compare Frill | SEO / decision makers | Competitor SEO |
| 15 | Compare UserVoice | SEO / decision makers | Competitor SEO |

#### 🔐 AUTH PAGES — ~4

| # | Page | Access | Purpose |
|---|------|--------|---------|
| 16 | Login | All visitors | Workspace login |
| 17 | Signup | All visitors | New workspace creation |
| 18 | Forgot Password | All visitors | Password recovery |
| 19 | Verify Email | All visitors | Email confirmation |

#### 🧩 PRODUCT APP (Workspace SaaS) — ~16

| # | Page | Access | Purpose |
|---|------|--------|---------|
| 20 | Admin Dashboard | Admin, Editor, Viewer | Executive summary, insight overview |
| 21 | Feedback Inbox | Admin, Editor | Triage center |
| 22 | Feedback Detail | Admin, Editor | Deep signal analysis |
| 23 | Merge Suggestions | Admin, Editor | Dedupe workflow |
| 24 | Themes List | Admin, Editor, Viewer | Browse all themes |
| 25 | Theme Detail | Admin, Editor, Viewer | Theme insights, linked feedback |
| 26 | Roadmap Board | Admin, Editor, Viewer | Visual roadmap planning |
| 27 | Roadmap Detail | Admin, Editor, Viewer | Item details, progress |
| 28 | Support Overview | Admin, Editor | Support intelligence (Phase 2) |
| 29 | Ticket Clusters | Admin, Editor | Grouped support issues (Phase 2) |
| 30 | Call Insights (Voice) | Admin, Editor | Voice feedback analysis (Phase 2) |
| 31 | Customers List | Admin, Editor, Viewer | Customer directory with ARR/segments |
| 32 | Customer Detail | Admin, Editor, Viewer | Customer feedback & risk profile |
| 33 | Surveys List | Admin, Editor | Manage surveys (Phase 2) |
| 34 | Survey Builder | Admin, Editor | Create NPS/validation surveys (Phase 2) |
| 35 | Integrations Center | Admin, Editor | Connect external tools |
| 36 | Executive Reports | Admin, Viewer | Exportable insights (Phase 3) |
| 37 | Workspace Settings | Admin | Configuration, roles, branding |
| 38 | Billing | Admin | Subscription management |

#### 🌍 PUBLIC PORTAL — ~4

| # | Page | Access | Purpose |
|---|------|--------|---------|
| 39 | Public Feedback Board | Anonymous, Portal User | View and vote on feedback |
| 40 | Submit Feedback | Anonymous, Portal User | Add new feedback |
| 41 | Public Roadmap | Anonymous, Portal User | Track upcoming releases |
| 42 | Survey Response Page | Portal User, anonymous | Take surveys (Phase 2) |

#### 🧠 PLATFORM (SUPER ADMIN) — ~4

| # | Page | Access | Purpose |
|---|------|--------|---------|
| 43 | Workspace List | Super Admin | Monitor all tenants |
| 44 | Workspace Detail | Super Admin | Deep inspection, support |
| 45 | Billing Health | Super Admin | Subscription oversight |
| 46 | Platform Metrics | Super Admin | System health, AI performance |

**Total:** 42–46 pages (realistic enterprise SaaS scale).

---

### 1️⃣2️⃣ BUILD SEQUENCE (PHASED IMPLEMENTATION)

| Phase | Pages / Modules |
|-------|-----------------|
| **Phase 1 (MVP)** | Marketing (home, pricing, features overview, integrations, security), Auth (all), Admin Dashboard, Feedback Inbox & Detail, Merge Suggestions, Themes List & Detail, Roadmap Board & Detail, Public Portal (feedback board, submit, roadmap), Integrations Center (Slack, CSV, API), Workspace Settings, Billing. |
| **Phase 2** | Marketing (remaining feature pages, compare pages), Support Overview, Ticket Clusters, Call Insights, Surveys List & Builder, Survey Response Page, Customers List & Detail (enhanced), Executive Reports (basic). Additional integrations (Zendesk, Intercom, HubSpot, Jira). |
| **Phase 3** | Churn Intelligence dashboards, Advanced Enterprise Reporting, Platform Admin pages, deep integrations. |

---

### 1️⃣3️⃣ ENTERPRISE SYSTEM ARCHITECTURE

| Layer | Technology / Approach |
|-------|----------------------|
| **Frontend** | NextJS multi-tenant UI |
| **API** | NestJS domain modular architecture |
| **Intelligence** | AI scoring + embeddings (CIQ) |
| **Data** | PostgreSQL + pgvector |
| **Async** | Redis queue + worker services |
| **Integration** | Webhooks + sync adapters |
| **Storage** | S3 asset store |
| **Infra** | AWS multi-region ready |

---

### 1️⃣4️⃣ DATA FLOW & AI PIPELINE

**Data Flow:**  
```
Sources → Ingestion → Queue → AI Processing (CIQ) → Database → Insights UI
```

**AI Pipeline Stages:**  
1. Ingestion  
2. Normalization  
3. Embedding  
4. Clustering  
5. Scoring (CIQ)  
6. Trend Detection  
7. Churn Modeling  
8. Digest Generation

---

### 1️⃣5️⃣ MULTI-TENANT ISOLATION MODEL

**Tenant Boundary:** `workspace_id`

**Isolation Includes:**  
- Feedback, customers, integrations, billing, portal, roadmap

**Portal Isolation:** Based on `orgSlug`

**Security Model:**  
- Workspace isolation, role guards, audit logs, enterprise SSO (later)

---

### 1️⃣6️⃣ PRICING STRATEGY (REALISTIC SaaS)

| Plan | Price | Metering |
|------|-------|---------|
| Starter | $29–49/mo | Feedback volume, 5 seats |
| Growth | $99–199/mo | Unlimited feedback, integrations |
| Enterprise | $500+/mo | Custom AI, SSO, deep integrations |

---

### 1️⃣7️⃣ INTEGRATION ARCHITECTURES

**Slack Integration (MVP):**  
- Slack → Webhook → Ingestion Service → Feedback Pipeline  
- Supports thread ingestion, emoji weighting, keyword triggers

**Voice Feedback Architecture (Phase 2):**  
- Upload → Transcription → Embedding → Theme Mapping  
- Future: call auto-ingestion, sentiment waveform analysis

---

### 1️⃣8️⃣ LAUNCH READINESS CHECKLIST (MVP)

- [ ] Portal live (feedback board + submit)  
- [ ] Prioritization stable (CIQ scoring)  
- [ ] Roadmap publishable  
- [ ] Billing working  
- [ ] AI dedupe and clustering working  
- [ ] Slack integration functional  
- [ ] API for ingestion  
- [ ] Role-based access control  

---

### 1️⃣9️⃣ SUCCESS METRICS

- Feedback processed per workspace  
- Roadmap accuracy  
- Churn prediction accuracy (post-Phase 3)  
- ARR influence  

---

### 2️⃣0️⃣ TECH VALIDATION CHECKLIST (FOR MANUS/ENG)

- [ ] Schema vs. PRD alignment  
- [ ] Routes vs. IA mapping  
- [ ] UI vs. UX blueprint  
- [ ] AI pipeline vs. defined jobs (CIQ tasks)  
- [ ] RBAC vs. role model  
- [ ] Integration coverage  

---

**This document is the single source of truth for all product, design, engineering, and GTM efforts.** 