# CIQ Scoring Audit Report

> Generated from deep code audit of `apps/api` and `apps/web`.
> This document is required reading before any implementation begins.

---

## 1. Exact Formula Map Per Page

| Page | Route | Service / Method | Formula (weights) |
|---|---|---|---|
| **Inbox** | `/app/inbox` | `FeedbackService.findMany` — DB read | Shows `theme.ciqScore` (persisted) from the linked theme row. No formula — raw DB value. |
| **CIQ Hub — Themes tab** | `/app/ciq` | `CiqEngineService.getThemeRanking` | **Live 7-factor**: Freq×0.20 + Customers×0.15 + ARR×0.25 + Deal×0.20 + Voice×0.10 + Survey×0.05 + Support×0.05 |
| **CIQ Hub — Features tab** | `/app/ciq` | `CiqEngineService.getFeatureRanking` | **Live 7-factor**: ARR×0.30 + AccountPriority×0.20 + SentimentUrgency×0.15 + Votes×0.15 + DuplicateCluster×0.10 + ThemeSignal×0.05 + Recency×0.05 |
| **Feature CIQ Ranking** | `/app/intelligence/features` | `CiqEngineService.getFeatureRanking` | Same as CIQ Hub Features tab (same hook `useCiqFeatureRanking`) |
| **Theme Ranking** | `/app/intelligence/themes` | `CiqEngineService.getThemeRanking` + `ThemeRankingEngine.rankThemes` | Shows `ciqScore` (live 7-factor above) **and** `drs`: CIQ×0.30 + Velocity×0.20 + Recency×0.18 + Resurface×0.15 + Diversity×0.10 + Confidence×0.07 |
| **Feature Priority Ranking** | `/app/prioritization/features` | `AggregationService.getFeaturePriorityRanking` | **Live 4-factor**: DemandStrength×0.30 + RevenueImpact×0.35 + StrategicImportance×0.20 + UrgencySignal×0.15 |
| **Theme Detail — Priority panel** | `/app/themes/[id]` | `CiqService.scoreTheme` (live, called on demand) | **Live 5-factor**: Volume×0.30 + Severity×0.25 + Frequency×0.20 + Friction×0.15 + Recency×0.10, then × CRM multiplier + spike bonus + resurface bonus |
| **Theme Detail — Aggregated Priority bar** | `/app/themes/[id]` | DB read: `theme.aggregatedPriorityScore` | Persisted — written by legacy `ScoringService` (no longer called). **Always null/stale.** |

---

## 2. Entity Map Per Page

| Page | Label shown to PM | Actual DB entity ranked | Entity correct? |
|---|---|---|---|
| **Inbox** | Feedback items | `Feedback` | ✅ |
| **CIQ Hub — Themes tab** | Themes | `Theme` | ✅ |
| **CIQ Hub — Features tab** | "Feature Requests" | `Feedback` (where `status != MERGED`) | ⚠️ Labelled "Feature Requests" but entity is `Feedback` |
| **Feature CIQ Ranking** | "Feature CIQ Ranking" | `Feedback` (via `getFeatureRanking`) | ❌ Title says "Feature" — entity is `Feedback` |
| **Theme Ranking** | Themes | `Theme` | ✅ |
| **Feature Priority Ranking** | "Feature Priority Ranking" | `Feedback` (via `feedbackId` in `getFeaturePriorityRanking`) | ❌ Title says "Feature" — entity is `Feedback` |
| **Theme Detail** | Single theme | `Theme` | ✅ |

---

## 3. Where Each Score Is Sourced From

| Score | Source type | Written by | Read by |
|---|---|---|---|
| `Theme.ciqScore` (DB) | Persisted | `CiqEngineService.persistThemeCiqScore` writes `score.priorityScore` (5-factor) into the `ciqScore` column | Inbox (theme pill badge), ThemeRankingEngine (as CIQ input to DRS) |
| `Theme.priorityScore` (DB) | Persisted | `CiqService.persistThemeScore` writes 5-factor `priorityScore` | Theme Ranking page (persisted column), DRS input |
| `Theme.aggregatedPriorityScore` (DB) | Persisted | **Never written** by current pipeline — legacy `ScoringService` was removed | Theme Detail "Aggregated Priority" bar — **always null** |
| `ciqScore` on CIQ Hub Themes tab | Live-computed | `CiqEngineService.getThemeRanking` — 7-factor formula | CIQ Hub, Feature CIQ Ranking |
| `drs` on Theme Ranking | Live-computed | `ThemeRankingEngine.rankThemes` — 6-factor, uses persisted `ciqScore` as input | Theme Ranking page |
| `ciqScore` on Feature CIQ Ranking | Live-computed | `CiqEngineService.getFeatureRanking` — 7-factor feedback formula | Feature CIQ Ranking, CIQ Hub Features tab |
| `priorityScore` on Feature Priority Ranking | Live-computed | `AggregationService.getFeaturePriorityRanking` — 4-factor business formula | Feature Priority Ranking page |
| `CiqScoreOutput.priorityScore` on Theme Detail | Live-computed (on demand) | `CiqService.scoreTheme` — 5-factor formula | Theme Detail priority panel |

---

## 4. Where Each Score Is Recomputed

| Score | Recompute trigger | Recompute path |
|---|---|---|
| `Theme.ciqScore` + `Theme.priorityScore` | Batch finalization, merge, manual button | `CiqScoringProcessor` (BullMQ) → `CiqService.scoreTheme` → `persistThemeScore` + `CiqEngineService.persistThemeCiqScore` |
| `Theme.aggregatedPriorityScore` | **Never** — no current code path writes this field | N/A — field is dead |
| Live `ciqScore` (CIQ Hub / Theme Ranking) | Every page load | `CiqEngineService.getThemeRanking` |
| Live `drs` (Theme Ranking) | Every page load | `ThemeRankingEngine.rankThemes` |
| Live `ciqScore` (Feature CIQ Ranking) | Every page load | `CiqEngineService.getFeatureRanking` |
| Live `priorityScore` (Feature Priority Ranking) | Every page load (5 min cache) | `AggregationService.getFeaturePriorityRanking` |
| Live `priorityScore` (Theme Detail) | Every theme detail page load | `CiqService.scoreTheme` |

---

## 5. Mismatch Table with Proposed Fix

| # | Mismatch | Severity | Proposed Fix |
|---|---|---|---|
| **M1** | `Theme.ciqScore` is persisted as `score.priorityScore` (5-factor `CiqService` formula). But the CIQ Hub and Theme Ranking pages compute `ciqScore` live using a **different 7-factor formula** (`CiqEngineService`). Same theme shows score 62 on Theme Ranking and score 48 on Theme Detail. | **Critical** | Unify to one formula. Adopt the 7-factor `CiqEngineService` formula as canonical. Update `CiqScoringProcessor` to call a new `CiqEngineService.scoreThemeForPersistence(themeId)` method (same 7-factor formula, no DB join overhead) and persist the result into both `ciqScore` and `priorityScore`. Deprecate `CiqService.scoreTheme` for themes. |
| **M2** | `Theme.aggregatedPriorityScore` is shown on the Theme Detail page as the "Aggregated Priority" bar but is **never written** by any current code path. It is always null. | **Critical** | Remove the `aggregatedPriorityScore` bar from the Theme Detail page. Replace with the live `CiqScoreOutput.priorityScore` from the unified scorer (fix M1 first). |
| **M3** | `Feature CIQ Ranking` page title says "Feature" but ranks `Feedback` rows. There is no `Feature` model in the system. | **High** | Rename page to **"Feedback CIQ Ranking"** and update breadcrumb, page title, and description. The ranked entity and formula are correct — only the label is wrong. |
| **M4** | `Feature Priority Ranking` page title says "Feature" but also ranks `Feedback` rows. | **High** | Rename page to **"Feedback Priority Ranking"** and update breadcrumb, page title, and description. |
| **M5** | Theme Detail calls `CiqService.scoreTheme` (5-factor, live) but CIQ Hub and Theme Ranking call `CiqEngineService.getThemeRanking` (7-factor, live). A PM sees contradictory scores for the same theme on different pages. | **Critical** | Fix Theme Detail to call the unified scorer (from M1). Theme Detail priority panel must show the same score as the Theme Ranking page. |
| **M6** | Inbox shows `theme.ciqScore` (persisted, potentially stale) as the priority badge. After a cluster merge, the badge may show an old score for hours. | **Medium** | Keep persisted value (N+1 live call per row is not acceptable). Add a `lastScoredAt` staleness indicator: if `theme.lastScoredAt` is > 24h ago, show the badge in grey with a "Score may be outdated" tooltip. |
| **M7** | `DRS` column on Theme Ranking is unexplained. PMs don't understand its relationship to CIQ Score. DRS is a function of CIQ (30% weight) — they are not independent signals. | **Medium** | Rename DRS column to **"Action Score"** with an inline tooltip explaining the formula. Keep both columns but make the relationship explicit. |
| **M8** | `CiqScoringProcessor` makes two separate DB writes for the same value: `CiqService.persistThemeScore` (writes `priorityScore`) and `CiqEngineService.persistThemeCiqScore` (writes `ciqScore` = same value). Two services, two writes, no atomicity. | **Medium** | Merge into one atomic write: a single `persistCanonicalThemeScore(themeId, score)` method that writes `ciqScore`, `priorityScore`, `lastScoredAt`, `revenueInfluence`, `signalBreakdown`, and all count fields in one `prisma.theme.update` call. |
