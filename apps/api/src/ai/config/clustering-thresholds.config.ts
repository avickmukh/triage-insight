/**
 * clustering-thresholds.config.ts
 *
 * Single source of truth for all embedding-model and clustering threshold
 * constants used across the AI pipeline.
 *
 * WHY A SEPARATE FILE?
 * --------------------
 * Previously these values were scattered as private class fields in
 * ThemeClusteringService and AutoMergeService, making it impossible to:
 *   - Tune thresholds without touching service logic
 *   - Share constants between services (e.g. auto-merge uses the same
 *     VECTOR_CANDIDATES as clustering)
 *   - Write unit tests that assert threshold values
 *   - Document the rationale for each value in one place
 *
 * TUNING GUIDE — DUAL-REPRESENTATION EMBEDDINGS
 * -----------------------------------------------
 * The thresholds below are calibrated for text-embedding-3-small (1536-dim)
 * with DUAL-REPRESENTATION embeddings: "${title} — ${problemClause}"
 *
 * This representation is broader than problemClause-only but narrower than
 * full text. It groups semantically related problems under one actionable
 * theme without collapsing unrelated ones.
 *
 * Empirical similarity ranges for this representation:
 *
 *   Input type                       | Same-problem sim | Cross-problem sim
 *   ─────────────────────────────────┼──────────────────┼──────────────────
 *   Full text (old, collapsed)       | 0.88–0.95        | 0.82–0.90  ← collapse
 *   Problem clause only (over-split) | 0.82–0.92        | 0.60–0.72  ← fragmentation
 *   Title + clause (dual, new)       | 0.78–0.90        | 0.55–0.70  ← balanced ✓
 *
 * Key insight: with dual representation, same-problem items score ~0.78–0.90
 * and different-problem items score ~0.55–0.70. This gives a clear separation
 * gap at ~0.72–0.75, which is where we set the novelty and merge thresholds.
 *
 * THRESHOLD RATIONALE
 * -------------------
 * NOVELTY_THRESHOLD_BASE = 0.62
 *   - Below this: create a new PROVISIONAL theme
 *   - Above this: assign to existing theme
 *   - Set at 0.62 (was 0.72 for clause-only) because dual-rep embeddings are
 *     more semantically spread; related items now score ~0.65–0.78 instead of
 *     ~0.82–0.92. We want to assign related items to existing themes, not create
 *     new ones for each slightly-different phrasing.
 *
 * BOOTSTRAP_MERGE_THRESHOLD = 0.72
 *   - In bootstrap mode (< 10 themes), merge themes above this similarity
 *   - Was 0.88 (clause-only) — too strict, nothing merged
 *   - 0.72 is the natural gap between same-problem and cross-problem items
 *     in dual-rep space. Items above 0.72 are almost certainly the same problem.
 *
 * BATCH_MERGE_THRESHOLD = 0.76
 *   - Used during runClustering finalization
 *   - Was 0.90 — essentially never fired
 *   - 0.76 catches near-duplicate themes that slipped through incremental merge
 *
 * AUTO_MERGE_THRESHOLD = 0.82
 *   - Normal (non-bootstrap) auto-merge threshold
 *   - Was 0.92 — only merged exact duplicates
 *   - 0.82 merges themes that describe the same problem with different phrasing
 *
 * WEAK_CLUSTER_MERGE_THRESHOLD = 0.60
 *   - Weak clusters (size=1) are merged into nearest neighbour if sim >= this
 *   - Was 0.75 — too strict, weak clusters were neither merged nor archived
 *   - 0.60 allows weak clusters to merge into semantically related themes
 *   - If no neighbour exceeds 0.60, the cluster is archived (true isolation)
 */

// ─── Embedding model ──────────────────────────────────────────────────────────

/**
 * OpenAI embedding model used for all vector operations.
 * Change this constant (and re-run calibration) when switching models.
 */
export const EMBEDDING_MODEL = 'text-embedding-3-small' as const;

/** Dimensionality of the embedding model output. */
export const EMBEDDING_DIMENSIONS = 1536;

// ─── Assignment score weights (must sum to 1.0) ───────────────────────────────

/** Semantic cosine similarity weight in the hybrid assignment score. */
export const W_SEMANTIC = 0.7;
/** Keyword overlap weight in the hybrid assignment score. */
export const W_KEYWORD = 0.05;
/** Cluster size bias weight in the hybrid assignment score. */
export const W_SIZE_BIAS = 0.1;
/** CIQ priority bias weight in the hybrid assignment score. */
export const W_CIQ_BIAS = 0.15;

// ─── Vector search ────────────────────────────────────────────────────────────

/**
 * Number of nearest-neighbour candidates fetched from pgvector per query.
 * Higher values improve recall at the cost of re-ranking latency.
 */
export const VECTOR_CANDIDATES = 15;

/**
 * Number of nearest-neighbour candidates for the auto-merge scan.
 * Increased from 5 → 8 to improve merge recall for small workspaces.
 */
export const MERGE_VECTOR_CANDIDATES = 8;

// ─── Novelty threshold (new theme creation) ───────────────────────────────────

/**
 * Base novelty threshold: if the best candidate score is below this, a new
 * PROVISIONAL theme is created instead of assigning to an existing theme.
 *
 * RECALIBRATED from 0.72 → 0.62 for dual-representation embeddings.
 *
 * With dual-rep embeddings (title + problemClause):
 *   - Same problem, different phrasing: cosine ~0.65–0.78 → assigned ✓
 *   - Different problems: cosine ~0.55–0.68 → new theme ✓
 *
 * The dynamic formula still applies:
 *   noveltyThreshold = max(NOVELTY_THRESHOLD_MIN, NOVELTY_THRESHOLD_BASE - 0.005 × N)
 */
export const NOVELTY_THRESHOLD_BASE = 0.62;

/**
 * Floor for the dynamic novelty threshold (never go below this).
 * Recalibrated from 0.58 → 0.48 to match the new base threshold.
 * Ensures large workspaces (N=28) still have a meaningful floor.
 */
export const NOVELTY_THRESHOLD_MIN = 0.48;

/**
 * When workspace has many themes (> THEME_CAP_GUARDRAIL), accept a match at
 * noveltyThreshold × SOFT_MATCH_MULTIPLIER to prevent theme explosion.
 */
export const SOFT_MATCH_MULTIPLIER = 0.92;

/** Activate soft-match when active theme count exceeds this. */
export const THEME_CAP_GUARDRAIL = 20;

// ─── Merge thresholds ─────────────────────────────────────────────────────────

/**
 * Auto-merge threshold (normal mode): themes with cosine similarity above
 * this are considered duplicates and merged.
 *
 * RECALIBRATED from 0.92 → 0.82 for dual-representation embeddings.
 *
 * With dual-rep embeddings, 0.82+ means the two themes describe the same
 * specific problem with different phrasing. This is the right merge point
 * for business-meaningful consolidation.
 */
export const AUTO_MERGE_THRESHOLD = 0.82;

/**
 * Auto-merge threshold in bootstrap mode (workspace has < BOOTSTRAP_THEME_COUNT
 * themes).
 *
 * RECALIBRATED from 0.88 → 0.72 for dual-representation embeddings.
 *
 * In bootstrap mode (fresh workspace, < 10 themes), we want to aggressively
 * merge similar themes to avoid theme explosion. 0.72 is the natural gap
 * between same-problem and cross-problem items in dual-rep space.
 */
export const BOOTSTRAP_MERGE_THRESHOLD = 0.72;

/**
 * Batch merge threshold used during runClustering finalization.
 *
 * RECALIBRATED from 0.90 → 0.76 for dual-representation embeddings.
 *
 * This is the main consolidation pass. 0.76 catches near-duplicate themes
 * that slipped through the incremental merge pass, without collapsing
 * genuinely different problem themes.
 */
export const BATCH_MERGE_THRESHOLD = 0.76;

/**
 * Cosine similarity threshold for merging a weak cluster into its nearest
 * neighbour during weak-cluster suppression.
 * If no neighbour exceeds this, the cluster is archived.
 *
 * RECALIBRATED from 0.75 → 0.60 for dual-representation embeddings.
 *
 * With dual-rep embeddings, a weak cluster (size=1) that scores >= 0.60
 * against its nearest neighbour is almost certainly a variant of the same
 * problem. Below 0.60, it is a genuinely isolated issue and should be archived.
 */
export const WEAK_CLUSTER_MERGE_THRESHOLD = 0.60;

/** Workspace theme count below which bootstrap merge mode is active. */
export const BOOTSTRAP_THEME_COUNT = 10;

/**
 * In bootstrap mode, merge a size-1 cluster into a size-N cluster only if
 * the size-1 cluster's signal count is < BOOTSTRAP_SIZE1_RATIO × size-N count.
 */
export const BOOTSTRAP_SIZE1_RATIO = 0.6;

// ─── Cluster quality ──────────────────────────────────────────────────────────

/**
 * Hybrid scores below this are flagged as potential outliers in the
 * clusterConfidence computation.
 */
export const OUTLIER_THRESHOLD = 0.50;

/**
 * Confidence score below which a ThemeFeedback link is considered borderline
 * and eligible for reassignment during batch finalization.
 */
export const BORDERLINE_SCORE_THRESHOLD = 0.60;

/**
 * Minimum feedback count a PROVISIONAL theme must reach after batch
 * finalization to survive. Themes below this are merged or archived.
 * A single-item cluster is treated as noise.
 */
export const BATCH_MIN_CLUSTER_SIZE = 2;

// ─── CIQ bias ─────────────────────────────────────────────────────────────────

/** Max CIQ score stored in DB (0–100 scale). */
export const CIQ_MAX = 100;

/**
 * Boost applied to centroid update when feedback CIQ is above this percentile.
 * High-CIQ feedback gets weight 2× in the centroid average.
 */
export const CIQ_HIGH_THRESHOLD = 60;

// ─── Auto-merge hybrid score weights ─────────────────────────────────────────

/**
 * Embedding similarity weight in the auto-merge hybrid score.
 * Increased from 0.7 → 0.75 to rely more on semantic similarity for merge
 * decisions (keyword overlap is less reliable for short problem clauses).
 */
export const MERGE_EMBEDDING_WEIGHT = 0.75;

/**
 * Keyword overlap weight in the auto-merge hybrid score.
 * Reduced from 0.3 → 0.25 to balance with the increased embedding weight.
 */
export const MERGE_KEYWORD_WEIGHT = 0.25;

// ─── Actionability scoring ────────────────────────────────────────────────────

/**
 * Weight of the actionability compatibility score in the hybrid assignment score.
 * When this is non-zero, W_SEMANTIC must be reduced by the same amount to keep
 * the weights summing to 1.0.
 *
 * Actionability score = IssueDimensionService.computeCompatibility(feedback, theme)
 * Range: 0 (incompatible) → 1 (identical issue_type + failure_mode + affected_object)
 */
export const W_ACTIONABILITY = 0.10;

/**
 * Adjusted semantic weight when actionability scoring is active.
 * W_SEMANTIC_ADJ + W_KEYWORD + W_SIZE_BIAS + W_CIQ_BIAS + W_ACTIONABILITY must = 1.0
 * 0.60 + 0.05 + 0.10 + 0.15 + 0.10 = 1.00
 */
export const W_SEMANTIC_WITH_ACTIONABILITY = 0.60;

/**
 * Minimum actionability compatibility score required for the auto-merge guard.
 * Merges where both themes have extracted dimensions AND compatibility < this
 * threshold are blocked, even if embedding similarity is above the merge threshold.
 *
 * RELAXED from 0.5 → 0.3 to allow more merges when actionability data is sparse.
 * With a 25-item dataset, many themes won't have rich dimension data yet.
 */
export const MERGE_MIN_ACTIONABILITY = 0.3;

/**
 * Cluster purity threshold: clusters with purity below this are candidates for
 * splitting by the ClusterPurityService.
 */
export const PURITY_SPLIT_THRESHOLD = 0.60;

/**
 * Minimum cluster size to attempt a split.
 * Clusters smaller than this are kept as-is to avoid micro-fragmentation.
 */
export const PURITY_MIN_SPLIT_SIZE = 4;
