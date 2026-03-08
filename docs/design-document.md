# TriageInsight — Product & System Design Document

**Version:** 1.0  
**Date:** March 08, 2026  
**Status:** Final  
**Author:** Manus AI

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Product Vision & Strategy](#2-product-vision--strategy)
3. [Brand Identity & Design System](#3-brand-identity--design-system)
4. [UI/UX Design Specifications](#4-uiux-design-specifications)
5. [System Architecture](#5-system-architecture)
6. [Domain Model](#6-domain-model)
7. [Monorepo Folder Structure](#7-monorepo-folder-structure)
8. [Backend Module Specifications](#8-backend-module-specifications)
9. [AI Pipeline Design](#9-ai-pipeline-design)
10. [Internationalization Strategy](#10-internationalization-strategy)
11. [Security & Compliance](#11-security--compliance)
12. [Implementation Roadmap](#12-implementation-roadmap)

---

## 1. Introduction

This document is the definitive product and system design reference for **TriageInsight**, a B2B SaaS platform that transforms scattered customer signals into clear, actionable product decisions. It covers the complete design system, system architecture, domain model, and implementation roadmap for the MVP spanning Phase 1 (Feedback Intelligence) and Phase 2 (Support Intelligence).

The document is intended as the primary reference for engineering, product, and design teams. It consolidates the brand identity from the official Brand Style Guide, the UI/UX patterns observed on the live reference website at [triageinsight.com](https://triageinsight.com), and the technical architecture requirements specified in the product brief.

---

## 2. Product Vision & Strategy

### 2.1 Mission

> TriageInsight exists to turn customer feedback chaos into product clarity. We help B2B SaaS product teams stop guessing and start building what customers actually want — by automatically deduplicating, clustering, and prioritising feedback from every channel into a single, actionable signal.

### 2.2 Product Pillars

The platform is organized around three strategic pillars, each addressing a distinct customer intelligence need:

| Pillar | Description | Phase |
| :--- | :--- | :--- |
| **Feedback Intelligence** | Collect, clean, cluster, and prioritize feedback from every channel to understand what customers want. | Phase 1 |
| **Support Intelligence** | Analyze support conversations to detect recurring issues, bug clusters, and customer pain areas. | Phase 2 |
| **Churn Intelligence** | Predict which customers may leave based on behavioral signals from feedback and support. | Future |

### 2.3 Core Tagline

> **Turn feedback noise into product clarity.**

The LinkedIn tagline is: *AI-powered feedback triage for B2B SaaS teams. Stop guessing. Start building what customers actually want.*

### 2.4 Brand Voice

TriageInsight communicates like a sharp, experienced product leader. The brand is direct without being cold, technical without being jargon-heavy, and confident without being arrogant. The key messaging pillars are:

- **The Problem**: Customer feedback arrives from everywhere and the signal is buried under noise. The same request appears dozens of times with different wording. Roadmap decisions are made on instinct rather than data.
- **The Solution**: TriageInsight automatically deduplicates, clusters, and prioritises customer feedback so product teams can see exactly what to build next — without the manual triage work.
- **The Promise**: Product decisions driven by evidence, not the loudest voice in the room.

---

## 3. Brand Identity & Design System

The TriageInsight visual identity is built around a core tension: the deep, authoritative navy of Deep Focus Blue against the clear, energetic signal of Clarity Teal. Together they communicate intelligence and precision.

### 3.1 Colour System

The colour palette is the most critical element of the brand. Every colour has a defined role and must not be used outside of it.

| Name | Hex | RGB | Role |
| :--- | :--- | :--- | :--- |
| **Deep Focus Blue** | `#0A2540` | 10, 37, 64 | Primary background, primary text on light surfaces. |
| **Clarity Teal** | `#20A4A4` | 32, 164, 164 | Brand accent, "Insight" wordmark, links, section labels. |
| **Teal Dark** | `#128282` | 18, 130, 130 | Hover states for teal elements, icon depth. |
| **Signal Slate** | `#B4C8DC` | 180, 200, 220 | Secondary text on dark backgrounds, input borders. |
| **Signal Yellow** | `#FFC832` | 255, 200, 50 | **Primary CTA buttons only.** Never decorative. |
| **Pure White** | `#FFFFFF` | 255, 255, 255 | "Triage" wordmark on dark, body text on dark, card backgrounds. |
| **Warm Off-White** | `#F4F2EE` | 244, 242, 238 | Page background, section backgrounds, card backgrounds. |

**Colour Hierarchy Rules:**

The primary pairing of Deep Focus Blue and Clarity Teal is used for all hero sections, headers, and primary brand moments. White and Off-White paired with Deep Focus Blue is used for body content sections, cards, and long-form reading contexts. Signal Yellow is reserved exclusively for primary CTA buttons and must never be used for decorative purposes.

### 3.2 Typography

TriageInsight uses **Inter** exclusively across all brand communications. Inter is a geometric sans-serif typeface designed for screen legibility, making it ideal for a data-intelligence product.

| Style | Font | Size | Weight | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Display / H1** | Inter | 48–72pt | Bold | Hero headlines, major section openers. |
| **Heading / H2** | Inter | 28–36pt | Bold | Section titles, feature headings. |
| **Subheading / H3** | Inter | 20–24pt | Bold | Card titles, sub-section labels. |
| **Body** | Inter | 14–16pt | Regular | Paragraphs, descriptions, main content. |
| **Caption** | Inter | 11–13pt | Regular | Labels, metadata, footnotes. |
| **Button** | Inter | 14–15pt | Bold | CTA buttons, navigation items. |

Typography rules: never use more than two font weights in a single design context. Line height for body text must be 1.5× the font size. Italic variants must not be used. All-caps is acceptable only for labels and metadata.

### 3.3 Logo & Icon

The TriageInsight logo is the "Funnel to Signal" mark — five horizontal lines of varying length on the left converging through a solid teal diamond at centre, emerging as a single bold teal line on the right. The diamond represents the triage moment and must always be rendered in Clarity Teal.

The wordmark is set in Inter Bold. "Triage" is always rendered in the background contrast colour (white on dark, Deep Focus Blue on light). "Insight" is always rendered in Clarity Teal (`#20A4A4`).

| Usage Context | Version | Minimum Width |
| :--- | :--- | :--- |
| Navigation, hero sections | Primary (dark background) | 80px |
| Light backgrounds, emails | Secondary (light background) | 80px |
| Favicon, app icon, profile photo | Icon mark only | 24px |

### 3.4 UI Component Specifications

These specifications define the visual properties of all interactive UI components. The implementation uses **shadcn/ui** as the component foundation, styled with **Tailwind CSS** tokens mapped to the brand palette.

**Buttons:**

| Variant | Background | Text | Border | Border Radius |
| :--- | :--- | :--- | :--- | :--- |
| Primary CTA | Signal Yellow `#FFC832` | Deep Focus Blue `#0A2540` | None | 18px |
| Secondary | Transparent | Clarity Teal `#20A4A4` | 2px Clarity Teal | 18px |
| Ghost / Text | Transparent | Deep Focus Blue `#0A2540` | None | 18px |
| Destructive | Red `#EF4444` | White `#FFFFFF` | None | 18px |

**Form Elements:**

| Element | Background | Border | Border Radius | Focus State |
| :--- | :--- | :--- | :--- | :--- |
| Input Field | White `#FFFFFF` | 1px Signal Slate `#B4C8DC` | 4px | 2px Deep Focus Blue ring |
| Textarea | White `#FFFFFF` | 1px Signal Slate `#B4C8DC` | 4px | 2px Deep Focus Blue ring |
| Select | White `#FFFFFF` | 1px Signal Slate `#B4C8DC` | 4px | 2px Deep Focus Blue ring |

**Containers:**

| Element | Background | Border | Border Radius | Shadow |
| :--- | :--- | :--- | :--- | :--- |
| Card | White `#FFFFFF` | 1px Signal Slate `#B4C8DC` | 8px | Subtle box-shadow |
| Modal | White `#FFFFFF` | None | 12px | Medium box-shadow |
| Badge / Tag | Clarity Teal at 15% opacity | None | 4px | None |
| Sidebar | Deep Focus Blue `#0A2540` | None | None | None |

---

## 4. UI/UX Design Specifications

This section defines the layout, structure, and visual design for every major screen and page in the application. The design follows the reference website patterns and brand guidelines.

### 4.1 Marketing Website (triageinsight.com)

The marketing website uses a dark hero section in Deep Focus Blue transitioning to white content sections. This mirrors the product's core value proposition: chaos becomes clarity.

**Navigation Bar:**

The navigation is a sticky top bar with a Deep Focus Blue background. The logo is positioned on the left. Navigation links (Features, How it works, Pricing) are centered. On the right, a "Sign in" text link is followed by a "Start free trial" primary CTA button in Signal Yellow.

**Hero Section:**

The hero occupies the full viewport width on a Deep Focus Blue background. A small pill badge labeled "AI-Powered Feedback Intelligence" sits above the main headline. The H1 headline reads "Turn feedback noise into product clarity." where "product clarity." is rendered in Clarity Teal. Below the headline, a two-line subheadline describes the core value. Two CTA buttons follow: the primary "Start free trial →" in Signal Yellow and a secondary "See how it works" ghost button. A trust line below reads "No credit card required • 14-day free trial • Cancel anytime". A product screenshot mockup showing the dashboard UI is displayed below the CTAs.

**Page Section Structure:**

| Section | Background | Section Label | Key Elements |
| :--- | :--- | :--- | :--- |
| Social Proof | White | "TRUSTED BY..." (small caps) | Avatar circles, company names, social count |
| The Problem | White | "THE PROBLEM" (Clarity Teal) | H2 with teal emphasis, icon list, visual |
| How It Works | Warm Off-White | "HOW IT WORKS" (Clarity Teal) | 3-column numbered step cards |
| Features | White | "FEATURES" (Clarity Teal) | 2-column feature grid with icons |
| Before vs. After | Warm Off-White | "BEFORE VS. AFTER" (Clarity Teal) | Split comparison visual |
| Testimonials | White | "TESTIMONIALS" (Clarity Teal) | 3 testimonial cards |
| Pricing | Warm Off-White | "PRICING" (Clarity Teal) | 2 pricing cards |
| CTA Banner | Deep Focus Blue | "GET STARTED TODAY" (Clarity Teal) | H2, subtext, primary CTA |
| Footer | Deep Focus Blue (darker) | — | Logo, tagline, nav columns, copyright |

### 4.2 Application — Authentication Screens

**Sign In Page:**

A centered card layout on a Warm Off-White background. The card contains the logo, an H2 heading "Welcome back", an email input, a password input, a "Sign in" primary button, and a "Forgot password?" link. A divider separates the form from a "Sign in with Google" secondary button. A link to the sign-up page is included at the bottom.

**Sign Up / Onboarding:**

A multi-step onboarding flow:
1. **Step 1 — Account**: Email, password, and full name fields.
2. **Step 2 — Workspace**: Workspace name and slug (auto-generated from name).
3. **Step 3 — Invite Team**: Optional email invitations for team members.
4. **Step 4 — Connect**: Optional quick-start integration choices (Slack, email).

### 4.3 Application — Main Layout

The main application layout consists of a persistent left sidebar and a main content area.

**Left Sidebar:**

The sidebar has a Deep Focus Blue background. At the top, the workspace logo and name are displayed with a dropdown for switching workspaces. The navigation links are organized into groups:

- *Main*: Dashboard, Feedback Inbox, Themes, Roadmap
- *Intelligence*: Customers, Deals
- *Support* (Phase 2): Support Inbox, Pain Dashboard
- *Settings*: Workspace Settings, Integrations, Team, Billing

At the bottom, the user avatar, name, and a settings link are displayed.

**Top Bar:**

A white top bar with a page title on the left and contextual action buttons on the right (e.g., "Add Feedback", "Run AI Triage"). A global search input and a notification bell icon are also present.

### 4.4 Application — Core Screens

**Dashboard (Product Opportunity Dashboard):**

The dashboard provides a high-level overview of the product signal landscape. It is organized into a summary metrics row at the top, followed by a main content area.

- *Metrics Row*: Four stat cards showing Total Feedback, Open Themes, Revenue at Risk (ARR from top themes), and Themes Resolved This Month.
- *Top Themes Panel*: A ranked list of themes with their request count, total ARR, and priority score. Each theme has a "View" and "Add to Roadmap" action.
- *Feedback Trend Chart*: A line chart showing feedback volume over the past 30 days.
- *Weekly Digest Preview*: A card showing the upcoming weekly digest summary.

**Feedback Inbox:**

A two-panel layout. The left panel shows a filterable, sortable list of all feedback items. Each list item shows the source icon (Slack, email, portal, etc.), a truncated preview of the feedback text, the submitting customer's name, and the submission date. The right panel shows the full detail of the selected feedback item, including the full text, customer profile, linked theme, AI summary, and duplicate suggestions.

**Themes View:**

A card-based grid or list view of all AI-generated themes. Each theme card shows the theme title, an AI-generated one-sentence summary, the count of linked feedback items, the total ARR represented by the linked customers, and the priority score. Actions on each card include "View Details", "Merge with Another Theme", and "Add to Roadmap".

**Theme Detail Page:**

A full-page view for a single theme. The top section shows the theme title, summary, and key metrics. Below, a tabbed interface shows: *Feedback* (all linked items), *Customers* (all customers who submitted linked feedback, with their ARR), and *Roadmap* (the linked roadmap item, if any).

**Roadmap View:**

A Kanban-style board with columns for each roadmap status: `Considering`, `Planned`, `In Progress`, `Shipped`, `Declined`. Each card on the board represents a roadmap item, showing the title, linked theme, and the number of customers who will be notified when it ships.

**Customer Profiles:**

A table view of all customers with columns for Name, Company, ARR, Segment, Feedback Count, and Last Activity. Clicking a customer opens a detail panel showing their profile, all their submitted feedback, and their linked deals.

**Public Feedback Portal:**

A standalone, publicly accessible page for a workspace. It has a simple, clean design with the workspace logo, a text area for submitting feedback, and a list of existing roadmap items for customers to vote on. The design uses the Warm Off-White background with Deep Focus Blue and Clarity Teal accents.

### 4.5 Application — Settings Screens

**Workspace Settings**: General settings including workspace name, logo, default locale, and timezone.

**Integrations**: A grid of integration cards (Slack, Email, Zendesk, Intercom, CSV). Each card shows the integration logo, connection status, and a "Connect" or "Configure" button.

**Team Management**: A table of team members with their name, email, role, and last active date. An "Invite Member" button opens a modal.

**Billing**: Displays the current plan, usage metrics, and a button to upgrade or manage the subscription via Stripe.

---

## 5. System Architecture

### 5.1 Overview

TriageInsight is a multi-tenant SaaS application built on a clean, modular architecture. The frontend is a Next.js application deployed on Vercel. The backend is a NestJS API deployed on AWS. An asynchronous AI pipeline powered by Redis and BullMQ handles computationally intensive tasks without blocking the main request cycle.

### 5.2 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          Client Layer                            │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Next.js Frontend (Vercel)                                  │ │
│  │  React + TypeScript + Tailwind CSS + shadcn/ui              │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                              │ HTTPS / REST API
┌──────────────────────────────────────────────────────────────────┐
│                          API Layer (AWS)                         │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  NestJS Backend API                                         │ │
│  │  JWT Auth · RBAC · Rate Limiting · DTO Validation           │ │
│  └─────────────────────────────────────────────────────────────┘ │
│         │                    │                    │              │
│  ┌──────▼──────┐   ┌─────────▼────────┐   ┌──────▼──────┐      │
│  │ PostgreSQL  │   │  Redis + BullMQ  │   │   AWS S3    │      │
│  │ + pgvector  │   │  (Job Queues)    │   │  (Storage)  │      │
│  └─────────────┘   └─────────────────-┘   └─────────────┘      │
│                             │                                    │
│                    ┌────────▼────────┐                          │
│                    │  AI Workers     │                          │
│                    │  OpenAI API     │                          │
│                    └─────────────────┘                          │
└──────────────────────────────────────────────────────────────────┘
```

### 5.3 Tech Stack Summary

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend** | Next.js 14 + TypeScript | Server-side rendering, App Router, excellent DX. |
| **UI Library** | Tailwind CSS + shadcn/ui | Rapid, consistent UI development with full customization. |
| **Backend** | NestJS + TypeScript | Modular, scalable, strongly typed Node.js framework. |
| **Database** | PostgreSQL | Reliable, ACID-compliant relational database. |
| **Vector Search** | pgvector extension | Enables semantic similarity search within PostgreSQL. |
| **ORM** | Prisma | Type-safe database client with excellent migration tooling. |
| **Queue** | Redis + BullMQ | Robust job queue for async AI and notification tasks. |
| **File Storage** | AWS S3 | Scalable, durable object storage for uploads. |
| **AI** | OpenAI API | Embeddings (`text-embedding-3-small`) and LLM (`gpt-4o`). |
| **Payments** | Stripe | Industry-standard subscription billing. |
| **Deployment** | AWS (ECS/Lambda) + Vercel | Scalable cloud infrastructure. |

---

## 6. Domain Model

### 6.1 Core Entities

The following table describes the primary domain entities and their key attributes:

| Entity | Description | Key Attributes |
| :--- | :--- | :--- |
| **Workspace** | A tenant organization. All data is scoped to a workspace. | `id`, `name`, `slug`, `plan`, `locale` |
| **User** | A team member within a workspace. | `id`, `email`, `name`, `role` (Admin/Editor/Viewer) |
| **Customer** | An end-customer of the workspace's product. | `id`, `name`, `company`, `arr`, `segment` |
| **Feedback** | A single piece of customer feedback from any source. | `id`, `content`, `source`, `status`, `embedding`, `customerId` |
| **Theme** | A cluster of related feedback items identified by AI. | `id`, `title`, `summary`, `priorityScore`, `totalArr` |
| **RoadmapItem** | A product decision derived from one or more themes. | `id`, `title`, `status`, `themeId` |
| **Deal** | A revenue deal linked to a customer, used for weighting. | `id`, `name`, `value`, `stage`, `customerId` |
| **Integration** | A configured connection to a third-party service. | `id`, `provider`, `config`, `status`, `workspaceId` |

### 6.2 Entity Relationships

The system is multi-tenant, with the `Workspace` entity serving as the root of all data ownership. A `Workspace` has many `Users`, `Customers`, `Feedback` items, `Themes`, and `RoadmapItems`. A `Customer` can submit many `Feedback` items. A `Theme` contains many `Feedback` items. A `RoadmapItem` is generated from a `Theme`.

---

## 7. Monorepo Folder Structure

The project is structured as a monorepo using **pnpm workspaces** to enable code sharing between the frontend and backend.

```
/triageinsight/
├── apps/
│   ├── api/                          # NestJS Backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── workspace/
│   │   │   │   ├── users/
│   │   │   │   ├── customers/
│   │   │   │   ├── feedback/
│   │   │   │   ├── themes/
│   │   │   │   ├── roadmap/
│   │   │   │   ├── ai/
│   │   │   │   ├── integrations/
│   │   │   │   ├── uploads/
│   │   │   │   ├── support/          # Phase 2
│   │   │   │   ├── analytics/
│   │   │   │   ├── digest/
│   │   │   │   └── audit/
│   │   │   ├── common/               # Guards, decorators, pipes
│   │   │   ├── prisma/               # Prisma service
│   │   │   └── main.ts
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── package.json
│   │
│   └── web/                          # Next.js Frontend
│       ├── app/
│       │   ├── (auth)/               # Login, signup pages
│       │   ├── (app)/                # Authenticated app routes
│       │   │   ├── dashboard/
│       │   │   ├── feedback/
│       │   │   ├── themes/
│       │   │   ├── roadmap/
│       │   │   ├── customers/
│       │   │   ├── support/          # Phase 2
│       │   │   └── settings/
│       │   └── portal/               # Public feedback portal
│       ├── components/
│       ├── lib/
│       └── package.json
│
├── packages/
│   ├── ui/                           # Shared shadcn/ui components
│   ├── types/                        # Shared TypeScript types
│   ├── i18n/                         # i18n locale files
│   │   └── locales/
│   │       ├── en/
│   │       ├── es/
│   │       ├── fr/
│   │       ├── de/
│   │       ├── hi/
│   │       └── bn/
│   └── config/
│       ├── eslint/
│       └── tsconfig/
│
├── package.json
└── pnpm-workspace.yaml
```

---

## 8. Backend Module Specifications

Each NestJS module follows a standard structure: `controller`, `service`, `repository`, `dto`, and `entity`. All modules are scoped to a `workspaceId` to enforce multi-tenant isolation.

| Module | Key Responsibilities | Key Endpoints |
| :--- | :--- | :--- |
| **auth** | JWT issuance, refresh, Google OAuth, password reset. | `POST /auth/login`, `POST /auth/register`, `POST /auth/refresh` |
| **workspace** | CRUD for workspaces, plan management, invite tokens. | `GET /workspace`, `PATCH /workspace`, `POST /workspace/invite` |
| **users** | User profile management, role assignment. | `GET /users`, `PATCH /users/:id`, `DELETE /users/:id` |
| **customers** | Customer profile CRUD, ARR tracking, segment management. | `GET /customers`, `POST /customers`, `PATCH /customers/:id` |
| **feedback** | Ingest, list, update, and delete feedback. Handles source routing. | `GET /feedback`, `POST /feedback`, `PATCH /feedback/:id` |
| **themes** | List, create, merge, and manage themes. | `GET /themes`, `POST /themes`, `POST /themes/:id/merge` |
| **roadmap** | CRUD for roadmap items, status transitions. | `GET /roadmap`, `POST /roadmap`, `PATCH /roadmap/:id/status` |
| **ai** | Trigger AI jobs, retrieve AI job status. | `POST /ai/deduplicate`, `POST /ai/cluster`, `GET /ai/jobs/:id` |
| **integrations** | Connect, configure, and disconnect third-party integrations. | `GET /integrations`, `POST /integrations/slack/connect` |
| **uploads** | Generate pre-signed S3 URLs, process uploaded files. | `POST /uploads/presign`, `POST /uploads/voice` |
| **digest** | Generate and send the weekly insight digest. | `POST /digest/send` (internal, triggered by cron) |
| **analytics** | Serve data for the dashboard and charts. | `GET /analytics/dashboard`, `GET /analytics/trends` |

---

## 9. AI Pipeline Design

All AI tasks run asynchronously via the BullMQ job queue to avoid blocking the main API request cycle. The pipeline is orchestrated by the `ai` module.

### 9.1 Duplicate Detection Pipeline

When a new feedback item is ingested, the following steps occur asynchronously:

1. A `generate-embedding` job is added to the queue.
2. The AI worker calls the OpenAI Embeddings API (`text-embedding-3-small`) with the feedback content.
3. The resulting vector is stored in the `feedback` table's `embedding` column (pgvector).
4. A `detect-duplicates` job is added to the queue.
5. The AI worker performs a cosine similarity search using pgvector against all existing feedback embeddings in the same workspace.
6. Feedback items with a similarity score above a configurable threshold (e.g., 0.92) are flagged as potential duplicates and surfaced to the user for review.

### 9.2 Theme Clustering Pipeline

The theme clustering pipeline runs on demand (triggered by the user) or on a scheduled basis:

1. A `cluster-themes` job is added to the queue.
2. The AI worker retrieves all unclustered feedback embeddings for the workspace.
3. A k-means or HDBSCAN clustering algorithm groups the embeddings into clusters.
4. For each cluster, a `generate-theme-summary` job is dispatched.
5. The AI worker calls the OpenAI Chat Completions API (`gpt-4o`) with the feedback texts from the cluster and generates a theme title and a one-sentence summary.
6. A new `Theme` record is created and all feedback items in the cluster are linked to it.

### 9.3 Feedback Summarization

When a user views a feedback item, if no summary exists, a `summarize-feedback` job is dispatched. The AI worker calls the OpenAI Chat Completions API to generate a concise, one-sentence summary of the feedback content and stores it on the record.

### 9.4 Support Issue Spike Detection (Phase 2)

When new support tickets are ingested from Zendesk or Intercom:

1. Embeddings are generated for each ticket.
2. A `detect-spikes` job analyzes the volume and semantic similarity of recent tickets.
3. If a cluster of semantically similar tickets exceeds a configurable volume threshold within a time window (e.g., 10 similar tickets in 24 hours), an issue spike alert is created and surfaced on the Pain Dashboard.

---

## 10. Internationalization Strategy

TriageInsight is internationalization-ready from day one. The strategy ensures that no hardcoded UI text exists in the codebase.

### 10.1 Supported Locales

The initial supported locales are English (`en`), Spanish (`es`), French (`fr`), German (`de`), Hindi (`hi`), and Bengali (`bn`).

### 10.2 Translation Namespaces

Translations are organized into namespaces corresponding to major application areas:

| Namespace | Scope |
| :--- | :--- |
| `common` | Shared UI elements: buttons, labels, errors, navigation. |
| `auth` | Authentication screens: login, signup, password reset. |
| `dashboard` | Dashboard metrics, charts, and digest preview. |
| `feedback` | Feedback inbox, detail view, and submission form. |
| `themes` | Theme cards, detail view, and merge workflow. |
| `roadmap` | Roadmap board, item cards, and status labels. |
| `support` | Support inbox, pain dashboard (Phase 2). |
| `settings` | All settings screens: workspace, team, integrations, billing. |
| `publicPortal` | The public-facing feedback portal. |

### 10.3 Locale Preferences

Each workspace has a `defaultLocale` setting. Each user can override this with a personal `locale` preference. Date and currency formatting are handled using the `Intl` browser API, respecting the active locale. The public portal uses the workspace's default locale.

---

## 11. Security & Compliance

### 11.1 Authentication & Authorization

Authentication is handled via **JWT** (JSON Web Tokens). Access tokens have a short expiry (15 minutes) and are refreshed using long-lived refresh tokens stored in an HTTP-only cookie. Authorization is enforced via **RBAC** (Role-Based Access Control) with the following roles:

| Role | Permissions |
| :--- | :--- |
| **Admin** | Full access: manage workspace, billing, team, all data. |
| **Editor** | Create, edit, and delete feedback, themes, and roadmap items. |
| **Viewer** | Read-only access to all data within the workspace. |
| **Customer** | Submit feedback via the public portal only. |

### 11.2 Multi-Tenant Isolation

All database queries are scoped by `workspaceId`. A NestJS guard is applied globally to inject the `workspaceId` from the JWT into every request context, preventing cross-tenant data access.

### 11.3 Additional Security Measures

Rate limiting is applied at the API gateway level to prevent abuse. All incoming DTOs are validated using `class-validator` and `class-transformer`. An audit log is maintained for all significant actions (e.g., data deletion, role changes, integration connections). All data in transit is encrypted via TLS. All data at rest in PostgreSQL and S3 is encrypted.

---

## 12. Implementation Roadmap

### 12.1 Phase 1 — Feedback Intelligence

**Launch Target: June 2026**

| Sprint | Features | Priority |
| :--- | :--- | :--- |
| **Sprint 1** | Monorepo setup, auth module, workspace creation, user management, RBAC. | Critical |
| **Sprint 2** | Customer profiles (ARR, segment), deal tracking, public feedback portal. | Critical |
| **Sprint 3** | Feedback ingestion (portal, email, CSV), feedback inbox UI. | Critical |
| **Sprint 4** | Slack integration, voice recording upload, transcription pipeline. | High |
| **Sprint 5** | AI embedding pipeline, duplicate detection, merge workflow UI. | Critical |
| **Sprint 6** | AI theme clustering, theme management UI, theme detail page. | Critical |
| **Sprint 7** | Priority scoring engine, revenue impact calculation, dashboard. | High |
| **Sprint 8** | Roadmap creation, status workflow, public roadmap page. | High |
| **Sprint 9** | Weekly insight digest (generation + email delivery). | Medium |
| **Sprint 10** | Billing (Stripe), onboarding flow, polish, and QA. | Critical |

### 12.2 Phase 2 — Support Intelligence

| Sprint | Features | Priority |
| :--- | :--- | :--- |
| **Sprint 11** | Zendesk integration, ticket ingestion pipeline. | Critical |
| **Sprint 12** | Intercom integration, ticket ingestion pipeline. | Critical |
| **Sprint 13** | Ticket clustering, issue spike detection algorithm. | Critical |
| **Sprint 14** | Product Pain Dashboard UI, support-feedback correlation. | High |

---

*© 2026 TriageInsight. Confidential.*
