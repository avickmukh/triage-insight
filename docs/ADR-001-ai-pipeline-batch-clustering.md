# Architecture Decision Record: TriageInsight Unified AI Pipeline

**Status:** Accepted
**Date:** April 2026
**Context:** The AI clustering pipeline previously suffered from "theme explosion" during bulk uploads (e.g., 100 CSV rows) because themes were created and scored per-item before the full dataset was processed. This led to duplicate themes, noisy CIQ scores, and premature visibility of draft clusters on the executive dashboard.

This ADR documents the redesigned **Batch-First Clustering Lifecycle** and **Incremental Flow**, which guarantees high-quality, deduplicated themes and stable CIQ scores regardless of whether data arrives in a 100-item batch or as a single incremental event.

---

## 1. The Core Problem: Theme Explosion

In the previous architecture, the `assignFeedbackToTheme` function ran in isolation for every incoming feedback item. If a user uploaded a CSV with 100 rows:
1. Row 1 creates a new `PROVISIONAL` theme and enqueues a CIQ scoring job.
2. Row 2 (semantically identical to Row 1) arrives 50ms later. Because Row 1's centroid is based on only a single item, the cosine similarity might fall just below the threshold, causing Row 2 to create a *second* `PROVISIONAL` theme.
3. Both themes appear immediately on the "Top Priority" dashboard because they have high initial CIQ scores.

This eroded user trust, as the system appeared to generate duplicate, noisy clusters rather than cohesive themes.

---

## 2. The Solution: Batch-First Lifecycle

To solve this, we introduced a strict state machine and a batch-finalization gate. All four ingestion channels (Feedback CSV, Support Sync, Voice Upload, Survey Response) now wrap their payloads in an `ImportBatch`.

### 2.1 The 100-Item Bulk Upload Flow

When a user uploads 100 feedback items via CSV:

1. **Batch Creation:** The ingestion service creates an `ImportBatch` record and links all 100 `Feedback` rows to it via `importBatchId`.
2. **Incremental Assignment (Draft Phase):** The `AiAnalysisProcessor` processes the 100 items concurrently. Each item is assigned to an existing theme or creates a new `PROVISIONAL` theme.
   - *Crucial change:* `PROVISIONAL` themes are now **hidden** from the Executive Dashboard, Prioritization Board, and default Theme List. They are treated as internal draft clusters.
   - *Crucial change:* CIQ scoring is **suppressed** during this phase.
3. **Batch Finalization Gate:** The processor tracks completion. When the 100th item finishes, it triggers `ThemeClusteringService.runBatchFinalization()`.
4. **The 7-Step Quality Pass:** The finalization pass runs synchronously over the entire workspace:
   - **Borderline Reassignment:** Items with low confidence (<0.60) are re-evaluated against the now-populated cluster centroids and moved if a better fit exists.
   - **Batch Merge Pass:** A relaxed threshold (0.78) collapses near-duplicate `PROVISIONAL` clusters that formed during the concurrent ingestion phase.
   - **Weak Cluster Suppression:** Any `PROVISIONAL` theme that failed to attract at least 2 items is merged into its nearest neighbour or archived as noise.
   - **Centroid Refresh:** CIQ-weighted centroids are recomputed for all surviving themes.
   - **Promotion:** `PROVISIONAL` themes that reached the dynamic minimum support threshold (`max(2, floor(log₂(N+2)))`) are promoted to `STABLE`.
   - **Confidence Refresh:** Cluster cohesion scores are updated.
   - **CIQ Enqueue:** CIQ scoring jobs are finally enqueued for the surviving, deduplicated themes.
5. **Visibility:** Once CIQ scoring completes, the `STABLE` themes become visible on the dashboard with accurate, multi-item scores and AI narration.

### 2.2 The Single-Item Incremental Flow

When a single feedback item arrives (e.g., a webhook from Zendesk or a single survey submission):

1. The ingestion service still creates an `ImportBatch` (with `totalRows: 1`).
2. The item is processed and assigned. If it matches an existing `STABLE` theme, it joins it. If it is entirely novel, it creates a new `PROVISIONAL` theme.
3. The batch finalization gate triggers immediately (since 1/1 items are complete).
4. The 7-step quality pass runs. Because the new `PROVISIONAL` theme only has 1 item, the **Weak Cluster Suppression** step will archive it (or merge it if a neighbour is close enough).
   - *Result:* A single novel item cannot create a visible theme. It remains archived until future items arrive that match its embedding, at which point the background `ClusterRefinementService` will resurrect it.

---

## 3. Trust Model and Configurable Thresholds

To ensure the system behaves predictably and builds user trust, the clustering engine relies on dynamic, configurable thresholds rather than hardcoded magic numbers.

### 3.1 Dynamic Minimum Support

A theme is only promoted to `STABLE` (and thus visible) if it has enough supporting evidence. In a workspace with 10 total feedback items, a cluster of 2 is significant. In a workspace with 10,000 items, a cluster of 2 is noise.

The system uses a logarithmic scaling function:
`minSupport = max(2, floor(log₂(TotalWorkspaceFeedback + 2)))`

| Workspace Size | Required Items for STABLE |
|---|---|
| 10 | 2 |
| 100 | 6 |
| 1,000 | 9 |
| 10,000 | 13 |

### 3.2 Adaptive Auto-Merge (Bootstrap Mode)

When a workspace is new (≤ 10 themes) or highly fragmented (≥ 60% of themes are size-1), the `AutoMergeService` enters **Bootstrap Mode**.
- Standard merge threshold: `0.85` (requires very high semantic similarity to merge established themes).
- Bootstrap merge threshold: `0.72` (relaxed to aggressively collapse noisy size-1 clusters into cohesive themes).

### 3.3 CIQ Score Overwrite Protection

Previously, the CIQ processor had a guard that prevented a theme's score from decreasing. This was removed for themes (but kept for individual feedback items).
- **Why:** After a merge, a theme absorbs new feedback. This increases its volume but might decrease its source diversity or sentiment severity. The CIQ score **must** accurately reflect the current cluster state. Keeping a stale, artificially high score from before the merge destroys trust. The score is now recomputed from scratch after every merge or finalization event.

---

## 4. Consequences and Trade-offs

**Positive:**
- Zero theme explosion on bulk uploads.
- Dashboard only shows high-confidence, multi-item themes.
- CIQ scores are stable and based on complete cluster data.
- Single-item noise is automatically suppressed.

**Negative:**
- Processing a 100-item batch takes slightly longer because the finalization pass and CIQ scoring are deferred until the end.
- Users uploading a single highly-novel item will not see a new theme appear immediately (it requires a second corroborating item to pass the `minSupport=2` floor). This is an intentional trade-off favoring signal quality over immediate gratification.
