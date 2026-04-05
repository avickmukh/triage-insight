# Pipeline Diagnosis Report — Split Ownership of Evidence, Counters, and Scoring

**Date:** 2026-04-05  
**Scope:** All 34 diagnostic questions (A–G) from the attached brief  
**Status:** Pre-implementation (no code changed yet)

---

## 1. Executive Summary

The system has three independent representations of "how many feedback items belong to a theme":

| Representation | Where stored | Who writes it | When written |
|---|---|---|---|
| **Live join count** | `ThemeFeedback` rows | Clustering pipeline, `_executeBatchMerge` | At assignment time and after merge |
| **Denormalized counter** | `Theme.feedbackCount`, `Theme.voiceCount`, `Theme.supportCount`, `Theme.totalSignalCount` | `persistCanonicalThemeScore` (CIQ), `_executeBatchMerge` (increment only), `UnifiedAggregationService.aggregateTheme` | After CIQ scoring, after merge (increment only), or when REST endpoint is called manually |
| **CIQ scoring inputs** | Computed live from `ThemeFeedback` (for `feedbackCount`, ARR) + stale DB fields (for `voiceCount`, `supportCount`, `totalSignalCount`) | `scoreThemeForPersistence` | At CIQ scoring time |

These three representations are **never guaranteed to agree** because:

1. `UnifiedAggregationService.aggregateTheme` (the only service that computes all four counters from live `ThemeFeedback` rows) is **never enqueued by the pipeline** — it only runs when the REST endpoint is called manually.
2. `_executeBatchMerge` only **increments** `feedbackCount` by the moved count, never recomputes it from scratch. If the target already had a stale counter, the increment is wrong.
3. `scoreThemeForPersistence` computes `feedbackCount` live from `ThemeFeedback` but reads `voiceCount`, `supportCount`, and `totalSignalCount` from the stale DB fields — so `totalSignalCount` in the CIQ output is the stale DB value (or `liveSignalCount = feedbackCount + stale.voiceCount + stale.supportCount` as fallback).
4. When `_suppressWeakClusters` archives an isolated weak cluster (no suitable merge neighbour), it archives the theme **without re-pointing its `ThemeFeedback` rows to any other theme**. Those feedback items become orphaned — they belong to an ARCHIVED theme and are invisible to all active-theme queries.

---

## 2. Primary Root Cause

**`UnifiedAggregationService.aggregateTheme` is never called by the pipeline.**

The queue `unified-aggregation` is registered in `QueueModule` and handled by `UnifiedAggregationProcessor`, but no service in the pipeline ever enqueues a job to it. The only callers are:

- `POST /workspaces/:workspaceId/themes/:id/aggregate` (manual REST trigger)
- `POST /workspaces/:workspaceId/themes/aggregate-workspace` (manual REST trigger)

This means `Theme.totalSignalCount`, `Theme.voiceCount`, `Theme.supportCount`, and `Theme.sentimentDistribution` are **always 0 (or stale)** unless a human manually calls the REST endpoint after every pipeline run.

The CIQ scorer then reads these stale `0` values and returns `totalSignalCount: 0 ?? liveSignalCount` — but `liveSignalCount = feedbackCount + 0 + 0 = feedbackCount`, so the "Signals" widget in the Priority Intelligence panel shows the same number as "Linked Feedback" (which is correct for the feedback dimension but wrong for the cross-source total).

---

## 3. Secondary Root Causes

### 3a. Orphaned feedback on isolated archive

When `_suppressWeakClusters` finds a PROVISIONAL theme with no suitable merge neighbour (nearest sim < `WEAK_CLUSTER_MERGE_THRESHOLD = 0.60`), it archives the theme **without re-pointing its `ThemeFeedback` rows**. Those feedback items remain linked to the now-ARCHIVED theme and are excluded from all active-theme queries. This is why only 10 of 25 feedback items appeared in active themes — the remaining 15 were in archived themes with no surviving link.

### 3b. Stale counter increment after merge

`_executeBatchMerge` does `feedbackCount: { increment: affectedFeedbackCount }` on the target. If the target's `feedbackCount` was already stale (e.g., 0 from initial creation, never aggregated), the result is `0 + N = N` which is correct for the moved items but misses any feedback the target already had that was never counted. The correct operation is a full recount from `ThemeFeedback`, not an increment.

### 3c. Mixed live/stale inputs in CIQ scorer

`scoreThemeForPersistence` computes `feedbackCount` and `arrValue` from live `ThemeFeedback` rows (correct), but reads `voiceCount`, `supportCount`, `surveyCount`, and `totalSignalCount` from the stale DB fields. After a merge, the stale fields are wrong until `UnifiedAggregationService.aggregateTheme` runs (which it never does automatically).

### 3d. `feedbacks` select in `scoreThemeForPersistence` missing `sourceType`

The scorer selects `customerId`, `sentiment`, `ciqScore`, `metadata`, `customer.arrValue` from linked feedback — but not `sourceType`. This means it cannot compute live `voiceCount` from `ThemeFeedback` rows and must fall back to the stale `theme.voiceCount` field.

### 3e. Post-merge CIQ enqueue in `auto-merge.executeMerge` uses a fixed `jobId`

`auto-merge.executeMerge` enqueues `THEME_SCORED` with `jobId: ciq:merge:${workspaceId}:${targetThemeId}`. If a previous CIQ job with this ID completed within the 10-minute idempotency TTL, the new job is silently dropped. The `bypassIdempotency: true` flag was added to the finalization path but **not** to the `auto-merge.executeMerge` path.

---

## 4. Exact Broken Data Flow

```
Feedback ingested
  → analysis.processor.ts: embedding, sentiment, problemClause
  → theme-clustering.service.ts: assignFeedbackToTheme
      → ThemeFeedback row created (live join is correct)
      → Theme.feedbackCount NOT updated here (only at merge/CIQ time)
  → ciq-scoring.processor.ts: FEEDBACK_SCORED
      → feedback.ciqScore written

Batch finalization (runBatchFinalization)
  → _reassignBorderlineItems: moves ThemeFeedback rows
  → _runBatchMergePass: _executeBatchMerge (moves ThemeFeedback, increments feedbackCount)
  → _suppressWeakClusters:
      if merge neighbour found: _executeBatchMerge (correct)
      if NO merge neighbour: archive theme WITHOUT re-pointing ThemeFeedback ← BUG 3a
  → _updateAllCentroids
  → _promoteProvisionalThemes
  → recomputeClusterConfidence
  → updateThemeDominantDimensions (fire-and-forget)
  → THEME_SCORED enqueued (bypassIdempotency: true) ← correct

THEME_SCORED handler
  → scoreThemeForPersistence:
      feedbackCount = live ThemeFeedback count ← correct
      voiceCount = theme.voiceCount (stale DB field) ← BUG 3c
      supportCount = theme.supportCount (stale DB field) ← BUG 3c
      totalSignalCount = theme.totalSignalCount ?? liveSignalCount ← stale or wrong
  → persistCanonicalThemeScore: writes feedbackCount, voiceCount (stale), totalSignalCount (stale)
  → generateThemeNarration

UnifiedAggregationService.aggregateTheme ← NEVER CALLED BY PIPELINE ← BUG 2 (primary)
```

---

## 5. Exact Broken Ordering

The correct order for a consistent post-finalization state is:

```
1. Merge/archive (ThemeFeedback re-pointing, including orphan rescue)
2. UnifiedAggregation (recompute all counters from live ThemeFeedback)
3. CIQ scoring (read live feedbackCount + freshly computed voiceCount/supportCount)
4. Narration (read final ciqScore + counters)
```

The current order is:

```
1. Merge/archive (ThemeFeedback re-pointing, but orphans not rescued)
2. CIQ scoring (reads stale voiceCount/supportCount, correct feedbackCount)
3. Narration
4. UnifiedAggregation ← NEVER RUNS
```

---

## 6. Exact Broken Tables / Services / Jobs / Queries

| Component | What is broken |
|---|---|
| `theme-clustering.service.ts` → `_suppressWeakClusters` | Archives isolated weak clusters without re-pointing `ThemeFeedback` rows → orphaned feedback |
| `ciq-engine.service.ts` → `scoreThemeForPersistence` | Reads stale `theme.voiceCount`, `theme.supportCount`, `theme.totalSignalCount` instead of computing live from `ThemeFeedback` |
| `ciq-engine.service.ts` → `scoreThemeForPersistence` | `feedbacks.select` does not include `sourceType` → cannot compute live `voiceCount` |
| `ai/services/auto-merge.service.ts` → `executeMerge` | Post-merge `THEME_SCORED` enqueue uses fixed `jobId` without `bypassIdempotency: true` |
| `theme-clustering.service.ts` → `_executeBatchMerge` | Uses `feedbackCount: { increment: N }` instead of recomputing from live `ThemeFeedback` |
| `unified-aggregation` queue | Never enqueued by any pipeline step — only reachable via manual REST |
| `Theme.totalSignalCount`, `Theme.voiceCount`, `Theme.supportCount` | Always stale; never recomputed after merge/finalization |

---

## 7. Why Total Signals = 0 While Linked Feedback Exists

`Theme.totalSignalCount` defaults to `0` at creation time. It is only updated by:

1. `persistCanonicalThemeScore` — which writes `totalSignalCount: score.totalSignalCount` where `score.totalSignalCount = theme.totalSignalCount ?? liveSignalCount`. Since `theme.totalSignalCount` starts at `0` (not null), the `??` fallback never fires, and `0` is written back.
2. `UnifiedAggregationService.aggregateTheme` — which correctly counts live `ThemeFeedback` rows, but is never called by the pipeline.

So the field stays `0` forever unless manually triggered. The Theme Detail page shows `theme.totalSignalCount ?? theme.feedbackCount ?? 0` — so it falls back to `feedbackCount` which is correct for the feedback dimension, but the "Total Signals" widget reads `theme.totalSignalCount` directly and shows `0`.

**The CIQ scorer's `totalSignalCount` return value** uses `theme.totalSignalCount ?? liveSignalCount`. Since `theme.totalSignalCount` is `0` (not null), the `??` never fires and `0` is returned. The Priority Intelligence "Signals" widget reads `ciqScore.signalCount` which is `0`.

---

## 8. Why Active Theme CIQ Is Inconsistent

CIQ is inconsistent because its inputs are inconsistent:

- `feedbackCount` is computed live from `ThemeFeedback` (correct, reflects post-merge state)
- `voiceCount` is read from `theme.voiceCount` (stale, never recomputed after merge)
- `supportCount` is read from `theme.supportCount` (stale, never recomputed after merge)
- `totalSignalCount` is read from `theme.totalSignalCount` (always `0`, never recomputed)
- `arrValue` is computed live from `ThemeFeedback → feedback.customer.arrValue` (correct)

So the `feedbackFrequency` and `arrRevenue` factors are correct (live), but `voiceSignal` and `supportSignal` factors are always `0` (stale). This makes CIQ systematically underestimate themes that have voice or support signals.

---

## 9. Why Only 10 of 25 Feedback Items Appeared in Active Themes

The 15 missing feedback items are in one of two states:

1. **Orphaned in ARCHIVED themes** — `_suppressWeakClusters` archived their theme without re-pointing `ThemeFeedback` rows. The feedback is still linked to the archived theme and invisible to active-theme queries.
2. **Unassigned** — feedback items that were processed before the clustering pipeline ran, or whose `problemClause` embedding had no suitable theme above the novelty threshold, and no new PROVISIONAL theme was created (e.g., because `problem_type = 'other'` was filtered out).

The primary cause is (1): isolated weak clusters are archived without rescuing their feedback.

---

## 10. Why the Previous Version Looked Better

The previous version (before the dual-representation + threshold recalibration) had:

- `WEAK_CLUSTER_MERGE_THRESHOLD = 0.75` (high) — most weak clusters found a merge neighbour and were merged rather than archived, so fewer feedback items were orphaned.
- `BATCH_MERGE_THRESHOLD = 0.90` (very high) — very few merges happened, so most themes survived as separate entities. The feedback was fragmented across many themes, but at least it was visible.
- `adaptiveMinSize` was more permissive — single-item clusters were kept alive.

After recalibration:
- `WEAK_CLUSTER_MERGE_THRESHOLD = 0.60` (lower) — more weak clusters fail to find a merge neighbour and are archived without feedback rescue.
- `BATCH_MERGE_THRESHOLD = 0.76` — more merges happen, which is correct, but the orphan problem is exposed.

The recalibration was correct in direction but the orphan rescue was not implemented alongside it.

---

## 11. Which Fixes Are Mandatory vs Optional

### Mandatory (blocking correctness)

| Fix | Why mandatory |
|---|---|
| **M1: Rescue orphaned feedback on archive** — when `_suppressWeakClusters` archives an isolated cluster, re-assign its `ThemeFeedback` rows to the nearest active theme (even below the merge threshold), or to a catch-all "Uncategorized" theme | Without this, feedback is permanently lost from all active-theme views |
| **M2: Enqueue `UnifiedAggregationService.aggregateTheme` after finalization** — add a step in `runBatchFinalization` that enqueues the `unified-aggregation` job for each surviving theme | Without this, `totalSignalCount`, `voiceCount`, `supportCount` are always stale |
| **M3: Fix `scoreThemeForPersistence` to compute voiceCount/supportCount live** — add `sourceType` and `primarySource` to the `feedbacks.select` and compute `voiceCount`/`supportCount` from live rows instead of stale DB fields | Without this, CIQ underestimates themes with voice/support signals |
| **M4: Fix `totalSignalCount` stale-zero bug** — change `theme.totalSignalCount ?? liveSignalCount` to always use `liveSignalCount` (computed from live ThemeFeedback) | Without this, `totalSignalCount` is always `0` |
| **M5: Fix `_executeBatchMerge` to recount feedbackCount from live ThemeFeedback** — replace `feedbackCount: { increment: N }` with a live recount after the transaction | Without this, incremental counter is wrong when target had stale initial value |
| **M6: Add `bypassIdempotency: true` to `auto-merge.executeMerge` CIQ enqueue** | Without this, post-merge CIQ rescoring is silently dropped within 10-min TTL |

### Optional (quality improvements)

| Fix | Why optional |
|---|---|
| **O1: Enqueue `unified-aggregation` after `auto-merge.executeMerge`** | Improves counter freshness after manual merges, but M2 covers the main pipeline path |
| **O2: Add `shortLabel` to `ThemeRepository.findMany` select** | Improves list card display but not a correctness issue |
| **O3: Log orphan count in finalization summary** | Observability improvement |
