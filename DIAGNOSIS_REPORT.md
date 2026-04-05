# Pipeline Diagnosis Report

## 1. Executive Summary

The pipeline has **five compounding root causes** that interact to produce all observed symptoms (inbox CIQ = 0, active theme CIQ = 0, archived themes with 0 signals, vague theme names). No single fix resolves all symptoms; all five must be addressed together.

The primary cause is a **race condition**: `FEEDBACK_SCORED` fires at feedback creation time (before analysis runs), so `scoreFeedback` reads `sentiment=null`, `embedding=null`, and no `ThemeFeedback` row — producing `impactScore ≈ 30` (neutral fallback) or 0. The inbox CIQ badge reads `themes[0].theme.ciqScore` which is the **theme-level** canonical CIQ score — but theme CIQ is blocked by the idempotency guard from running after finalization because the incremental `THEME_SCORED` job (fired during assignment) already COMPLETED within the 10-minute TTL window.

The secondary causes are: (a) `_runBatchMergePass` and `_suppressWeakClusters` do not re-point `CustomerSignal` and `RoadmapItem` rows, so merged themes lose cross-source signal counts; (b) `_runBatchMergePass` does not update `feedbackCount` on the target theme, so `scoreThemeForPersistence` reads a stale count; (c) theme `title` is set once at creation from `normalizeThemeTitle(feedbackTitle)` — a 4-word truncation of the first feedback's title — and is never updated after the cluster grows; (d) the inbox theme badge reads `theme?.name` but the API returns `theme.title` (no `name` field), so all theme pills show "Theme".

---

## 2. Root Cause #1 — FEEDBACK_SCORED Race Condition

**What happens:** `feedback.service.ts` enqueues both `analysisQueue` (AI analysis) and `ciqQueue` (FEEDBACK_SCORED) simultaneously at feedback creation time. The CIQ queue processes faster than the analysis queue. When `scoreFeedback` runs, the Feedback row has `sentiment=null` (not yet computed), `embedding=null` (not yet computed), and `themes=[]` (not yet assigned). The formula produces:
- `severityScore` = keyword-based, may be non-zero but unreliable
- `sentimentUrgency` = 30 (neutral fallback, because `sentiment=null`)
- `crmScore` = 0 if no customer linked

Result: `feedback.ciqScore` is written with a low/unreliable value. The inbox reads `themes[0].theme.ciqScore` (theme-level), not `feedback.ciqScore`, so this does not directly cause inbox CIQ = 0. But it means feedback-level urgency is wrong.

**Why inbox CIQ = 0:** The inbox reads `themes[0]?.theme?.ciqScore`. If the feedback has no linked theme yet (assignment hasn't run), `themes = []` → `linkedThemeCiqScore = null` → badge shows "CIQ —". If the theme exists but `ciqScore = 0`, the badge shows "CIQ 0". Theme CIQ is 0 because of Root Cause #2.

---

## 3. Root Cause #2 — THEME_SCORED Idempotency Blocks Post-Finalization Re-Score

**What happens:** During incremental assignment (`assignFeedbackToTheme`), a `THEME_SCORED` job is enqueued with `jobId: ciq:${workspaceId}:${themeId}` and `delay: 5000ms`. This job runs and completes, writing `AiJobLog` with `status=COMPLETED` and `dedupeKey=CIQ_SCORING_THEME:themeId:workspaceId`.

Later, `runBatchFinalization` enqueues another `THEME_SCORED` for the same theme — but **without a `jobId`** (so Bull generates a random ID). The processor's `isDuplicate` check queries `AiJobLog` for `dedupeKey=CIQ_SCORING_THEME:themeId:workspaceId` with `status IN [RUNNING, COMPLETED]` and `createdAt >= (now - 10min)`. The earlier incremental job is still within the 10-minute TTL → **duplicate detected → job skipped**.

Result: The post-finalization CIQ re-score (which would see the correct merged membership) never runs. The theme's `ciqScore` reflects the pre-merge state (often 0 for a brand-new theme with 1 feedback).

**Fix:** Pass a `forceRescore: true` flag or use a distinct `dedupeKey` suffix for finalization jobs (e.g. `CIQ_SCORING_THEME:themeId:workspaceId:finalize`) so they bypass the TTL guard.

---

## 4. Root Cause #3 — Batch Merge / Suppress Does Not Re-Point Cross-Source Signals or Update feedbackCount

**What happens:** `_runBatchMergePass` correctly moves `ThemeFeedback` rows from source to target, then archives the source. But it does **not**:
1. Re-point `CustomerSignal` rows (`themeId` stays on the archived source)
2. Re-point `RoadmapItem` rows (`themeId` stays on the archived source)
3. Update `Theme.feedbackCount` on the target (the denormalized counter stays stale)

`_suppressWeakClusters` has the same three omissions.

Result: After batch merge, the surviving (target) theme has:
- `feedbackCount` = old value (not incremented by absorbed feedback)
- `voiceCount`, `supportCount`, `surveyCount` = 0 (CustomerSignals not re-pointed)
- `totalSignalCount` = 0

When `scoreThemeForPersistence` runs, it reads `feedbackCount` (denormalized) for the frequency factor and `customerSignals` for voice/support/survey signals. Both are stale → CIQ = 0 or near-0.

The archived source theme has `ThemeFeedback` rows deleted → `feedbacks = []` → `feedbackCount` was never decremented → it shows the old count in the UI but has 0 actual linked feedbacks. This is why archived themes show "Direct Signals = 0" in the UI (the join count is 0) but `feedbackCount` may be non-zero (stale denormalized value).

---

## 5. Additional Contributing Issues

**Issue A — Inbox theme badge reads `theme?.name` but API returns `theme.title`**
Line 436 of `inbox/page.tsx`:
```tsx
{(tf as ThemeFeedback & { theme?: { name?: string } }).theme?.name ?? 'Theme'}
```
The `Theme` model has no `name` field — only `title`. So all theme pills in the inbox show "Theme" (the fallback string). Fix: read `tf.theme?.title ?? tf.theme?.shortLabel ?? 'Theme'`.

**Issue B — Theme title is set once at creation and never updated**
`createCandidateTheme` sets `title = normalizeThemeTitle(feedbackTitle)` — a 4-word truncation of the first feedback's title. This title is never overwritten by `ThemeLabelService` (which only writes `shortLabel`, not `title`). The `title` field is what the CIQ Hub, Theme Ranking, and Theme Detail pages display. So themes always show the first feedback's truncated title, not a business-meaningful cluster name.

**Issue C — `updateThemeDominantDimensions` is fire-and-forget before CIQ enqueue**
In `runBatchFinalization`, `updateThemeDominantDimensions` is called with `.catch()` (fire-and-forget) before CIQ jobs are enqueued. If it takes longer than the CIQ job delay (3s backoff), the narration LLM won't have `dominantDimensions` available. This is a minor ordering issue but contributes to flat narration.

**Issue D — `FEEDBACK_SCORED` does not re-run after analysis completes**
The analysis processor does not re-enqueue `FEEDBACK_SCORED` after writing `sentiment` and `embedding`. So `feedback.ciqScore` is always computed on stale data.

**Issue E — `_runBatchMergePass` uses `theme.priorityScore` (not `theme.ciqScore`) for merge direction**
The merge direction query reads `t."priorityScore" AS "ciqScore"`. After our previous fix, `priorityScore` and `ciqScore` are written at the same scale, so this is now correct. But if `priorityScore` is null (never scored), merge direction defaults to size-based, which is fine.

---

## 6. Exact Affected Files/Services/Jobs

| File | Issue |
|------|-------|
| `apps/api/src/feedback/feedback.service.ts` | Enqueues `FEEDBACK_SCORED` before analysis runs (Race #1) |
| `apps/api/src/ai/processors/analysis.processor.ts` | Does not re-enqueue `FEEDBACK_SCORED` after analysis completes |
| `apps/api/src/ai/processors/ciq-scoring.processor.ts` | `FEEDBACK_SCORED` handler runs on stale data; `THEME_SCORED` finalization blocked by idempotency TTL |
| `apps/api/src/common/queue/job-idempotency.service.ts` | 10-minute TTL blocks post-finalization re-score |
| `apps/api/src/ai/services/theme-clustering.service.ts` | `_runBatchMergePass` and `_suppressWeakClusters` don't re-point CustomerSignals/RoadmapItems or update feedbackCount |
| `apps/api/src/ai/services/theme-clustering.service.ts` | `createCandidateTheme` sets title from first feedback's 4-word truncation, never updated |
| `apps/web/src/app/(workspace)/[orgSlug]/app/inbox/page.tsx` | Theme badge reads `theme?.name` (undefined) instead of `theme?.title` |

---

## 7. Pipeline Order Today

```
1. feedback.service.ts: create Feedback row
2. feedback.service.ts: enqueue analysisQueue (AI_ANALYSIS job)
3. feedback.service.ts: enqueue ciqQueue (FEEDBACK_SCORED job) ← RACE: fires before analysis
4. [parallel] FEEDBACK_SCORED runs: reads sentiment=null, no ThemeFeedback → impactScore ≈ 30
5. [parallel] AI_ANALYSIS runs:
   a. Generate clustering embedding (title + problemClause)
   b. Compute sentiment → write to Feedback
   c. Classify problem_type → write to Feedback.metadata
   d. assignFeedbackToTheme → create/update ThemeFeedback
   e. Enqueue THEME_SCORED (incremental, jobId=ciq:ws:themeId, delay=5s)
6. THEME_SCORED (incremental) runs: reads theme with 1 feedback → ciqScore ≈ 0–10
   → writes AiJobLog COMPLETED (dedupeKey=CIQ_SCORING_THEME:themeId:ws)
7. [if last item in batch] runBatchFinalization:
   a. _reassignBorderlineItems
   b. _runBatchMergePass → moves ThemeFeedback, archives source, does NOT update feedbackCount/CustomerSignals
   c. _suppressWeakClusters → same omissions
   d. _updateAllCentroids
   e. _promoteProvisionalThemes
   f. recomputeClusterConfidence (for loop)
   g. updateThemeDominantDimensions (fire-and-forget)
   h. Enqueue THEME_SCORED (finalization, no jobId, no delay)
8. THEME_SCORED (finalization) → isDuplicate check → COMPLETED within TTL → SKIPPED
   → theme.ciqScore stays at pre-merge value (≈ 0)
```

---

## 8. Correct Pipeline Order Needed

```
1. feedback.service.ts: create Feedback row
2. feedback.service.ts: enqueue analysisQueue ONLY (no FEEDBACK_SCORED yet)
3. AI_ANALYSIS runs:
   a. Generate clustering embedding
   b. Compute sentiment → write to Feedback
   c. Classify problem_type → write to Feedback.metadata
   d. assignFeedbackToTheme → create/update ThemeFeedback
   e. Enqueue FEEDBACK_SCORED (now has sentiment + ThemeFeedback) ← MOVED HERE
   f. Enqueue THEME_SCORED (incremental, with skipIdempotency=false, delay=5s)
4. FEEDBACK_SCORED runs: reads correct sentiment, ThemeFeedback → impactScore correct
5. THEME_SCORED (incremental) runs: reads theme with correct membership
6. [if last item in batch] runBatchFinalization:
   a. _reassignBorderlineItems
   b. _runBatchMergePass → moves ThemeFeedback + re-points CustomerSignals/RoadmapItems + updates feedbackCount ← FIX
   c. _suppressWeakClusters → same fix
   d. _updateAllCentroids
   e. _promoteProvisionalThemes
   f. recomputeClusterConfidence
   g. await updateThemeDominantDimensions (not fire-and-forget) ← FIX
   h. Enqueue THEME_SCORED (finalization, with bypassIdempotency=true) ← FIX
7. THEME_SCORED (finalization) runs: reads correct merged membership → ciqScore correct
```

---

## 9. Why Active Theme CIQ Is 0

Three compounding reasons:
1. The incremental `THEME_SCORED` fires when the theme has 1 feedback and no CustomerSignals → `feedbackCount=1`, `arrValue=0`, `voiceCount=0` → all 7 factors near-zero → `ciqScore ≈ 0–5`.
2. After batch merge, the target theme has stale `feedbackCount` (not incremented) and `CustomerSignals` still on the archived source → `scoreThemeForPersistence` reads wrong counts.
3. The post-finalization `THEME_SCORED` is blocked by the 10-minute idempotency TTL → the correct score never gets written.

---

## 10. Why Archived Themes Have 0 Direct Signals / 0 CIQ

After `_runBatchMergePass` or `_suppressWeakClusters`:
- `ThemeFeedback` rows are deleted from the source (archived) theme.
- The UI's "Direct Signals" count is computed from `ThemeFeedback` JOIN → 0.
- `Theme.feedbackCount` (denormalized) was never decremented → shows old value in some places.
- `CustomerSignal.themeId` still points to the archived theme → `voiceCount/supportCount/surveyCount` appear on the archived theme in raw DB queries, but the CIQ scorer reads the archived theme's `feedbacks` join (which is empty) → `ciqScore = 0`.
- The archived theme was never re-scored after its `ThemeFeedback` rows were deleted → `ciqScore` stays at whatever it was before archiving.

---

## 11. Why Inbox CIQ Is Failing

The inbox reads `themes[0]?.theme?.ciqScore`. This is null/0 because:
1. If feedback has no linked theme yet (assignment pending): `themes = []` → `null` → "CIQ —"
2. If theme exists but was just created (incremental score = 0): `ciqScore = 0` → "CIQ —" (the `getPriority` function treats `!ciqScore` as Low/no badge)
3. The post-finalization re-score that would write the correct value is blocked by idempotency TTL.

Additionally, the theme badge in the inbox shows "Theme" (not the actual theme name) because line 436 reads `theme?.name` but the API returns `theme.title`. This is a separate UI bug that makes the inbox look broken even when data is correct.

---

## 12. Why Theme Names Became Worse

Theme `title` is set once at creation by `normalizeThemeTitle(feedbackTitle)`:
- Takes the first feedback's title
- Strips stop words
- Keeps up to 4 meaningful tokens
- Example: "I can't complete my payment at checkout" → "Complete Payment Checkout" (3 words, missing context)
- Example: "The CSV export is timing out for large datasets" → "Csv Export Timing" (loses "large datasets" context)

`ThemeLabelService.generateLabel` generates a better `shortLabel` but only writes it to `Theme.shortLabel`, not `Theme.title`. The CIQ Hub and Theme Ranking pages display `theme.title`, not `theme.shortLabel`. So the LLM-generated label is invisible on the main pages.

The previous round of changes introduced `dual-representation` clustering text (`title — problemClause`) which improved clustering quality, but the `normalizeThemeTitle` function still truncates to 4 tokens from the first feedback's title. For a cluster that grows to 10 feedbacks, the title still reflects only the first one.

**Fix:** After `ThemeLabelService.generateLabel` produces a good `shortLabel`, also write it to `Theme.title` (unless the user has manually edited the title). Alternatively, have `runBatchFinalization` call `generateLabel` for all surviving themes and write the result to both `title` and `shortLabel`.

---

## 13. Which Issue Is Primary vs Secondary

| Priority | Issue | Impact |
|----------|-------|--------|
| **P0 — Primary** | THEME_SCORED idempotency blocks post-finalization re-score | Active theme CIQ = 0 |
| **P0 — Primary** | `_runBatchMergePass` / `_suppressWeakClusters` don't update feedbackCount or re-point CustomerSignals | Active theme CIQ = 0 after merge |
| **P1 — Secondary** | FEEDBACK_SCORED race (fires before analysis) | Feedback-level urgency wrong |
| **P1 — Secondary** | Analysis processor doesn't re-enqueue FEEDBACK_SCORED after completing | Feedback CIQ never corrected |
| **P1 — Secondary** | Inbox theme badge reads `theme?.name` instead of `theme?.title` | All theme pills show "Theme" |
| **P2 — Tertiary** | Theme title never updated after creation | Vague/truncated theme names |
| **P2 — Tertiary** | `updateThemeDominantDimensions` is fire-and-forget before CIQ enqueue | Narration lacks dimension context |
