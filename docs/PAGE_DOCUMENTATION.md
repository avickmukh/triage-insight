# TriageInsight Page Documentation

This document provides a comprehensive overview of every page within the TriageInsight application. It is designed to help team members, stakeholders, and new users understand the purpose and functionality of each part of the platform.

## How to Use This Document

Each section corresponds to a major area of the application, as reflected in the redesigned sidebar navigation. Within each section, individual pages are detailed with the following information:

- **Page Title:** The name of the page as it appears in the UI.
- **URL Path:** The typical URL structure for the page.
- **Purpose:** A concise, high-level explanation of what the page is for. Written in plain English for a non-technical audience.
- **Key Functionality:** A breakdown of the specific actions and capabilities available on the page.
- **How to Explain It:** A simple, one-sentence pitch you can use to explain the page to a new user or a customer.

---

_The following documentation reflects the redesigned navigation and simplified dashboard as of March 24, 2026._

## 1. Workspace

The Workspace section contains the core day-to-day tools for managing your product and understanding customer feedback.

### 1.1. Home

| | |
|---|---|
| **Page Title** | Home |
| **URL Path** | `/:orgSlug/app` |
| **Purpose** | To provide a simple, founder-friendly overview of what is happening across your product *today*. It avoids jargon and surfaces the most important, actionable insights without overwhelming you with metrics. |
| **Key Functionality** | - **Today's Summary:** A single, plain-English sentence summarizing the most critical event or trend (e.g., a new theme emerging, a key customer at risk).<br>- **Quick Actions:** Four large, clear buttons linking directly to the platform's most powerful features: the Intelligence Hub and the Prioritization Engine.<br>- **Insight Cards:** A grid of simple, clear cards showing:<br>  - *What customers are asking about:* Highlights new or accelerating feedback themes.<br>  - *Customers at risk of leaving:* Flags accounts with high churn risk scores and shows the revenue at stake.<br>  - *Support pressure:* Shows the current open support ticket volume and any unusual spikes.<br>  - *Roadmap health:* A simple score indicating if your roadmap is on track, at risk, or needs attention. |
| **How to Explain It** | "This is your daily starting point — it tells you the one most important thing you need to know about your product and customers right now." |

### 1.2. Inbox

| | |
|---|---|
| **Page Title** | Inbox |
| **URL Path** | `/:orgSlug/app/inbox` |
| **Purpose** | To centralize and process all incoming customer feedback from every source (email, support tickets, surveys, social media, etc.) in one unified stream. |
| **Key Functionality** | - **Unified Feed:** A single list of all feedback items, regardless of origin.<br>- **Triage & Tagging:** Quickly read, categorize, and link feedback to existing themes or product features.<br>- **Assign & Collaborate:** Assign feedback items to team members for follow-up.<br>- **Filter & Search:** Instantly find feedback by source, customer, keyword, or date. |
| **How to Explain It** | "This is where all raw customer feedback lands in one place, ready for you to organize and link to your product." |

### 1.3. Themes

| | |
|---|---|
| **Page Title** | Themes |
| **URL Path** | `/:orgSlug/app/themes` |
| **Purpose** | To automatically group related pieces of feedback into "themes," allowing you to see the bigger picture and understand the most common requests or complaints without reading thousands of individual messages. |
| **Key Functionality** | - **Automated Clustering:** AI automatically groups similar feedback items into themes (e.g., "Request for Dark Mode," "Issues with Billing Page").<br>- **Theme Dashboard:** View a list of all themes, sortable by customer count, revenue impact, or recent activity.<br>- **Drill Down:** Click into any theme to see all the underlying feedback and the customers who provided it.<br>- **Merge & Manage:** Manually merge similar themes or edit theme titles for clarity. |
| **How to Explain It** | "This page automatically organizes thousands of feedback messages into a few key themes, so you can instantly see what most people are asking for." |

### 1.4. Roadmap

| | |
|---|---|
| **Page Title** | Roadmap |
| **URL Path** | `/:orgSlug/app/roadmap` |
| **Purpose** | To build, manage, and visualize your product roadmap. It connects your development plan directly to the customer feedback and revenue data that justifies it. |
| **Key Functionality** | - **Kanban View:** A familiar drag-and-drop interface with columns like Backlog, Planned, In Progress, and Shipped.<br>- **Data-Rich Items:** Each roadmap item can be linked to the themes and specific feedback requests that inspired it.<br>- **Prioritization Scores:** See the CIQ (Customer Intelligence Quotient) score for each item, helping you justify its position.<br>- **Public & Private Roadmaps:** Maintain an internal roadmap for your team and publish a simplified, public-facing version for your customers. |
| **How to Explain It** | "This is where you plan what to build next, with every decision backed by real customer feedback and data." |

---

## 2. Intelligence Hub

The Intelligence Hub is the analytical brain of TriageInsight. It moves beyond simple feedback collection to provide deep, actionable insights about your customers and product strategy.

### 2.1. CIQ Overview

| | |
|---|---|
| **Page Title** | CIQ Overview |
| **URL Path** | `/:orgSlug/app/intelligence` |
| **Purpose** | To serve as the main dashboard for the Customer Intelligence Quotient (CIQ) engine, providing a high-level summary of the most important strategic insights derived from your customer data. |
| **Key Functionality** | - **Top Insights:** Surfaces the most impactful findings, such as features with the highest revenue potential or customer segments with the lowest satisfaction.<br>- **Strategic Feed:** A live feed of recommendations and alerts generated by the CIQ engine.<br>- **Drill-Downs:** Provides clear navigation to more detailed analysis pages like Feature Ranking and Customer IQ. |
| **How to Explain It** | "This is the command center for customer intelligence, giving you a bird's-eye view of the most strategic insights from your data." |

### 2.2. Feature Ranking

| | |
|---|---|
| **Page Title** | Feature Ranking |
| **URL Path** | `/:orgSlug/app/intelligence/features` |
| **Purpose** | To rank every single feature request from all your customers not just by popularity, but by the actual revenue and strategic importance of the customers asking for it. |
| **Key Functionality** | - **Ranked List:** A clear, sortable list of all requested features.<br>- **CIQ Score:** Each feature is scored based on factors like total ARR of requesting customers, churn risk, and strategic fit.<br>- **Customer Drill-Down:** Click on any feature to see exactly which customers requested it and how much they're worth.<br>- **Opportunity Sizing:** Instantly see the potential revenue impact of building any given feature. |
| **How to Explain It** | "This page tells you exactly what to build next by ranking every feature request based on the revenue attached to it." |

### 2.3. Customer IQ

| | |
|---|---|
| **Page Title** | Customer IQ |
| **URL Path** | `/:orgSlug/app/intelligence/customers` |
| **Purpose** | To provide a deep, 360-degree view of each customer, combining their feedback, support history, revenue, and health score into a single, actionable profile. |
| **Key Functionality** | - **Customer List:** A searchable and filterable list of all your customers.<br>- **Health & Risk Scores:** Each customer is automatically assigned a health score and a churn risk prediction.<br>- **Detailed Profile:** Click into any customer to see their complete history, including all feedback they've ever given, their support ticket history, their current subscription plan, and their ARR. |
| **How to Explain It** | "This gives you a complete, data-driven profile for every single customer, so you know who is happy, who is at risk, and what they need." |

---

## 3. Prioritization

The Prioritization section provides the tools to move from insight to action, helping you make objective, data-driven decisions about what to build next and how it aligns with your strategy.

### 3.1. Engine

| | |
|---|---|
| **Page Title** | Engine |
| **URL Path** | `/:orgSlug/app/prioritization` |
| **Purpose** | To provide a powerful, 4-dimension scoring engine that allows you to systematically evaluate and prioritize potential features or projects based on criteria you define. |
| **Key Functionality** | - **Custom Scoring Models:** Create your own prioritization models (e.g., RICE, ICE, or a custom model) with weighted criteria like Reach, Impact, Confidence, Effort, Revenue, or Strategic Fit.<br>- **Feature Scoring:** Score features against your chosen model to generate a single, objective priority score.<br>- **Scenario Planning:** Compare how different features stack up under different scoring models to inform strategic discussions. |
| **How to Explain It** | "This is a powerful calculator that helps you make unbiased decisions by scoring every potential feature against the business goals you care about." |

### 3.2. Opportunities

| | |
|---|---|
| **Page Title** | Opportunities |
| **URL Path** | `/:orgSlug/app/prioritization/opportunities` |
| **Purpose** | To automatically surface high-value features and ideas that customers are asking for but are not yet on your official roadmap, ensuring you never miss a key opportunity. |
| **Key Functionality** | - **Gap Analysis:** The system constantly compares customer feedback themes against your roadmap and flags popular requests that have no corresponding planned work.<br>- **Ranked Opportunities:** Presents a list of these "gaps" or "opportunities," ranked by potential revenue impact and customer demand.<br>- **One-Click Roadmap Addition:** Instantly add a promising opportunity to your roadmap for further consideration. |
| **How to Explain It** | "This page acts as your safety net, automatically finding valuable feature ideas that you might have missed." |

### 3.3. Roadmap Fit

| | |
|---|---|
| **Page Title** | Roadmap Fit |
| **URL Path** | `/:orgSlug/app/prioritization/roadmap` |
| **Purpose** | To analyze your current roadmap and assess how well it aligns with customer demand and your strategic priorities, helping you ensure you are building the right things. |
| **Key Functionality** | - **Alignment Score:** Each item on your roadmap is given a "Fit Score" based on how much customer feedback and revenue supports it.<br>- **Visual Alignment Matrix:** A chart that plots roadmap items on a grid of value vs. effort, making it easy to spot low-hanging fruit or misaligned projects.<br>- **Justification Reports:** Generate a one-page summary for any roadmap item showing all the customer data that justifies its existence. |
| **How to Explain It** | "This page checks your current roadmap to make sure you're actually building what your customers want and what will make you money." |

---

## 4. Customers

This section focuses on understanding your customer base as a whole, identifying trends, and generating reports.

### 4.1. Customers

| | |
|---|---|
| **Page Title** | Customers |
| **URL Path** | `/:orgSlug/app/customers` |
| **Purpose** | To provide a macro-level view of your entire customer base, allowing you to segment and analyze them based on various attributes. This is the same underlying data as Customer IQ, but presented for cohort analysis rather than individual deep dives. |
| **Key Functionality** | - **Customer Directory:** A full list of all customers, with key data points like ARR, plan, and health score visible.<br>- **Advanced Filtering & Segmentation:** Create dynamic segments of customers based on any combination of attributes (e.g., "Enterprise customers on the Pro plan with a low health score").<br>- **Bulk Actions:** (Future) Select a segment and perform bulk actions, like sending a targeted email or exporting a list. |
| **How to Explain It** | "This is your complete customer directory, where you can slice and dice your user base to find specific groups and understand trends." |

### 4.2. Reports

| | |
|---|---|
| **Page Title** | Reports |
| **URL Path** | `/:orgSlug/app/reports` |
| **Purpose** | To generate and view pre-built reports on key product and customer metrics. |
| **Key Functionality** | - **Report Library:** A collection of standard reports, such as "Top Feature Requests by ARR," "Churn Drivers Analysis," and "Monthly Feedback Summary."<br>- **Customizable Dashboards:** (Future) Build your own dashboards by combining different report widgets.<br>- **Exporting:** Export reports to PDF or CSV for sharing with your team or board. |
| **How to Explain It** | "This is where you can get clean, presentation-ready reports on your most important customer and product metrics." |

---

## 5. Signals

Signals are the raw, unprocessed inputs from your customers. This section provides tools to manage and analyze specific types of feedback channels.

### 5.1. Voice

| | |
|---|---|
| **Page Title** | Voice |
| **URL Path** | `/:orgSlug/app/voice` |
| **Purpose** | To process and analyze audio feedback, such as sales calls or customer interviews, using speech-to-text and sentiment analysis. |
| **Key Functionality** | - **Audio Upload & Transcription:** Upload audio files (e.g., .mp3, .wav) and get a full, speaker-diarized transcript.<br>- **Sentiment Analysis:** The system automatically analyzes the transcript to identify positive, negative, and neutral sentiment.<br>- **Action Item & Theme Detection:** AI pulls out key action items, questions, and recurring themes from the conversation. |
| **How to Explain It** | "This page listens to your customer calls for you, pulling out the key insights so you don’t have to spend hours taking notes." |

### 5.2. Surveys

| | |
|---|---|
| **Page Title** | Surveys |
| **URL Path** | `/:orgSlug/app/surveys` |
| **Purpose** | To create, send, and analyze customer surveys, from simple NPS polls to detailed product feedback questionnaires. |
| **Key Functionality** | - **Survey Builder:** A simple editor to build surveys with different question types (multiple choice, open text, rating scales).<br>- **Distribution:** Send surveys via email or share a public link.<br>- **Results Analysis:** Automatically analyze open-ended text responses for themes and sentiment, and visualize quantitative data in charts. |
| **How to Explain It** | "This is where you can build, send, and automatically analyze customer surveys." |

### 5.3. Support

| | |
|---|---|
| **Page Title** | Support |
| **URL Path** | `/:orgSlug/app/support` |
| **Purpose** | To integrate with your existing support desk (e.g., Zendesk, Intercom) and analyze ticket data to identify trends, pain points, and emerging issues. |
| **Key Functionality** | - **Ticket Analysis:** Ingests support tickets and uses AI to categorize them and link them to product themes.<br>- **Spike Detection:** Automatically alerts you when there is an unusual increase in tickets related to a specific topic.<br>- **Root Cause Analysis:** Helps you trace support issues back to underlying product gaps or bugs. |
| **How to Explain It** | "This page connects to your helpdesk to find the root cause of support tickets, helping you fix the actual problem instead of just answering questions." |

---

## 6. Admin

This section is only visible to users with the "Admin" role and contains settings for managing the workspace.

### 6.1. Members

| | |
|---|---|
| **Page Title** | Members |
| **URL Path** | `/:orgSlug/admin/members` |
| **Purpose** | To manage team member access to the TriageInsight workspace. |
| **Key Functionality** | - **Invite Members:** Invite new users to the workspace via email.<br>- **Manage Roles:** Assign roles to users (e.g., Admin, Editor, Viewer) to control their permissions.<br>- **Remove Members:** Revoke access for users who no longer need it. |
| **How to Explain It** | "This is where you invite your team and control who can see and do what within the app." |

### 6.2. Billing

| | |
|---|---|
| **Page Title** | Billing |
| **URL Path** | `/:orgSlug/admin/billing` |
| **Purpose** | To manage the workspace subscription, view invoices, and update payment information. |
| **Key Functionality** | - **Plan Management:** View your current plan, upgrade or downgrade, and see usage against plan limits.<br>- **Invoice History:** Access and download all past invoices.<br>- **Payment Method:** Update the credit card on file.<br>- **Stripe Customer Portal:** A secure, one-click link to the Stripe-hosted portal for complete billing management. |
| **How to Explain It** | "This is where you manage your subscription and payment details for TriageInsight." |

### 6.3. Integrations

| | |
|---|---|
| **Page Title** | Integrations |
| **URL Path** | `/:orgSlug/admin/integrations` |
| **Purpose** | To connect TriageInsight to the other tools you use, creating a seamless flow of data. |
| **Key Functionality** | - **Available Integrations:** A gallery of available integrations (e.g., Zendesk, Jira, Slack, Zapier).<br>- **Connect & Configure:** Simple, OAuth-based flows to connect your accounts and configure settings for each integration.<br>- **Status Monitoring:** See the health and status of your active integrations. |
| **How to Explain It** | "This is where you connect TriageInsight to your other tools, like your helpdesk or project manager, to automate your workflow." |

### 6.4. Settings

| | |
|---|---|
| **Page Title** | Settings |
| **URL Path** | `/:orgSlug/admin/settings` |
| **Purpose** | To configure general settings for the workspace. |
| **Key Functionality** | - **Workspace Name & URL:** Change the name and URL slug for your workspace.<br>- **Security Settings:** Configure options like session timeout and two-factor authentication requirements.<br>- **AI & Automation Settings:** Fine-tune the behavior of the CIQ engine and other automated features. |
| **How to Explain It** | "This is where you control the basic settings for your workspace, like its name and security options." |
