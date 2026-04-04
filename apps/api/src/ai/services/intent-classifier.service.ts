/**
 * IntentClassifierService
 *
 * Classifies a feedback item into one of 7 intent domains using a two-stage
 * approach:
 *
 *   Stage 1 — Keyword heuristic (synchronous, zero latency):
 *     Fast keyword matching against the 7 friction-class taxonomy.
 *     Used as the primary classifier for high-confidence matches and as
 *     the fallback when the LLM is unavailable or returns an invalid response.
 *
 *   Stage 2 — LLM structured output (async, ~200ms):
 *     Calls gpt-4.1-mini with a JSON-mode prompt that returns a typed
 *     IntentClassification object.  Used when the keyword heuristic returns
 *     low confidence (< 0.70) or when the caller explicitly requests LLM mode.
 *
 * The service is intentionally stateless — no DB writes, no queue jobs.
 * Callers (ThemeClusteringService, ClusterRefinementService) decide what to
 * do with the result.
 *
 * ── Intent Domains ────────────────────────────────────────────────────────────
 *
 *   core_workflow_blocked   — login, auth, payment, data loss, API failure
 *   permissions_access      — role, access control, SSO, sharing
 *   performance_latency     — slow, timeout, freeze, unresponsive
 *   navigation_confusion    — hard to find, confusing UX, menu/sidebar issues
 *   reporting_visibility    — analytics, charts, metrics, audit logs
 *   missing_configuration   — feature request, limit, quota, settings
 *   minor_ux                — cosmetic, label, colour, tooltip, spacing
 *
 * ── Confidence Levels ─────────────────────────────────────────────────────────
 *
 *   >= 0.90  high    — keyword match on primary class keywords
 *   >= 0.70  medium  — keyword match on secondary keywords or LLM agreement
 *   <  0.70  low     — no keyword match; LLM used or defaulted to minor_ux
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { FrictionClass, FRICTION_CLASS_WEIGHTS } from './ciq.service';

// ─── Output types ─────────────────────────────────────────────────────────────

export type IntentDomain = FrictionClass;

export interface IntentClassification {
  /** Primary intent domain */
  domain: IntentDomain;
  /** Confidence 0–1 */
  confidence: number;
  /** 'keyword' | 'llm' | 'fallback' */
  method: 'keyword' | 'llm' | 'fallback';
  /** Business-impact weight for this domain (from FRICTION_CLASS_WEIGHTS) */
  impactWeight: number;
  /**
   * Secondary domain if the text spans two concern areas.
   * Null when the primary domain is clear.
   */
  secondaryDomain?: IntentDomain | null;
}

// ─── Keyword taxonomy ─────────────────────────────────────────────────────────

interface DomainKeywords {
  domain: IntentDomain;
  /** High-confidence primary keywords (confidence 0.90) */
  primary: string[];
  /** Medium-confidence secondary keywords (confidence 0.70) */
  secondary: string[];
}

const DOMAIN_TAXONOMY: DomainKeywords[] = [
  {
    domain: 'core_workflow_blocked',
    primary: [
      'login', 'logout', 'auth', 'authentication', 'payment', 'billing',
      'checkout', 'export', 'import', 'api', 'sync', 'webhook', 'crash',
      'broken', 'blocked', 'cannot', 'unable', 'data loss', 'not working',
    ],
    secondary: [
      'error', 'fail', 'failed', 'failure', 'down', 'offline', 'unavailable',
      'integration', 'connect', 'connection',
    ],
  },
  {
    domain: 'permissions_access',
    primary: [
      'permission', 'permissions', 'role', 'roles', 'access', 'forbidden',
      'unauthorized', 'denied', 'sso', 'saml', 'oauth', 'privilege',
    ],
    secondary: [
      'admin', 'share', 'sharing', 'invite', 'visibility', 'restrict',
      'restriction', 'policy',
    ],
  },
  {
    domain: 'performance_latency',
    primary: [
      'slow', 'timeout', 'latency', 'freeze', 'hang', 'unresponsive',
      'lag', 'laggy', 'loading forever', 'takes too long',
    ],
    secondary: [
      'load', 'loading', 'performance', 'speed', 'delay', 'wait', 'waiting',
      'spinner', 'stuck',
    ],
  },
  {
    domain: 'navigation_confusion',
    primary: [
      'confusing', 'hard to find', 'cant find', "can't find", 'lost',
      'navigation', 'menu', 'sidebar', 'breadcrumb',
    ],
    secondary: [
      'search', 'filter', 'sort', 'find', 'unclear', 'where is',
      'how do i', 'not intuitive', 'dashboard',
    ],
  },
  {
    domain: 'reporting_visibility',
    primary: [
      'report', 'reports', 'analytics', 'chart', 'charts', 'graph',
      'metric', 'metrics', 'insight', 'insights', 'audit log',
    ],
    secondary: [
      'visibility', 'tracking', 'history', 'log', 'logs', 'export data',
      'download', 'csv', 'excel',
    ],
  },
  {
    domain: 'missing_configuration',
    primary: [
      'feature request', 'missing feature', 'add support', 'please add',
      'would love', 'wish', 'limit', 'quota', 'plan', 'upgrade',
    ],
    secondary: [
      'configure', 'configuration', 'setting', 'settings', 'customise',
      'customize', 'option', 'options', 'support for', 'integrate',
    ],
  },
];

// ─── LLM prompt ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a product analytics classifier. Classify the user feedback into exactly one of these intent domains:

- core_workflow_blocked: login, auth, payment, data loss, API failure, crashes
- permissions_access: role/access control, SSO, sharing, forbidden errors
- performance_latency: slow, timeout, freeze, unresponsive UI
- navigation_confusion: hard to find, confusing UX, menu/sidebar issues
- reporting_visibility: analytics, charts, metrics, audit logs
- missing_configuration: feature requests, limits, quotas, settings
- minor_ux: cosmetic issues, labels, colours, tooltips, spacing

Respond with a JSON object only, no markdown, no explanation:
{
  "domain": "<one of the 7 domains above>",
  "confidence": <0.0–1.0>,
  "reasoning": "<one sentence>",
  "secondary_domain": "<domain or null>"
}`;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class IntentClassifierService {
  private readonly logger = new Logger(IntentClassifierService.name);
  private readonly openai: OpenAI | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Classify a single feedback text.
   *
   * Uses keyword heuristic first. If confidence < 0.70 and LLM is available,
   * falls back to LLM structured output.
   *
   * @param text  Combined text (title + description + rawText)
   * @param useLlm  Force LLM classification regardless of keyword confidence
   */
  async classify(text: string, useLlm = false): Promise<IntentClassification> {
    const keywordResult = this.classifyByKeyword(text);

    if (!useLlm && keywordResult.confidence >= 0.70) {
      return keywordResult;
    }

    if (!this.openai) {
      this.logger.debug(
        `[IntentClassifier] LLM unavailable (no API key) — using keyword fallback (confidence=${keywordResult.confidence.toFixed(2)})`,
      );
      return { ...keywordResult, method: 'fallback' };
    }

    try {
      const llmResult = await this.classifyByLlm(text);
      // If LLM returns higher confidence, prefer it; otherwise keep keyword result
      return llmResult.confidence >= keywordResult.confidence ? llmResult : keywordResult;
    } catch (err) {
      this.logger.warn(
        `[IntentClassifier] LLM classification failed — using keyword fallback: ${(err as Error).message}`,
      );
      return { ...keywordResult, method: 'fallback' };
    }
  }

  /**
   * Batch classify multiple feedback texts.
   * Uses keyword heuristic for all items, then LLM for low-confidence ones.
   * Max 10 LLM calls per batch to control cost.
   */
  async classifyBatch(
    texts: Array<{ id: string; text: string }>,
  ): Promise<Map<string, IntentClassification>> {
    const results = new Map<string, IntentClassification>();
    const needsLlm: Array<{ id: string; text: string }> = [];

    for (const { id, text } of texts) {
      const keywordResult = this.classifyByKeyword(text);
      results.set(id, keywordResult);
      if (keywordResult.confidence < 0.70) {
        needsLlm.push({ id, text });
      }
    }

    if (this.openai && needsLlm.length > 0) {
      const llmBatch = needsLlm.slice(0, 10); // cost guard
      await Promise.allSettled(
        llmBatch.map(async ({ id, text }) => {
          try {
            const llmResult = await this.classifyByLlm(text);
            const existing = results.get(id)!;
            if (llmResult.confidence >= existing.confidence) {
              results.set(id, llmResult);
            }
          } catch {
            // Keep keyword result on LLM failure
          }
        }),
      );
    }

    return results;
  }

  // ─── Keyword heuristic ───────────────────────────────────────────────────────

  private classifyByKeyword(text: string): IntentClassification {
    const lower = text.toLowerCase();

    let bestDomain: IntentDomain = 'minor_ux';
    let bestConfidence = 0.30; // default for no-match
    let secondaryDomain: IntentDomain | null = null;
    let matchCount = 0;

    for (const { domain, primary, secondary } of DOMAIN_TAXONOMY) {
      const primaryMatch = primary.some((kw) => lower.includes(kw));
      const secondaryMatch = secondary.some((kw) => lower.includes(kw));

      if (primaryMatch) {
        const conf = 0.90;
        if (conf > bestConfidence) {
          if (bestConfidence >= 0.70) secondaryDomain = bestDomain;
          bestDomain = domain;
          bestConfidence = conf;
          matchCount++;
        } else if (conf >= 0.70 && !secondaryDomain) {
          secondaryDomain = domain;
        }
      } else if (secondaryMatch) {
        const conf = 0.70;
        if (conf > bestConfidence) {
          if (bestConfidence >= 0.70) secondaryDomain = bestDomain;
          bestDomain = domain;
          bestConfidence = conf;
          matchCount++;
        } else if (conf >= 0.70 && !secondaryDomain) {
          secondaryDomain = domain;
        }
      }
    }

    return {
      domain: bestDomain,
      confidence: bestConfidence,
      method: 'keyword',
      impactWeight: FRICTION_CLASS_WEIGHTS[bestDomain],
      secondaryDomain,
    };
  }

  // ─── LLM structured output ───────────────────────────────────────────────────

  private async classifyByLlm(text: string): Promise<IntentClassification> {
    const truncated = text.slice(0, 800); // avoid large token counts
    const response = await this.openai!.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: truncated },
      ],
      temperature: 0,
      max_tokens: 120,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0].message.content ?? '{}';
    const parsed = JSON.parse(raw) as {
      domain?: string;
      confidence?: number;
      secondary_domain?: string | null;
    };

    const domain = this.validateDomain(parsed.domain) ?? 'minor_ux';
    const confidence = typeof parsed.confidence === 'number'
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.60;
    const secondaryDomain = parsed.secondary_domain
      ? this.validateDomain(parsed.secondary_domain)
      : null;

    return {
      domain,
      confidence,
      method: 'llm',
      impactWeight: FRICTION_CLASS_WEIGHTS[domain],
      secondaryDomain,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private validateDomain(value: string | undefined | null): IntentDomain | null {
    const valid: IntentDomain[] = [
      'core_workflow_blocked',
      'permissions_access',
      'performance_latency',
      'navigation_confusion',
      'reporting_visibility',
      'missing_configuration',
      'minor_ux',
    ];
    return valid.includes(value as IntentDomain) ? (value as IntentDomain) : null;
  }
}
