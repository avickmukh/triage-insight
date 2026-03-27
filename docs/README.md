# TriageInsight Documentation Index

This directory contains all project documentation for TriageInsight. The table below describes each document and its purpose.

---

## Getting Started

| Document | Description |
| :--- | :--- |
| [Local Development Guide](./LOCAL_DEVELOPMENT_GUIDE.md) | **Start here.** Step-by-step guide for running the Web, API, and Worker services on your local machine. Covers prerequisites, Docker setup, environment variables, database migrations, and troubleshooting. |
| [Manual Stage 1 Testing](./MANUAL_STAGE1_TESTING.md) | Manual testing runbook for the Stage-1 Semantic Intelligence pipeline (feedback ingestion, AI analysis, theme clustering). |
| [E2E Testing Runbook](./E2E_TESTING_RUNBOOK.md) | Guide for running the automated end-to-end test suites for the API and web application. |

---

## Architecture & Design

| Document | Description |
| :--- | :--- |
| [Design Document](./design-document.md) | The primary product and system design document. Covers the overall architecture, data models, and feature specifications. |
| [Prisma Schema Reference](./prisma-schema.md) | A human-readable reference for the Prisma database schema, documenting all models and their relationships. |
| [Enterprise Deployment Architecture](./ENTERPRISE_DEPLOYMENT_ARCHITECTURE.md) | Architecture guide for deploying TriageInsight in a production enterprise environment. |
| [Purge Architecture](./PURGE_ARCHITECTURE.md) | Technical design document for the workspace data purge system. |

---

## Product & Engineering

| Document | Description |
| :--- | :--- |
| [Requirements](./requirement.md) | The original product requirements document. |
| [Engineering Requirement Validation](./eng_requirement_validation.md) | Validation of engineering requirements against the implemented codebase. |
| [Stage 1 Feature Inventory](./stage1_feature_inventory.md) | A detailed inventory of all features implemented in the Stage-1 release. |
| [Page Documentation](./PAGE_DOCUMENTATION.md) | Documentation for each page and route in the web application. |
| [Integration Framework Summary](./integration_framework_summary.md) | Summary of the third-party integration framework (Slack, etc.). |
| [Reporting Foundation Summary](./reporting_foundation_summary.md) | Summary of the analytics and reporting foundation. |

---

## Operations & Business

| Document | Description |
| :--- | :--- |
| [Production Readiness](./PRODUCTION_READINESS.md) | Checklist and guide for preparing the application for a production deployment. |
| [Enterprise Readiness Plan](./ENTERPRISE_READINESS_PLAN.md) | Plan for achieving enterprise-readiness, covering security, compliance, and scalability. |
| [Enterprise Pricing Strategy](./ENTERPRISE_PRICING_STRATEGY.md) | The pricing strategy and tier definitions for enterprise customers. |
| [Enterprise Sales Readiness Pack](./ENTERPRISE_SALES_READINESS_PACK.md) | Materials and talking points for the enterprise sales team. |

---

## Reports & Audits

| Document | Description |
| :--- | :--- |
| [Validation Report](./validation_report.md) | End-to-end validation report for the Feedback Intelligence and Decision Layer pipeline. Documents all findings, critical fixes (including the CIQ weight normalization bug), and remaining minor gaps. |
| [Diagnosis Report](./diagnosis_report.md) | An earlier diagnostic report on the codebase. |
| [Purge Audit Report](./PURGE_AUDIT_REPORT.md) | Audit report for the workspace data purge system. |
| [Demo Report](./demo-report.md) | Report from the autonomous demo generation task. |
