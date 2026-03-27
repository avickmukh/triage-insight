# TriageInsight: Enterprise Pricing & Packaging Strategy

**Audience:** TriageInsight Founders & Leadership
**Purpose:** To design a scalable, value-driven pricing architecture that supports growth from self-serve SMBs to large enterprise accounts.
**Version:** 1.0 (March 24, 2026)

---

## Introduction

This document outlines a comprehensive pricing and packaging strategy for TriageInsight. It is designed to align our commercial model with the unique value of our AI-driven customer intelligence platform, moving beyond simple seat-based pricing to capture the value of the insights we generate. The goal is to create a clear, scalable ladder that encourages product-led growth at the low end while maximizing annual recurring revenue (ARR) and expansion from enterprise customers at the high end.

---

## 1. Pricing Philosophy

Our pricing philosophy is to **price for intelligence, not just access**. Traditional SaaS pricing is based on seats, which works when the primary value is user collaboration. TriageInsight's primary value is the AI-generated intelligence that helps businesses make better product decisions. Therefore, our pricing must be tied to the volume of data we analyze and the depth of the insights we provide.

We will adopt a **hybrid pricing model** that combines:

1.  **A Usage-Based Primary Metric:** This directly ties cost to the value received from our AI engine.
2.  **A Seat-Based Component:** This captures the collaborative value of the platform for larger teams.
3.  **Feature-Gated Tiers:** This creates a clear upsell path for more advanced capabilities.

This hybrid approach allows us to offer a low-friction entry point for small teams, while ensuring that our revenue scales as a customer's usage and reliance on our platform grows.

## 2. Market Positioning & Pricing Bands

| Band | Target Company | Use Case Maturity | Decision-Maker | Willingness to Pay (Annual) |
| :--- | :--- | :--- | :--- | :--- |
| **A. SMB** | < 50 employees | Early-stage, consolidating feedback from a few sources (e.g., Slack, email). | Founder, Head of Product | $0 - $5,000 |
| **B. Growth** | 50 - 500 employees | Scaling product team, integrating multiple data sources (Zendesk, Intercom, surveys). | Director of Product, VP Product | $5,000 - $50,000 |
| **C. Enterprise** | > 500 employees | Mature product ops, requires advanced analytics, security, and dedicated support. | CPO, VP Engineering, CTO | $50,000 - $250,000+ |

## 3. Core Pricing Metrics

Our pricing will be built around a primary value metric and several secondary metrics that unlock at higher tiers.

### 3.1. Primary Metric: Signals

A **"Signal"** is defined as a single, discrete piece of customer feedback that is ingested and analyzed by TriageInsight. This includes:

-   A single piece of feedback from the Inbox
-   A single support ticket from Zendesk/Intercom
-   A single response to a survey question
-   A single customer call transcript from Gong

**Why Signals?**
-   It directly correlates with the AI workload and our cost of goods sold (COGS).
-   It is a simple, understandable metric for customers.
-   It scales naturally as a customer integrates more sources and their business grows.

### 3.2. Secondary Metrics

-   **Seats:** The number of users with access to the platform. This becomes a key lever in the Growth and Enterprise tiers.
-   **Integrations:** The number of connected data sources.
-   **Advanced AI Insights:** Access to more sophisticated AI models and analytics.

## 4. Tier Packaging Design

This five-tier structure is designed to create a smooth upgrade path from a free, product-led growth entry point to a full enterprise offering.

| Tier | Price (Annual) | Primary User | Core Value Proposition |
| :--- | :--- | :--- | :--- |
| **Free** | $0 | Individuals, small startups | "Organize your customer feedback in one place." |
| **Starter** | ~$1,200 | Small teams | "Connect your key feedback channels and find your first insights." |
| **Growth** | ~$6,000 | Growing product teams | "Quantify your product priorities with AI-driven intelligence." |
| **Business** | ~$24,000 | Mature product organizations | "Drive your product strategy with comprehensive customer intelligence and analytics." |
| **Enterprise** | $50,000+ | Large enterprises | "A dedicated intelligence partner with enterprise-grade security, support, and scale." |

### 4.1. Detailed Tier Breakdown

| Feature | Free | Starter | Growth | Business | Enterprise |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Signals / month** | 100 | 1,000 | 5,000 | 20,000 | Custom |
| **Seats Included** | 1 | 3 | 5 | 10 | Custom |
| **Integrations** | 1 | 3 | 5 | Unlimited | Custom |
| **Basic AI Clustering** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Prioritization Engine** | | ✓ | ✓ | ✓ | ✓ |
| **Roadmap Features** | | ✓ | ✓ | ✓ | ✓ |
| **Advanced AI Insights** | | | ✓ | ✓ | ✓ |
| **Customer Risk Analytics** | | | ✓ | ✓ | ✓ |
| **Advanced Analytics** | | | | ✓ | ✓ |
| **Data Retention** | 1 year | 3 years | 5 years | Unlimited | Unlimited |
| **Dedicated Deployment** | | | | | Add-on |
| **SLA & Premium Support**| | | | | ✓ |

## 5. Enterprise Packaging Model

The Enterprise tier is a custom-built solution, not a one-size-fits-all plan. It starts with the **Business** tier as a baseline and adds enterprise-specific capabilities as either core components or paid add-ons.

| Component | Included / Add-on | Description |
| :--- | :--- | :--- |
| **Custom Signal Volume** | Included | A high-volume signal ingestion limit tailored to the customer’s needs. |
| **Custom Seat Count** | Included | A specific number of user seats included in the base platform fee. |
| **SLA & Premium Support** | Included | A 99.9% uptime SLA and a dedicated account manager with prioritized support channels. |
| **Advanced Security** | Included | Features like audit logs and role-based access control are standard. |
| **Dedicated Deployment** | Add-on | Physically isolated infrastructure (DB, S3, Redis). Priced as a flat annual fee (e.g., +$25,000/year) to cover infrastructure and management overhead. |
| **Advanced Integrations** | Add-on | Custom-built integrations to proprietary internal systems. Priced based on complexity. |
| **SAML/OIDC Integration** | Add-on | Integration with the customer’s identity provider (e.g., Okta, Azure AD). Priced as a flat annual fee (e.g., +$5,000/year). |
| **Data Residency** | Add-on | Guarantee that all data is stored and processed in a specific geographic region (e.g., EU). Included with Dedicated Deployment. |

## 6. Usage Expansion & ARR Growth Levers

Our pricing model is designed to grow ARR from within our existing customer base. The primary expansion levers are:

1.  **Signal Volume:** As a customer’s business grows, they will naturally ingest more signals. We will offer overage charges for exceeding monthly limits, but the primary goal is to encourage an upgrade to the next tier.
2.  **Seat Add-ons:** Once a team grows beyond the number of seats included in their plan, they can purchase additional seats, providing a linear revenue growth vector.
3.  **Feature Upsell:** The tier structure is designed to make the features in the next plan up highly desirable. For example, a team on the **Starter** plan will want the **Advanced AI Insights** and **Customer Risk Analytics** in the **Growth** plan.
4.  **Enterprise Add-ons:** The a la carte menu of enterprise features (Dedicated Deployment, SAML, etc.) provides significant opportunities for ARR expansion from our largest customers.

## 7. Pricing Psychology & Positioning

-   **Anchoring:** The **Business** plan at ~$24,000/year serves as the anchor. It makes the **Growth** plan at ~$6,000 feel like a great value, and it sets a strong starting point for enterprise negotiations.
-   **Negotiation Room:** The Enterprise plan is custom. This gives the sales team flexibility to tailor a solution that meets the customer’s budget and needs, while preserving the core value of the platform.
-   **Discounting Strategy:** Standard discounts should be reserved for annual pre-payment (e.g., 10-15%). Deeper discounts should only be offered in exchange for multi-year contracts or case studies.
-   **Pilot Pricing:** Offer a 3-month paid pilot of the **Business** plan for a flat fee (e.g., $5,000). The goal is not to make money on the pilot, but to prove the value and convert to a full annual contract.

## 8. Competitive Pricing Comparison

| Competitor | Primary Metric | TriageInsight’s Position |
| :--- | :--- | :--- |
| **Canny** | Tracked Users | **Price Higher.** Canny is a feature voting tool. TriageInsight is an AI intelligence platform. We should be priced at a significant premium because we provide strategic insights, not just a list of feature requests. |
| **Productboard** | Makers (Seats) | **Price Competitively.** Productboard is a full product management suite. Our pricing should be in the same ballpark for a similar number of users, but our value proposition is different: we focus on the AI-driven “why” behind the roadmap, not just the “what.” |
| **Pendo** | Monthly Active Users (MAUs) | **Price Lower (initially).** Pendo is a product analytics giant. We are not competing on analytics. We should be an affordable, high-ROI addition to their stack, not a replacement. |
| **Gong** | Seats + Platform Fee | **Emulate Conceptually.** Gong successfully prices for intelligence. Their high per-seat cost and platform fee demonstrate that the market is willing to pay a premium for AI-driven insights that impact revenue. We should follow this model for our Enterprise tier. |
| **Zendesk Analytics** | Per Agent / Month | **Position as a Strategic Upgrade.** Zendesk’s built-in analytics are operational. TriageInsight provides strategic product intelligence *from* Zendesk data. We are an investment in making the product better, not just managing support tickets more efficiently. |

## 9. Packaging Roadmap

This is a phased approach to rolling out our pricing and packaging.

-   **Phase 1 (Launch - Next 3 Months):**
    -   Implement the **Free**, **Starter**, and **Growth** tiers.
    -   Focus on product-led growth and gathering initial customer feedback.
    -   The **Business** and **Enterprise** tiers are available but handled via manual sales conversations.

-   **Phase 2 (Mid-Market Expansion - Next 6 Months):**
    -   Introduce the self-serve **Business** tier with automated billing.
    -   Build out the most common enterprise add-ons (e.g., SAML).
    -   Refine the "Signals" metric based on real-world usage data.

-   **Phase 3 (Enterprise Optimization - Next 12 Months):**
    -   Formalize the Enterprise packaging with a clear menu of add-ons.
    -   Potentially introduce more sophisticated usage metrics (e.g., AI insights generated).
    -   Optimize pricing based on cohort analysis and willingness to pay.

## 10. ARR Projection Model

This is a simplified model to illustrate the path to key ARR milestones. It assumes a healthy mix of self-serve and sales-led customers.

### Path to $1M ARR (Year 1-2)

| Tier | # of Customers | Avg. ACV | Total ARR |
| :--- | :--- | :--- | :--- |
| Starter | 150 | $1,200 | $180,000 |
| Growth | 100 | $6,000 | $600,000 |
| Business | 10 | $24,000 | $240,000 |
| **Total** | **260** | **$3,923** | **$1,020,000** |

### Path to $5M ARR (Year 2-3)

| Tier | # of Customers | Avg. ACV | Total ARR |
| :--- | :--- | :--- | :--- |
| Starter | 300 | $1,500 | $450,000 |
| Growth | 400 | $7,500 | $3,000,000 |
| Business | 50 | $30,000 | $1,500,000 |
| Enterprise | 5 | $75,000 | $375,000 |
| **Total** | **755** | **$6,987** | **$5,325,000** |

### Path to $20M ARR (Year 4-5)

| Tier | # of Customers | Avg. ACV | Total ARR |
| :--- | :--- | :--- | :--- |
| Growth | 800 | $10,000 | $8,000,000 |
| Business | 250 | $40,000 | $10,000,000 |
| Enterprise | 40 | $150,000 | $6,000,000 |
| **Total** | **1,090** | **$22,018** | **$24,000,000** |

*Note: This model simplifies by excluding the Free tier and assuming some price increases over time.*

## 11. Founder Pricing Guidance

-   **When to introduce the Enterprise tier?**
    > From day one. Even if it is just a "Contact Us" button, it signals that you are building a serious platform and anchors your value. The first few enterprise deals will be custom, and that’s okay. Use them to learn.

-   **How to price pilots?**
    > Always charge for pilots. A free pilot attracts unserious customers. A paid pilot (even a small amount) ensures the customer has skin in the game and is committed to evaluating the platform properly. A 3-month pilot of the Business plan for a flat fee of $5,000 is a good starting point.

-   **How to avoid underpricing AI?**
    > Tie your primary metric to the AI workload (i.e., "Signals"). Do not be afraid to talk about the cost and value of the intelligence you are providing. Position it as an investment in making better, more profitable decisions, not as a cost center.

-   **How to sell ROI, not features?**
    > Instead of listing features, talk about outcomes. Instead of "AI clustering," say "Instantly find the hidden themes in thousands of customer comments." Instead of "Prioritization Engine," say "Confidently decide which features to build next based on revenue impact and customer demand." Frame every conversation around the value the customer will receive, not the features they will get.
