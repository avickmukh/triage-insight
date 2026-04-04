'use client';
/**
 * AI Roadmap Suggestions — /:orgSlug/app/roadmap/ai-suggestions
 *
 * Displays AI-generated roadmap suggestions for all active themes.
 * Each suggestion shows:
 *   - Suggestion type badge (ADD_TO_ROADMAP / INCREASE_PRIORITY / DECREASE_PRIORITY / MONITOR / NO_ACTION)
 *   - Roadmap Priority Score (RPS) with breakdown bar and formula tooltip
 *   - CIQ Score
 *   - Reason sentence (deterministic, based on real signals)
 *   - Confidence level (HIGH / MEDIUM / LOW) + explanation
 *   - Signal summary (total signals, source mix, velocity WoW%)
 *   - Dominant driver
 *   - "Add to roadmap" button on every card (links to theme detail — does NOT auto-create)
 *
 * AI assists decision-making — it does NOT auto-create roadmap items.
 *
 * RPS formula:
 *   RPS = 33% CIQ + 19% Velocity + 14% Sentiment + 14% Source Mix + 10% Recency + 5% Confidence + 5% Resurfacing
 *
 * Suggestion type thresholds:
 *   ADD_TO_ROADMAP   → RPS ≥ 65 and not already on roadmap
 *   INCREASE_PRIORITY → RPS ≥ 70 and already on roadmap at lower priority
 *   DECREASE_PRIORITY → RPS < 25 and already on roadmap
 *   MONITOR          → RPS 40–69 (moderate signals, not yet strong enough to act on)
 *   NO_ACTION        → RPS < 40 and not on roadmap
 */

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useWorkspace } from '@/hooks/use-workspace';
import { useAiRoadmapSuggestions } from '@/hooks/use-roadmap';
import { appRoutes } from '@/lib/routes';
import {
  AiRoadmapSuggestion,
  AiSuggestionType,
  AiConfidenceLevel,
} from '@/lib/api-types';

// ─── Design tokens ────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

// ─── Suggestion type metadata ─────────────────────────────────────────────────

const SUGGESTION_META: Record<AiSuggestionType, {
  icon: string;
  label: string;
  bg: string;
  color: string;
  border: string;
  description: string;
}> = {
  ADD_TO_ROADMAP:     { icon: '🔥', label: 'Add to Roadmap',     bg: '#fff3cd', color: '#b8860b', border: '#f0e6b0', description: 'RPS ≥ 65 — strong signals, not yet on roadmap' },
  INCREASE_PRIORITY:  { icon: '⬆',  label: 'Increase Priority',  bg: '#e8f7f7', color: '#20A4A4', border: '#b2e4e4', description: 'RPS ≥ 70 — signals growing, already on roadmap at lower priority' },
  DECREASE_PRIORITY:  { icon: '⬇',  label: 'Decrease Priority',  bg: '#fdecea', color: '#c62828', border: '#f5c6cb', description: 'RPS < 25 — signals declining, already on roadmap' },
  MONITOR:            { icon: '👁',  label: 'Monitor',            bg: '#f0f5ff', color: '#1a56db', border: '#c7d9fb', description: 'RPS 40–69 — moderate signals, not yet strong enough to act on' },
  NO_ACTION:          { icon: '—',   label: 'No Action',          bg: '#f8f9fa', color: '#6C757D', border: '#dee2e6', description: 'RPS < 40 — weak signals, not on roadmap' },
};

const CONFIDENCE_META: Record<AiConfidenceLevel, { label: string; color: string; bg: string }> = {
  HIGH:   { label: 'High Confidence',   color: '#2e7d32', bg: '#e8f5e9' },
  MEDIUM: { label: 'Medium Confidence', color: '#f57c00', bg: '#fff3e8' },
  LOW:    { label: 'Low Confidence',    color: '#c62828', bg: '#fdecea' },
};

// ─── RPS formula tooltip ──────────────────────────────────────────────────────

const RPS_FORMULA = 'RPS = 35% CIQ + 20% Velocity + 15% Sentiment + 15% Source Mix + 10% Recency + 5% Resurfacing';

// ─── Sub-components ───────────────────────────────────────────────────────────

function RpsBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 70 ? '#20A4A4' : pct >= 40 ? '#f57c00' : '#c62828';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ flex: 1, height: 6, background: '#e9ecef', borderRadius: 3, overflow: 'hidden', minWidth: 80 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color, minWidth: 28, textAlign: 'right' }}>{Math.round(pct)}</span>
    </div>
  );
}

function SourceBadge({ label, count, color }: { label: string; count: number; color: string }) {
  if (count === 0) return null;
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 600, color,
      background: color + '18', padding: '0.1rem 0.45rem',
      borderRadius: '999px', whiteSpace: 'nowrap',
    }}>
      {label} {count}
    </span>
  );
}

function SuggestionCard({ item, orgSlug }: { item: AiRoadmapSuggestion; orgSlug: string }) {
  const meta       = SUGGESTION_META[item.suggestionType];
  const confMeta   = CONFIDENCE_META[item.confidence];
  const routes     = appRoutes(orgSlug);

  return (
    <div style={{
      border: `1px solid ${meta.border}`,
      borderRadius: '0.75rem',
      padding: '1.25rem',
      background: '#fff',
      boxShadow: '0 1px 3px rgba(10,37,64,0.05)',
    }}>
      {/* ── Header row ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          {/* Suggestion type badge with tooltip */}
          <span
            title={meta.description}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em',
              color: meta.color, background: meta.bg,
              padding: '0.2rem 0.6rem', borderRadius: '999px',
              marginBottom: '0.4rem', cursor: 'help',
            }}
          >
            {meta.icon} {meta.label}
          </span>
          {/* Theme title */}
          <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, color: '#0a2540' }}>
            <Link
              href={`${routes.themes}/${item.themeId}`}
              style={{ color: '#0a2540', textDecoration: 'none' }}
            >
              {item.themeTitle}
            </Link>
          </h3>
        </div>

        {/* RPS + CIQ scores */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ textAlign: 'center' }}>
            <p
              title={RPS_FORMULA}
              style={{ margin: 0, fontSize: '0.65rem', color: '#6C757D', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'help', textDecoration: 'underline dotted #adb5bd' }}
            >
              RPS
            </p>
            <p style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: item.roadmapPriorityScore >= 70 ? '#20A4A4' : item.roadmapPriorityScore >= 40 ? '#f57c00' : '#c62828' }}>
              {Math.round(item.roadmapPriorityScore)}
            </p>
          </div>
          <div style={{ width: 1, height: 32, background: '#e9ecef' }} />
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '0.65rem', color: '#6C757D', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>CIQ</p>
            <p style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#0a2540' }}>
              {Math.round(item.ciqScore)}
            </p>
          </div>
        </div>
      </div>

      {/* ── RPS bar ── */}
      <div style={{ marginBottom: '0.75rem' }}>
        <p
          title={RPS_FORMULA}
          style={{ margin: '0 0 0.25rem', fontSize: '0.7rem', color: '#6C757D', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'help' }}
        >
          Roadmap Priority Score
          <span style={{ marginLeft: '0.35rem', fontSize: '0.65rem', color: '#adb5bd', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
            (35% CIQ · 20% Velocity · 15% Sentiment · 15% Sources · 10% Recency · 5% Resurfacing)
          </span>
        </p>
        <RpsBar score={item.roadmapPriorityScore} />
      </div>

      {/* ── Reason ── */}
      <p style={{ margin: '0 0 0.625rem', fontSize: '0.8125rem', color: '#344054', lineHeight: 1.55 }}>
        {item.reason}
      </p>

      {/* ── Signal summary row ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.625rem' }}>
        <SourceBadge label="Feedback" count={item.signalSummary.feedbackCount} color="#1a56db" />
        <SourceBadge label="Voice"    count={item.signalSummary.voiceCount}    color="#7c3aed" />
        <SourceBadge label="Support"  count={item.signalSummary.supportCount}  color="#c62828" />
        <SourceBadge label="Survey"   count={item.signalSummary.surveyCount}   color="#20A4A4" />
        {item.signalSummary.velocityDelta !== null && item.signalSummary.velocityDelta !== 0 && (
          <span style={{
            fontSize: '0.7rem', fontWeight: 600,
            color: item.signalSummary.velocityDelta > 0 ? '#2e7d32' : '#c62828',
            background: item.signalSummary.velocityDelta > 0 ? '#e8f5e9' : '#fdecea',
            padding: '0.1rem 0.45rem', borderRadius: '999px', whiteSpace: 'nowrap',
          }}>
            {item.signalSummary.velocityDelta > 0 ? '📈' : '📉'} {item.signalSummary.velocityDelta > 0 ? '+' : ''}{item.signalSummary.velocityDelta.toFixed(0)}% WoW
          </span>
        )}
        {item.signalSummary.activeSources >= 2 && (
          <span style={{
            fontSize: '0.7rem', fontWeight: 600, color: '#7c3aed',
            background: '#faf5ff', padding: '0.1rem 0.45rem', borderRadius: '999px',
          }}>
            🔗 {item.signalSummary.activeSources} sources
          </span>
        )}
      </div>

      {/* ── Confidence + explanation ── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
        background: confMeta.bg, borderRadius: '0.5rem',
        padding: '0.5rem 0.75rem', marginBottom: '0.75rem',
      }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: confMeta.color, whiteSpace: 'nowrap', paddingTop: '0.05rem' }}>
          {confMeta.label}
        </span>
        {item.confidenceExplanation && (
          <span style={{ fontSize: '0.75rem', color: '#344054', lineHeight: 1.4 }}>
            — {item.confidenceExplanation}
          </span>
        )}
      </div>

      {/* ── Score breakdown (collapsible detail) ── */}
      <details style={{ marginBottom: '0.75rem' }}>
        <summary style={{ fontSize: '0.75rem', color: '#6C757D', cursor: 'pointer', userSelect: 'none', fontWeight: 500 }}>
          ▸ Score breakdown (RPS = CIQ×33% + Velocity×19% + Sentiment×14% + Source×14% + Recency×10% + Confidence×5% + Resurfacing×5%)
        </summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.375rem', marginTop: '0.5rem' }}>
          {(item.breakdown.scoreBreakdown ?? [
            { factor: 'CIQ Score',        rawScore: item.breakdown.ciqScore,        weight: 0.33, contribution: item.breakdown.ciqScore * 0.33 },
            { factor: 'Signal Velocity',  rawScore: item.breakdown.velocityScore,   weight: 0.19, contribution: item.breakdown.velocityScore * 0.19 },
            { factor: 'Sentiment',        rawScore: item.breakdown.sentimentScore,  weight: 0.14, contribution: item.breakdown.sentimentScore * 0.14 },
            { factor: 'Source Coverage',  rawScore: item.breakdown.sourceScore,     weight: 0.14, contribution: item.breakdown.sourceScore * 0.14 },
            { factor: 'Recency',          rawScore: item.breakdown.recencyScore,    weight: 0.10, contribution: item.breakdown.recencyScore * 0.10 },
            { factor: 'Confidence',       rawScore: item.breakdown.confidenceScore ?? 0, weight: 0.05, contribution: (item.breakdown.confidenceScore ?? 0) * 0.05 },
            { factor: 'Resurfacing Bonus',rawScore: item.breakdown.resurfacingBonus,weight: 0.05, contribution: item.breakdown.resurfacingBonus * 0.05 },
          ]).map(({ factor, rawScore, weight, contribution }) => (
            <div key={factor} style={{ background: '#f8f9fa', borderRadius: '0.375rem', padding: '0.375rem 0.5rem' }}>
              <p style={{ margin: 0, fontSize: '0.65rem', color: '#6C757D', fontWeight: 500 }}>
                {factor} <span style={{ color: '#adb5bd' }}>({Math.round(weight * 100)}%)</span>
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem', marginTop: '0.1rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0a2540' }}>{rawScore.toFixed(1)}</span>
                <span style={{ fontSize: '0.65rem', color: '#20A4A4', fontWeight: 600 }}>+{contribution.toFixed(1)} pts</span>
              </div>
            </div>
          ))}
        </div>
        {item.dominantDriver && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#6C757D' }}>
            Dominant driver: <strong style={{ color: '#0a2540' }}>{item.dominantDriver}</strong>
          </p>
        )}
      </details>

      {/* ── Actions — always shown ── */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* View theme detail */}
        <Link
          href={`${routes.themes}/${item.themeId}`}
          style={{
            fontSize: '0.8125rem', fontWeight: 600,
            color: '#0a2540', background: '#f0f4f8',
            padding: '0.375rem 0.875rem', borderRadius: '0.5rem',
            textDecoration: 'none', display: 'inline-block',
            border: '1px solid #dee2e6',
          }}
        >
          View Theme →
        </Link>

        {/* Add to roadmap — shown when not already on roadmap */}
        {!item.roadmapItemId && (
          <Link
            href={`${routes.themes}/${item.themeId}?action=add-to-roadmap`}
            style={{
              fontSize: '0.8125rem', fontWeight: 600,
              color: '#fff', background: '#20A4A4',
              padding: '0.375rem 0.875rem', borderRadius: '0.5rem',
              textDecoration: 'none', display: 'inline-block',
            }}
          >
            + Add to Roadmap
          </Link>
        )}

        {/* Already on roadmap — view it */}
        {item.roadmapItemId && (
          <Link
            href={`${routes.roadmap}/${item.roadmapItemId}`}
            style={{
              fontSize: '0.8125rem', fontWeight: 600,
              color: '#1a56db', background: '#f0f5ff',
              padding: '0.375rem 0.875rem', borderRadius: '0.5rem',
              textDecoration: 'none', display: 'inline-block',
            }}
          >
            View Roadmap Item →
          </Link>
        )}

        {/* Monitor note */}
        {item.suggestionType === 'MONITOR' && (
          <span style={{ fontSize: '0.75rem', color: '#6C757D', fontStyle: 'italic' }}>
            RPS {Math.round(item.roadmapPriorityScore)}/100 — moderate signals, not yet strong enough to act on
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{ border: '1px solid #e9ecef', borderRadius: '0.75rem', padding: '1.25rem', background: '#fff' }}>
      <div style={{ height: '1.25rem', background: '#e9ecef', borderRadius: '0.25rem', width: '60%', marginBottom: '0.5rem' }} />
      <div style={{ height: '0.875rem', background: '#f0f4f8', borderRadius: '0.25rem', width: '90%', marginBottom: '0.375rem' }} />
      <div style={{ height: '0.875rem', background: '#f0f4f8', borderRadius: '0.25rem', width: '75%' }} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AiRoadmapSuggestionsPage() {
  const params    = useParams<{ orgSlug: string }>();
  const orgSlug   = params.orgSlug;
  const routes    = appRoutes(orgSlug);
  const { workspace } = useWorkspace();
  const workspaceId   = workspace?.id ?? '';

  const { data, isLoading } = useAiRoadmapSuggestions(workspaceId, 50);
  const suggestions = data?.data ?? [];
  const summary     = data?.summary;

  // Filter tabs — no "All" tab; default to ADD_TO_ROADMAP
  const tabs: { key: AiSuggestionType; label: string; count: number }[] = [
    { key: 'ADD_TO_ROADMAP',    label: '🔥 Add to Roadmap',    count: summary?.addToRoadmap ?? 0 },
    { key: 'INCREASE_PRIORITY', label: '⬆ Increase Priority',  count: summary?.increasePriority ?? 0 },
    { key: 'DECREASE_PRIORITY', label: '⬇ Decrease Priority',  count: summary?.decreasePriority ?? 0 },
    { key: 'MONITOR',           label: '👁 Monitor',            count: summary?.monitor ?? 0 },
  ];

  const [activeTab, setActiveTab] = useState<AiSuggestionType>('ADD_TO_ROADMAP');

  const filtered = suggestions.filter(s => s.suggestionType === activeTab);

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <Link href={routes.roadmap} style={{ color: '#6C757D', textDecoration: 'none', fontSize: '0.875rem' }}>Roadmap</Link>
          <span style={{ color: '#6C757D' }}>›</span>
          <span style={{ fontSize: '0.875rem', color: '#0a2540', fontWeight: 500 }}>AI Suggestions</span>
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a2540', margin: '0 0 0.25rem' }}>
          AI Roadmap Suggestions
        </h1>
        <p style={{ color: '#6C757D', margin: '0 0 0.25rem', fontSize: '0.875rem' }}>
          AI-assisted prioritisation based on CIQ scoring, signal velocity, sentiment, and cross-source evidence.
          Suggestions are explainable and human-reviewable — AI does not auto-create roadmap items.
        </p>
        <p style={{ color: '#adb5bd', margin: 0, fontSize: '0.78rem' }}>
          <strong style={{ color: '#6C757D' }}>RPS formula:</strong>{' '}
          {RPS_FORMULA}.
          Hover any RPS label for details.
        </p>
      </div>

      {/* ── Summary KPI row ── */}
      {!isLoading && summary && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          {[
            { key: 'ADD_TO_ROADMAP'    as AiSuggestionType, label: 'Add to Roadmap',    value: summary.addToRoadmap,     color: '#b8860b', bg: '#fff3cd', description: 'RPS ≥ 70 — strong signals, not yet on roadmap' },
            { key: 'INCREASE_PRIORITY' as AiSuggestionType, label: 'Increase Priority', value: summary.increasePriority, color: '#20A4A4', bg: '#e8f7f7', description: 'RPS ≥ 55 — growing signals, already on roadmap' },
            { key: 'DECREASE_PRIORITY' as AiSuggestionType, label: 'Decrease Priority', value: summary.decreasePriority, color: '#c62828', bg: '#fdecea', description: 'RPS < 30 — declining signals, already on roadmap' },
            { key: 'MONITOR'           as AiSuggestionType, label: 'Monitor',           value: summary.monitor,          color: '#1a56db', bg: '#f0f5ff', description: 'RPS 30–69 — moderate signals, not yet strong enough to act on' },
          ].map(({ key, label, value, color, bg, description }) => (
            <button
              key={label}
              title={description}
              onClick={() => setActiveTab(key)}
              style={{
                ...CARD,
                flex: 1, minWidth: 120, padding: '0.875rem 1rem',
                background: activeTab === key ? bg : '#fff',
                border: activeTab === key ? `2px solid ${color}` : `1px solid ${color}28`,
                cursor: 'pointer', textAlign: 'left',
                outline: 'none',
              }}
            >
              <p style={{ margin: 0, fontSize: '0.7rem', color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
              <p style={{ margin: '0.125rem 0 0', fontSize: '1.5rem', fontWeight: 700, color }}>{value}</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.65rem', color: '#adb5bd', fontWeight: 400 }}>{description}</p>
            </button>
          ))}
        </div>
      )}

      {/* ── Filter tabs ── */}
      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              fontSize: '0.8125rem', fontWeight: activeTab === tab.key ? 700 : 500,
              color: activeTab === tab.key ? '#0a2540' : '#6C757D',
              background: activeTab === tab.key ? '#fff' : 'transparent',
              border: activeTab === tab.key ? '1.5px solid #0a2540' : '1.5px solid #dee2e6',
              borderRadius: '999px', padding: '0.3rem 0.875rem',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <div style={{ display: 'grid', gap: '0.875rem' }}>
          {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '3rem' }}>
          {suggestions.length === 0 ? (
            <div>
              <p style={{ color: '#6C757D', marginBottom: '0.5rem', fontWeight: 600 }}>No active themes found.</p>
              <p style={{ color: '#adb5bd', fontSize: '0.875rem' }}>Add feedback to themes and run the AI pipeline to generate suggestions.</p>
            </div>
          ) : (
            <div>
              <p style={{ color: '#6C757D', marginBottom: '0.5rem', fontWeight: 600 }}>
                No themes in the &ldquo;{SUGGESTION_META[activeTab].label}&rdquo; category right now.
              </p>
              <p style={{ color: '#adb5bd', fontSize: '0.8125rem', margin: 0 }}>
                {SUGGESTION_META[activeTab].description}.
                {activeTab === 'ADD_TO_ROADMAP' && ' Themes need RPS ≥ 65 to appear here.'}
                {activeTab === 'INCREASE_PRIORITY' && ' Themes on the roadmap need RPS ≥ 70 to appear here.'}
                {activeTab === 'DECREASE_PRIORITY' && ' Roadmap themes need RPS < 25 to appear here.'}
                {activeTab === 'MONITOR' && ' Themes with RPS 40–69 appear here.'}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.875rem' }}>
          {filtered.map(item => (
            <SuggestionCard key={item.themeId} item={item} orgSlug={orgSlug} />
          ))}
        </div>
      )}

      {/* ── Footer note ── */}
      {!isLoading && suggestions.length > 0 && (
        <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#adb5bd', textAlign: 'center' }}>
          Computed at {data?.computedAt ? new Date(data.computedAt).toLocaleString() : '—'}.
          Suggestions are based on real signals — no hallucination, no auto-creation.
        </p>
      )}
    </div>
  );
}
