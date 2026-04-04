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
 * TUNING GUIDE
 * ------------
 * The thresholds below are calibrated for text-embedding-3-small (1536-dim).
 * If you switch to a different model (e.g. text-embedding-3-large), cosine
 * similarity distributions shift and you MUST re-calibrate:
 *
 *   Model                    | Typical same-topic sim | Typical cross-topic sim
 *   ─────────────────────────┼────────────────────────┼────────────────────────
 *   text-embedding-ada-002   | 0.85–0.95              | 0.70–0.82
 *   text-embedding-3-small   | 0.82–0.93              | 0.65–0.80
 *   text-embedding-3-large   | 0.88–0.97              | 0.72–0.85
 *
 * For a new model, run `scripts/calibrate-thresholds.ts` against a labelled
 * dataset to find the optimal NOVELTY_THRESHOLD and MERGE_THRESHOLD values.
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
 * Smaller than VECTOR_CANDIDATES because merge is a workspace-wide operation.
 */
export const MERGE_VECTOR_CANDIDATES = 5;

// ─── Novelty threshold (new theme creation) ───────────────────────────────────

/**
 * Base novelty threshold: if the best candidate score is below this, a new
 * PROVISIONAL theme is created instead of assigning to an existing theme.
 *
 * This is the BASE value; the actual threshold is computed dynamically:
 *   noveltyThreshold = max(NOVELTY_THRESHOLD_MIN, NOVELTY_THRESHOLD_BASE - 0.005 × N)
 *
 * Calibrated for text-embedding-3-small.
 */
export const NOVELTY_THRESHOLD_BASE = 0.55;

/** Floor for the dynamic novelty threshold (never go below this). */
export const NOVELTY_THRESHOLD_MIN = 0.4;

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
 * Calibrated for text-embedding-3-small. Raise to 0.88 for larger models.
 */
export const AUTO_MERGE_THRESHOLD = 0.85;

/**
 * Auto-merge threshold in bootstrap mode (workspace has < BOOTSTRAP_THEME_COUNT
 * themes). Relaxed to collapse near-duplicates before the workspace grows.
 */
export const BOOTSTRAP_MERGE_THRESHOLD = 0.72;

/**
 * Batch merge threshold used during runClustering finalization.
 * More aggressive than the incremental merge threshold so draft clusters
 * collapse before becoming visible to users.
 */
export const BATCH_MERGE_THRESHOLD = 0.78;

/**
 * Cosine similarity threshold for merging a weak cluster into its nearest
 * neighbour during weak-cluster suppression.
 * If no neighbour exceeds this, the cluster is archived.
 */
export const WEAK_CLUSTER_MERGE_THRESHOLD = 0.65;

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
export const OUTLIER_THRESHOLD = 0.45;

/**
 * Confidence score below which a ThemeFeedback link is considered borderline
 * and eligible for reassignment during batch finalization.
 */
export const BORDERLINE_SCORE_THRESHOLD = 0.6;

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

/** Embedding similarity weight in the auto-merge hybrid score. */
export const MERGE_EMBEDDING_WEIGHT = 0.7;

/** Keyword overlap weight in the auto-merge hybrid score. */
export const MERGE_KEYWORD_WEIGHT = 0.3;

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
 * Set to 0 to disable the guard (pure embedding-based merge).
 */
export const MERGE_MIN_ACTIONABILITY = 0.5;

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
