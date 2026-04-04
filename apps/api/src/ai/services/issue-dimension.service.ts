/**
 * IssueDimensionService
 *
 * Generic structured extraction of the actionability dimensions of any feedback
 * item. This service operates at the SEMANTIC/ACTIONABILITY layer — it does not
 * know about any specific business domain (payments, auth, UI, etc.).
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Embedding-based clustering collapses semantically related but actionably
 * distinct feedback into a single broad theme because cosine similarity captures
 * topic proximity, not root-cause or fix-ownership proximity.
 *
 * Example: "transaction times out on retry" and "duplicate charge after retry"
 * are both about "payment retry" — embedding sim ~0.87 — but they require
 * completely different fixes (timeout tuning vs idempotency key enforcement).
 * Without actionability dimensions, they collapse into one theme.
 *
 * ── Output: IssueDimensions ──────────────────────────────────────────────────
 *
 *   issue_type          — the class of problem (bug, regression, missing_feature,
 *                         performance, ux_confusion, data_quality, security,
 *                         integration_failure, documentation, other)
 *
 *   failure_mode        — how the system fails (timeout, crash, wrong_output,
 *                         missing_output, permission_denied, data_loss,
 *                         ui_broken, slow_response, no_failure, other)
 *
 *   user_intent         — what the user was trying to do (generic verb phrase,
 *                         e.g. "complete payment", "export report", "invite team")
 *
 *   affected_object     — the system entity that is broken or missing
 *                         (generic noun phrase, e.g. "payment form", "export API",
 *                         "user invitation flow")
 *
 *   actionability_signature — a compact string that uniquely identifies the
 *                         actionable fix space: "{issue_type}:{failure_mode}:{affected_object}"
 *                         Used as a fast compatibility key for merge guards.
 *
 *   extraction_confidence — 0–1 confidence in the extraction quality
 *
 * ── Storage ──────────────────────────────────────────────────────────────────
 *
 * Dimensions are stored in Feedback.metadata under the key "issueDimensions".
 * This avoids any schema migration. The field is populated once per feedback
 * item during the analysis pipeline (Step 2.5, between summarization and
 * clustering). It is re-extracted only if the feedback text changes.
 *
 * ── Extraction strategy ──────────────────────────────────────────────────────
 *
 * Stage 1 — Heuristic (zero latency, synchronous):
 *   Pattern matching on title + description to infer issue_type and failure_mode.
 *   Used when confidence >= 0.75 to avoid unnecessary LLM calls.
 *
 * Stage 2 — LLM structured output (async, ~200ms):
 *   gpt-4.1-mini with JSON-mode prompt. Used when heuristic confidence < 0.75.
 *   Falls back to heuristic result on any LLM failure.
 *
 * ── Actionability compatibility score ────────────────────────────────────────
 *
 * computeCompatibility(a, b) returns a 0–1 score:
 *   - 1.0 if actionability_signatures are identical
 *   - 0.8 if issue_type AND failure_mode match
 *   - 0.5 if only issue_type matches
 *   - 0.2 if only failure_mode matches
 *   - 0.0 if neither matches (actionably incompatible)
 *
 * This score is injected into the hybrid assignment score and merge guard.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

// ─── Types ────────────────────────────────────────────────────────────────────

export type IssueType =
  | 'bug'
  | 'regression'
  | 'missing_feature'
  | 'performance'
  | 'ux_confusion'
  | 'data_quality'
  | 'security'
  | 'integration_failure'
  | 'documentation'
  | 'other';

export type FailureMode =
  | 'timeout'
  | 'crash'
  | 'wrong_output'
  | 'missing_output'
  | 'permission_denied'
  | 'data_loss'
  | 'ui_broken'
  | 'slow_response'
  | 'no_failure'
  | 'other';

export interface IssueDimensions {
  issue_type: IssueType;
  failure_mode: FailureMode;
  /** Generic verb phrase describing what the user was trying to do */
  user_intent: string;
  /** Generic noun phrase for the system entity that is broken or missing */
  affected_object: string;
  /** Compact key: "{issue_type}:{failure_mode}:{affected_object}" */
  actionability_signature: string;
  /** 0–1 confidence in the extraction */
  extraction_confidence: number;
  /** 'heuristic' | 'llm' | 'fallback' */
  extraction_method: 'heuristic' | 'llm' | 'fallback';
}

// ─── Heuristic patterns ───────────────────────────────────────────────────────

interface IssueTypePattern {
  type: IssueType;
  primary: string[];
  secondary: string[];
}

interface FailureModePattern {
  mode: FailureMode;
  primary: string[];
  secondary: string[];
}

const ISSUE_TYPE_PATTERNS: IssueTypePattern[] = [
  {
    type: 'bug',
    primary: [
      'broken', 'not working', 'bug', 'error', 'crash', 'fail', 'failed',
      'failure', 'incorrect', 'wrong', 'broken', 'glitch', 'defect',
    ],
    secondary: ['issue', 'problem', 'unexpected', 'weird', 'strange'],
  },
  {
    type: 'regression',
    primary: [
      'used to work', 'worked before', 'stopped working', 'broke after',
      'regression', 'was working', 'no longer works', 'used to be able',
    ],
    secondary: ['before update', 'after update', 'since last', 'previously'],
  },
  {
    type: 'missing_feature',
    primary: [
      'feature request', 'please add', 'would love', 'wish', 'missing',
      'need', 'want', 'should have', 'add support', 'add ability',
      'allow us', 'enable', 'provide option', 'no way to',
    ],
    secondary: ['could you', 'can you', 'it would be great', 'would be helpful'],
  },
  {
    type: 'performance',
    primary: [
      'slow', 'timeout', 'latency', 'freeze', 'hang', 'unresponsive',
      'lag', 'laggy', 'loading forever', 'takes too long', 'performance',
    ],
    secondary: ['load', 'loading', 'speed', 'delay', 'wait', 'waiting', 'spinner'],
  },
  {
    type: 'ux_confusion',
    primary: [
      'confusing', 'hard to find', 'cant find', "can't find", 'lost',
      'not intuitive', 'unclear', 'confusing ui', 'hard to use',
      'difficult to understand', 'not obvious',
    ],
    secondary: ['where is', 'how do i', 'navigation', 'menu', 'sidebar'],
  },
  {
    type: 'data_quality',
    primary: [
      'wrong data', 'incorrect data', 'data missing', 'data loss',
      'data not saved', 'data corrupted', 'stale data', 'outdated',
      'not accurate', 'inaccurate',
    ],
    secondary: ['data', 'record', 'value', 'field', 'number', 'count'],
  },
  {
    type: 'security',
    primary: [
      'security', 'vulnerability', 'unauthorized', 'breach', 'exposed',
      'sensitive data', 'pii', 'gdpr', 'privacy', 'access control',
    ],
    secondary: ['permission', 'role', 'access', 'forbidden', 'denied'],
  },
  {
    type: 'integration_failure',
    primary: [
      'integration', 'api', 'webhook', 'sync', 'connect', 'connection',
      'third party', 'third-party', 'external', 'import', 'export',
    ],
    secondary: ['failed to sync', 'not syncing', 'api error', 'webhook failed'],
  },
  {
    type: 'documentation',
    primary: [
      'documentation', 'docs', 'unclear docs', 'no documentation',
      'help article', 'tutorial', 'guide', 'instructions unclear',
    ],
    secondary: ['how to', 'example', 'explain', 'document'],
  },
];

const FAILURE_MODE_PATTERNS: FailureModePattern[] = [
  {
    mode: 'timeout',
    primary: ['timeout', 'timed out', 'times out', 'request timeout', 'connection timeout'],
    secondary: ['loading forever', 'never loads', 'stuck loading'],
  },
  {
    mode: 'crash',
    primary: ['crash', 'crashed', 'crashes', 'app crash', 'white screen', 'blank screen', 'fatal error'],
    secondary: ['freeze', 'frozen', 'hang', 'hangs', 'stopped responding'],
  },
  {
    mode: 'wrong_output',
    primary: ['wrong result', 'incorrect result', 'wrong value', 'incorrect value', 'wrong data', 'shows wrong'],
    secondary: ['unexpected', 'not what i expected', 'wrong number', 'incorrect count'],
  },
  {
    mode: 'missing_output',
    primary: ['not showing', 'not displayed', 'missing from', 'disappeared', 'not visible', 'not appearing'],
    secondary: ['blank', 'empty', 'nothing shows', 'no results', 'not there'],
  },
  {
    mode: 'permission_denied',
    primary: ['permission denied', 'access denied', 'forbidden', '403', 'unauthorized', '401', 'not authorized'],
    secondary: ['cannot access', "can't access", 'blocked', 'restricted'],
  },
  {
    mode: 'data_loss',
    primary: ['data lost', 'data missing', 'data deleted', 'lost my data', 'disappeared', 'gone', 'not saved'],
    secondary: ['deleted', 'removed', 'cleared', 'wiped'],
  },
  {
    mode: 'ui_broken',
    primary: ['button not working', 'click not working', 'ui broken', 'layout broken', 'display issue', 'rendering issue'],
    secondary: ['broken layout', 'misaligned', 'overlapping', 'cut off', 'not clickable'],
  },
  {
    mode: 'slow_response',
    primary: ['slow', 'very slow', 'extremely slow', 'takes too long', 'performance issue', 'lag', 'laggy'],
    secondary: ['loading slowly', 'slow to load', 'slow response', 'delayed'],
  },
];

// ─── LLM prompt ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a generic software issue classifier. Extract structured actionability dimensions from user feedback.

Return ONLY a JSON object with these exact fields:
{
  "issue_type": one of: bug|regression|missing_feature|performance|ux_confusion|data_quality|security|integration_failure|documentation|other,
  "failure_mode": one of: timeout|crash|wrong_output|missing_output|permission_denied|data_loss|ui_broken|slow_response|no_failure|other,
  "user_intent": "generic verb phrase of what the user was trying to do (max 6 words)",
  "affected_object": "generic noun phrase for the broken/missing system entity (max 5 words)",
  "confidence": 0.0-1.0
}

Rules:
- Be GENERIC — do not use product-specific terminology
- user_intent should be a verb phrase: "complete payment", "export data", "invite team member"
- affected_object should be a noun phrase: "payment form", "export API", "invitation email"
- If the feedback is a feature request with no failure, set failure_mode to "no_failure"
- confidence reflects how clearly the text maps to these dimensions`;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class IssueDimensionService {
  private readonly logger = new Logger(IssueDimensionService.name);
  private readonly openai: OpenAI | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Extract issue dimensions from a feedback item.
   *
   * Uses heuristic first. Falls back to LLM when heuristic confidence < 0.75.
   * Always returns a valid IssueDimensions object — never throws.
   */
  async extract(
    title: string,
    description: string,
  ): Promise<IssueDimensions> {
    const text = `${title}\n${description}`.trim();
    const heuristic = this.extractByHeuristic(text);

    if (heuristic.extraction_confidence >= 0.75) {
      return heuristic;
    }

    if (!this.openai) {
      return { ...heuristic, extraction_method: 'fallback' };
    }

    try {
      const llm = await this.extractByLlm(text);
      // Prefer LLM if it has higher confidence
      return llm.extraction_confidence >= heuristic.extraction_confidence
        ? llm
        : heuristic;
    } catch (err) {
      this.logger.warn(
        `[IssueDimension] LLM extraction failed — using heuristic: ${(err as Error).message}`,
      );
      return { ...heuristic, extraction_method: 'fallback' };
    }
  }

  /**
   * Compute actionability compatibility between two IssueDimensions objects.
   *
   * Returns 0–1:
   *   1.0 — identical actionability_signature
   *   0.8 — same issue_type AND failure_mode
   *   0.5 — same issue_type only
   *   0.2 — same failure_mode only (and not 'other')
   *   0.0 — incompatible (different issue_type AND failure_mode)
   */
  computeCompatibility(a: IssueDimensions, b: IssueDimensions): number {
    // Exact signature match
    if (a.actionability_signature === b.actionability_signature) return 1.0;

    const sameIssueType = a.issue_type === b.issue_type && a.issue_type !== 'other';
    const sameFailureMode =
      a.failure_mode === b.failure_mode &&
      a.failure_mode !== 'other' &&
      a.failure_mode !== 'no_failure';

    if (sameIssueType && sameFailureMode) return 0.8;
    if (sameIssueType) return 0.5;
    if (sameFailureMode) return 0.2;
    return 0.0;
  }

  /**
   * Compute the dominant IssueDimensions for a cluster from an array of member
   * dimensions. Returns the most common (issue_type, failure_mode) pair.
   * Used by the purity checker and merge guard.
   */
  computeDominantDimensions(
    members: IssueDimensions[],
  ): { issue_type: IssueType; failure_mode: FailureMode; purity: number } {
    if (members.length === 0) {
      return { issue_type: 'other', failure_mode: 'other', purity: 0 };
    }

    // Count (issue_type, failure_mode) pairs
    const counts = new Map<string, number>();
    for (const m of members) {
      const key = `${m.issue_type}:${m.failure_mode}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    // Find the dominant pair
    let bestKey = '';
    let bestCount = 0;
    for (const [key, count] of counts.entries()) {
      if (count > bestCount) {
        bestCount = count;
        bestKey = key;
      }
    }

    const [issue_type, failure_mode] = bestKey.split(':') as [IssueType, FailureMode];
    const purity = bestCount / members.length;

    return { issue_type, failure_mode, purity };
  }

  /**
   * Compute cluster purity score (0–1).
   * 1.0 = all members have the same (issue_type, failure_mode).
   * 0.0 = completely heterogeneous.
   *
   * A purity < PURITY_SPLIT_THRESHOLD (0.60) indicates the cluster should be
   * considered for splitting.
   */
  computeClusterPurity(members: IssueDimensions[]): number {
    if (members.length === 0) return 1.0;
    const { purity } = this.computeDominantDimensions(members);
    return purity;
  }

  /**
   * Group cluster members into sub-clusters by (issue_type, failure_mode).
   * Returns groups sorted by size descending.
   * Used by the split logic in ClusterPurityService.
   */
  groupByActionability(
    members: Array<{ id: string; dimensions: IssueDimensions }>,
  ): Array<{ key: string; issue_type: IssueType; failure_mode: FailureMode; ids: string[] }> {
    const groups = new Map<string, { issue_type: IssueType; failure_mode: FailureMode; ids: string[] }>();

    for (const { id, dimensions } of members) {
      const key = `${dimensions.issue_type}:${dimensions.failure_mode}`;
      if (!groups.has(key)) {
        groups.set(key, {
          issue_type: dimensions.issue_type,
          failure_mode: dimensions.failure_mode,
          ids: [],
        });
      }
      groups.get(key)!.ids.push(id);
    }

    return Array.from(groups.entries())
      .map(([key, val]) => ({ key, ...val }))
      .sort((a, b) => b.ids.length - a.ids.length);
  }

  // ─── Heuristic extraction ────────────────────────────────────────────────────

  private extractByHeuristic(text: string): IssueDimensions {
    const lower = text.toLowerCase();

    // Detect issue_type
    let issueType: IssueType = 'other';
    let issueConfidence = 0.3;
    for (const pattern of ISSUE_TYPE_PATTERNS) {
      const primaryHits = pattern.primary.filter((kw) => lower.includes(kw)).length;
      const secondaryHits = pattern.secondary.filter((kw) => lower.includes(kw)).length;
      const score = primaryHits * 0.9 + secondaryHits * 0.5;
      if (score > issueConfidence) {
        issueConfidence = Math.min(0.95, score);
        issueType = pattern.type;
      }
    }

    // Detect failure_mode
    let failureMode: FailureMode = 'other';
    let failureConfidence = 0.3;
    for (const pattern of FAILURE_MODE_PATTERNS) {
      const primaryHits = pattern.primary.filter((kw) => lower.includes(kw)).length;
      const secondaryHits = pattern.secondary.filter((kw) => lower.includes(kw)).length;
      const score = primaryHits * 0.9 + secondaryHits * 0.5;
      if (score > failureConfidence) {
        failureConfidence = Math.min(0.95, score);
        failureMode = pattern.mode;
      }
    }

    // For missing_feature, failure_mode is always no_failure
    if (issueType === 'missing_feature') {
      failureMode = 'no_failure';
      failureConfidence = Math.max(failureConfidence, 0.8);
    }

    // Extract user_intent and affected_object heuristically
    // These are best-effort from the title (first sentence)
    const titleWords = text.split('\n')[0].trim().toLowerCase();
    const userIntent = this.extractUserIntent(titleWords);
    const affectedObject = this.extractAffectedObject(titleWords);

    const overallConfidence = (issueConfidence + failureConfidence) / 2;
    const signature = `${issueType}:${failureMode}:${affectedObject}`;

    return {
      issue_type: issueType,
      failure_mode: failureMode,
      user_intent: userIntent,
      affected_object: affectedObject,
      actionability_signature: signature,
      extraction_confidence: overallConfidence,
      extraction_method: 'heuristic',
    };
  }

  private extractUserIntent(title: string): string {
    // Remove common noise words and return a compact verb phrase
    const cleaned = title
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const words = cleaned.split(' ').slice(0, 6);
    return words.join(' ') || 'use feature';
  }

  private extractAffectedObject(title: string): string {
    // Extract a noun phrase — take the last 3–4 meaningful words
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'not', 'no', 'and',
      'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'when', 'after', 'before', 'during', 'while', 'i', 'we', 'my',
    ]);
    const words = title
      .replace(/[^\w\s]/g, ' ')
      .split(' ')
      .filter((w) => w.length > 2 && !stopWords.has(w));
    return words.slice(-3).join(' ') || 'system feature';
  }

  // ─── LLM extraction ──────────────────────────────────────────────────────────

  private async extractByLlm(text: string): Promise<IssueDimensions> {
    const response = await this.openai!.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: text.slice(0, 1000), // cap at 1000 chars to control cost
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 200,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as {
      issue_type?: string;
      failure_mode?: string;
      user_intent?: string;
      affected_object?: string;
      confidence?: number;
    };

    const issueType = this.validateIssueType(parsed.issue_type);
    const failureMode = this.validateFailureMode(parsed.failure_mode);
    const userIntent = (parsed.user_intent ?? 'use feature').slice(0, 50);
    const affectedObject = (parsed.affected_object ?? 'system feature').slice(0, 50);
    const confidence = Math.min(1, Math.max(0, parsed.confidence ?? 0.7));
    const signature = `${issueType}:${failureMode}:${affectedObject}`;

    return {
      issue_type: issueType,
      failure_mode: failureMode,
      user_intent: userIntent,
      affected_object: affectedObject,
      actionability_signature: signature,
      extraction_confidence: confidence,
      extraction_method: 'llm',
    };
  }

  private validateIssueType(raw: string | undefined): IssueType {
    const valid: IssueType[] = [
      'bug', 'regression', 'missing_feature', 'performance', 'ux_confusion',
      'data_quality', 'security', 'integration_failure', 'documentation', 'other',
    ];
    return valid.includes(raw as IssueType) ? (raw as IssueType) : 'other';
  }

  private validateFailureMode(raw: string | undefined): FailureMode {
    const valid: FailureMode[] = [
      'timeout', 'crash', 'wrong_output', 'missing_output', 'permission_denied',
      'data_loss', 'ui_broken', 'slow_response', 'no_failure', 'other',
    ];
    return valid.includes(raw as FailureMode) ? (raw as FailureMode) : 'other';
  }
}

// NOTE: PURITY_SPLIT_THRESHOLD, PURITY_MIN_SPLIT_SIZE, and W_ACTIONABILITY
// are defined in ../config/clustering-thresholds.config.ts to keep all
// tunable constants in one place.
