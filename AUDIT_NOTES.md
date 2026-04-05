# CIQ Clustering Audit — Root Cause Analysis

## Root Cause 1: problemClause is used as the SOLE clustering representation

**Where:** `analysis.processor.ts` line 190, `theme-clustering.service.ts` line 201

The embedding stored in `Feedback.embedding` (used for pgvector similarity search) is:
```
`Title: ${title}\nProblem: ${problemClause}`
```

`problemClause` is a narrow verbatim extraction of the complaint phrase (e.g. "payment failed",
"card declined"). Two feedback items about the same broad problem but phrased differently
(e.g. "payment keeps failing" vs "transaction declined at checkout") produce embeddings that
are semantically far apart because the extracted clauses are too compressed.

**Effect:** Over-fragmentation. Each slightly-different complaint phrase seeds its own theme.

## Root Cause 2: Thresholds are calibrated for problemClause embeddings, not broader text

The previous fix raised thresholds to compensate for the collapse caused by full-text embeddings:
- `NOVELTY_THRESHOLD_BASE = 0.72` (was 0.55) — too high for compressed clause embeddings
- `BOOTSTRAP_MERGE_THRESHOLD = 0.88` (was 0.72) — only merges near-identical phrases
- `BATCH_MERGE_THRESHOLD = 0.90` (was 0.78) — essentially never fires
- `AUTO_MERGE_THRESHOLD = 0.92` (was 0.85) — only merges exact duplicates

With the new dual-representation approach (broader actionable text for clustering), these
thresholds need to be recalibrated downward.

## Root Cause 3: problem_type bucketing prevents cross-bucket merges

The `ProblemTypeClassifierService` assigns a `problem_type` (e.g. `payment_failure`,
`authentication_error`) to each feedback item. The clustering code then ONLY allows
assignment to themes with the same `problem_type`.

For a 25-item dataset about payment + vulnerability issues, the classifier may assign
different types to items that should be in the same theme, causing them to fragment.

**Effect:** Hard walls between clusters that should merge.

## Root Cause 4: Theme centroid embedding = first feedback's problemClause embedding

When a new PROVISIONAL theme is created, its embedding is set to the first feedback's
`problemClause` embedding. All subsequent pgvector similarity searches compare against
this narrow clause embedding. Broader feedback items about the same problem score low
similarity against this narrow centroid.

**Effect:** Themes that should absorb related feedback instead create new PROVISIONAL themes.

## Root Cause 5: Archive behavior broken

Archive only happens in `ClusterRefinementService` after `MAX_PROVISIONAL_AGE_DAYS = 30`.
For a fresh dataset, no theme is old enough to archive. The weak-cluster suppression
in `_runWeakClusterSuppression` uses `WEAK_CLUSTER_MERGE_THRESHOLD = 0.75` which is
too high for problemClause embeddings — so weak clusters are neither merged nor archived.

## Fix Plan

1. **Dual representation**: Generate a `clusteringText` that is broader than `problemClause`
   but narrower than full text. Use: `${title} — ${problemClause}` (title provides domain
   context, problemClause provides specificity). This is still grounded in the feedback text.

2. **Recalibrate thresholds** for the new representation:
   - `NOVELTY_THRESHOLD_BASE`: 0.72 → 0.62 (allow more assignments to existing themes)
   - `NOVELTY_THRESHOLD_MIN`: 0.58 → 0.48
   - `BOOTSTRAP_MERGE_THRESHOLD`: 0.88 → 0.72
   - `BATCH_MERGE_THRESHOLD`: 0.90 → 0.76
   - `AUTO_MERGE_THRESHOLD`: 0.92 → 0.82
   - `WEAK_CLUSTER_MERGE_THRESHOLD`: 0.75 → 0.60

3. **Relax problem_type bucketing**: problem_type should guide but not hard-block clustering.
   Allow cross-bucket assignment when embedding similarity is very high (>= 0.80).

4. **Multi-signal merge**: Add keyphrase overlap and minimum evidence count checks to merge
   decision (already partially implemented — just need threshold recalibration).

5. **Theme naming**: Use `${title} — ${problemClause}` as the initial theme title seed,
   then let `ThemeLabelService` refine it using actual feedback samples.
