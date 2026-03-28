'use client';
/**
 * Unified Intelligence Hub — /:orgSlug/app/intelligence
 *
 * Sections:
 *  1. Source Breakdown Summary (voice / support / feedback totals)
 *  2. Top Issues Across ALL Sources (unified cross-source ranking)
 *  3. CIQ Strategic Signals + Roadmap Recommendations
 *  4. Top Themes by CIQ Score
 *  5. Strategic Signal Feed
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCiqStrategicSignals, useCiqThemeRanking } from '@/hooks/use-ciq';
import { useTopIssues, useSourceSummary, useAggregateAll } from '@/hooks/use-themes';
import { useWorkspace } from '@/hooks/use-workspace';
import { appRoutes } from '@/lib/routes';
import { PromoteToRoadmapModal } from '@/components/roadmap/PromoteToRoadmapModal';
import { UnifiedTopIssue } from '@/lib/api-types';

// ─── Design tokens ────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const RECOMMENDATION_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  promote_to_planned:   { bg: '#e8f7f7', color: '#20A4A4', label: 'Promote to Planned' },
  promote_to_committed: { bg: '#fff3cd', color: '#b8860b', label: 'Promote to Committed' },
  already_committed:    { bg: '#e8f5e9', color: '#2e7d32', label: 'Already Committed' },
  monitor:              { bg: '#f0f4f8', color: '#6C757D', label: 'Monitor' },
};

const SIGNAL_COLORS: Record<string, { bg: string; color: string }> = {
  theme:    { bg: '#e8f7f7', color: '#20A4A4' },
  feedback: { bg: '#e8f0fe', color: '#1a73e8' },
  deal:     { bg: '#fff3cd', color: '#b8860b' },
  customer: { bg: '#fce8ff', color: '#7c3aed' },
  voice:    { bg: '#e8f5e9', color: '#2e7d32' },
  survey:   { bg: '#fff8e1', color: '#f57c00' },
  support:  { bg: '#fdecea', color: '#c62828' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function CiqScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 70 ? '#20A4A4' : pct >= 40 ? '#f57c00' : '#c62828';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ flex: 1, height: 6, background: '#e9ecef', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color, minWidth: 28, textAlign: 'right' }}>{Math.round(pct)}</span>
    </div>
  );
}

function SourceBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.2rem' }}>
        <span style={{ color: '#6C757D', fontWeight: 500 }}>{label}</span>
        <span style={{ color: '#0a2540', fontWeight: 600 }}>{count.toLocaleString()} <span style={{ color: '#6C757D', fontWeight: 400 }}>({pct}%)</span></span>
      </div>
      <div style={{ height: 6, background: '#e9ecef', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

function SentimentPill({ label, count, color }: { label: string; count: number; color: string }) {
  if (count === 0) return null;
  return (
    <span style={{ padding: '0.15rem 0.45rem', background: `${color}18`, color, borderRadius: '0.3rem', fontSize: '0.65rem', fontWeight: 600 }}>
      {label} {count}
    </span>
  );
}

function ActionButton({ label, onClick, variant = 'default' }: { label: string; onClick: () => void; variant?: 'default' | 'danger' | 'success' }) {
  const styles: Record<string, React.CSSProperties> = {
    default: { background: '#e8f7f7', color: '#20A4A4', border: '1px solid #20A4A4' },
    danger:  { background: '#fdecea', color: '#c62828', border: '1px solid #c62828' },
    success: { background: '#e8f5e9', color: '#2e7d32', border: '1px solid #2e7d32' },
  };
  return (
    <button
      onClick={onClick}
      style={{
        ...styles[variant],
        padding: '0.2rem 0.55rem',
        borderRadius: '0.35rem',
        cursor: 'pointer',
        fontSize: '0.68rem',
        fontWeight: 600,
        lineHeight: 1.4,
      }}
    >
      {label}
    </button>
  );
}

// ─── Assign Team Modal (lightweight inline) ───────────────────────────────────
function AssignTeamModal({ themeTitle, onClose }: { themeTitle: string; onClose: () => void }) {
  const [owner, setOwner] = useState('');
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,37,64,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ background: '#fff', borderRadius: '0.875rem', padding: '2rem', maxWidth: 420, width: '90%', boxShadow: '0 8px 32px rgba(10,37,64,0.18)' }}>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700, color: '#0a2540' }}>Assign Team</h3>
        <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#6C757D' }}>{themeTitle}</p>
        <input
          value={owner}
          onChange={e => setOwner(e.target.value)}
          placeholder="Enter team or owner name…"
          style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #dee2e6', borderRadius: '0.5rem', fontSize: '0.875rem', boxSizing: 'border-box', marginBottom: '1rem' }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.4rem 0.9rem', background: '#f0f4f8', color: '#0a2540', border: 'none', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
          <button onClick={onClose} style={{ padding: '0.4rem 0.9rem', background: '#0a2540', color: '#fff', border: 'none', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Assign</button>
        </div>
      </div>
    </div>
  );
}

// ─── Resolve Confirm Modal ────────────────────────────────────────────────────
function ResolveModal({ themeTitle, onClose }: { themeTitle: string; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,37,64,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ background: '#fff', borderRadius: '0.875rem', padding: '2rem', maxWidth: 400, width: '90%', boxShadow: '0 8px 32px rgba(10,37,64,0.18)' }}>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700, color: '#0a2540' }}>Mark Resolved</h3>
        <p style={{ margin: '0 0 1.5rem', fontSize: '0.85rem', color: '#6C757D' }}>
          Mark <strong>{themeTitle}</strong> as resolved? This will archive the theme and stop it from appearing in active rankings.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.4rem 0.9rem', background: '#f0f4f8', color: '#0a2540', border: 'none', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
          <button onClick={onClose} style={{ padding: '0.4rem 0.9rem', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Resolve</button>
        </div>
      </div>
    </div>
  );
}

// ─── Unified Issue Row ────────────────────────────────────────────────────────
function UnifiedIssueRow({
  issue,
  rank,
  routes,
  onPromote,
  onAssign,
  onResolve,
}: {
  issue: UnifiedTopIssue;
  rank: number;
  routes: ReturnType<typeof appRoutes>;
  onPromote: (id: string, title: string) => void;
  onAssign: (id: string, title: string) => void;
  onResolve: (id: string, title: string) => void;
}) {
  const { feedbackCount, supportCount, voiceCount, totalSignalCount } = issue;
  const ciq = issue.priorityScore ?? 0;

  return (
    <div style={{ padding: '1rem', background: '#f8f9fa', borderRadius: '0.625rem', borderLeft: `3px solid ${ciq >= 70 ? '#20A4A4' : ciq >= 40 ? '#f57c00' : '#dee2e6'}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        {/* Rank */}
        <span style={{ width: 24, fontSize: '0.8rem', fontWeight: 700, color: '#6C757D', paddingTop: '0.1rem', flexShrink: 0, textAlign: 'right' }}>
          {rank}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title + actions */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
            <Link href={routes.themeItem(issue.id)}
              style={{ fontWeight: 600, color: '#0a2540', textDecoration: 'none', fontSize: '0.875rem', flex: 1 }}>
              {issue.title}
            </Link>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', flexShrink: 0 }}>
              <ActionButton label="+ Roadmap" onClick={() => onPromote(issue.id, issue.title)} />
              <ActionButton label="Assign" onClick={() => onAssign(issue.id, issue.title)} variant="default" />
              <ActionButton label="Resolve" onClick={() => onResolve(issue.id, issue.title)} variant="success" />
            </div>
          </div>

          {/* Cross-source insight sentence */}
          {issue.crossSourceInsight && (
            <div style={{ fontSize: '0.78rem', color: '#1a73e8', fontStyle: 'italic', marginBottom: '0.4rem', padding: '0.3rem 0.5rem', background: '#e8f0fe', borderRadius: '0.3rem' }}>
              {issue.crossSourceInsight}
            </div>
          )}

          {/* Source breakdown bars */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {feedbackCount > 0 && (
              <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.4rem', background: '#e8f0fe', color: '#1a73e8', borderRadius: '0.3rem', fontWeight: 600 }}>
                📝 {feedbackCount} feedback
              </span>
            )}
            {supportCount > 0 && (
              <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.4rem', background: '#fdecea', color: '#c62828', borderRadius: '0.3rem', fontWeight: 600 }}>
                🎫 {supportCount} support
              </span>
            )}
            {voiceCount > 0 && (
              <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.4rem', background: '#e8f5e9', color: '#2e7d32', borderRadius: '0.3rem', fontWeight: 600 }}>
                🎙 {voiceCount} voice
              </span>
            )}
            <span style={{ fontSize: '0.72rem', color: '#6C757D', marginLeft: 'auto' }}>
              {totalSignalCount} total signals
            </span>
          </div>

          {/* Sentiment pills */}
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
            <SentimentPill label="✓" count={issue.sentimentDistribution.positive} color="#2e7d32" />
            <SentimentPill label="~" count={issue.sentimentDistribution.neutral} color="#6C757D" />
            <SentimentPill label="✗" count={issue.sentimentDistribution.negative} color="#c62828" />
          </div>

          {/* CIQ score bar */}
          {ciq > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.68rem', color: '#6C757D', flexShrink: 0 }}>CIQ</span>
              <CiqScoreBar score={ciq} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IntelligencePage() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const router = useRouter();
  const routes = appRoutes(orgSlug);
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';

  // Data
  const { data: signals, isLoading: signalsLoading } = useCiqStrategicSignals();
  const { data: themeRanking, isLoading: themesLoading } = useCiqThemeRanking(10);
  const { data: topIssues, isLoading: topIssuesLoading } = useTopIssues(15);
  const { data: sourceSummary, isLoading: summaryLoading } = useSourceSummary();
  const { mutate: triggerAggregate, isPending: aggregating } = useAggregateAll();

  const isLoading = signalsLoading || themesLoading || topIssuesLoading || summaryLoading;

  // Modal state
  const [promoteModal, setPromoteModal] = useState<{ themeId: string; themeTitle: string } | null>(null);
  const [assignModal, setAssignModal] = useState<{ themeId: string; themeTitle: string } | null>(null);
  const [resolveModal, setResolveModal] = useState<{ themeId: string; themeTitle: string } | null>(null);

  return (
    <div style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>
            Unified Intelligence Hub
          </h1>
          <p style={{ color: '#6C757D', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
            Cross-source signals from feedback, support tickets, and voice — unified into a single intelligence layer
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => triggerAggregate()}
            disabled={aggregating}
            style={{ padding: '0.5rem 1rem', background: aggregating ? '#dee2e6' : '#0a2540', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: aggregating ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
          >
            {aggregating ? 'Aggregating…' : '↻ Re-aggregate'}
          </button>
          <Link href={routes.ciq}
            style={{ padding: '0.5rem 1rem', background: '#f0f4f8', color: '#0a2540', borderRadius: '0.5rem', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}>
            CIQ Dashboard
          </Link>
          <Link href={routes.intelligenceThemes}
            style={{ padding: '0.5rem 1rem', background: '#f0f4f8', color: '#0a2540', borderRadius: '0.5rem', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}>
            Theme Ranking
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#6C757D' }}>Loading intelligence data…</div>
      ) : (
        <div style={{ display: 'grid', gap: '1.5rem' }}>

          {/* ── 1. Source Breakdown Summary ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {/* Total Signals */}
            <div style={{ ...CARD, borderLeft: '4px solid #0a2540' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Total Signals</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0a2540' }}>{(sourceSummary?.totalSignals ?? 0).toLocaleString()}</div>
              <div style={{ fontSize: '0.78rem', color: '#6C757D', marginTop: '0.25rem' }}>{sourceSummary?.themeCount ?? 0} themes · {sourceSummary?.scoredThemeCount ?? 0} scored</div>
            </div>
            {/* Feedback */}
            <div style={{ ...CARD, borderLeft: '4px solid #1a73e8' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Feedback</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0a2540' }}>{(sourceSummary?.feedbackCount ?? 0).toLocaleString()}</div>
              <div style={{ fontSize: '0.78rem', color: '#6C757D', marginTop: '0.25rem' }}>{sourceSummary?.feedbackPct ?? 0}% of all signals</div>
              {sourceSummary?.topThemeByFeedback && <div style={{ fontSize: '0.72rem', color: '#1a73e8', marginTop: '0.2rem' }}>Top: {sourceSummary.topThemeByFeedback}</div>}
            </div>
            {/* Support */}
            <div style={{ ...CARD, borderLeft: '4px solid #c62828' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Support Tickets</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0a2540' }}>{(sourceSummary?.supportCount ?? 0).toLocaleString()}</div>
              <div style={{ fontSize: '0.78rem', color: '#6C757D', marginTop: '0.25rem' }}>{sourceSummary?.supportPct ?? 0}% of all signals</div>
              {sourceSummary?.topThemeBySupport && <div style={{ fontSize: '0.72rem', color: '#c62828', marginTop: '0.2rem' }}>Top: {sourceSummary.topThemeBySupport}</div>}
            </div>
            {/* Voice */}
            <div style={{ ...CARD, borderLeft: '4px solid #2e7d32' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Voice Transcripts</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0a2540' }}>{(sourceSummary?.voiceCount ?? 0).toLocaleString()}</div>
              <div style={{ fontSize: '0.78rem', color: '#6C757D', marginTop: '0.25rem' }}>{sourceSummary?.voicePct ?? 0}% of all signals</div>
              {sourceSummary?.topThemeByVoice && <div style={{ fontSize: '0.72rem', color: '#2e7d32', marginTop: '0.2rem' }}>Top: {sourceSummary.topThemeByVoice}</div>}
            </div>
            {/* Source Mix Chart (visual bar) */}
            {sourceSummary && (
              <div style={{ ...CARD, gridColumn: 'span 1' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Source Mix</div>
                <SourceBar label="Feedback" count={sourceSummary.feedbackCount} total={sourceSummary.totalSignals} color="#1a73e8" />
                <SourceBar label="Support" count={sourceSummary.supportCount} total={sourceSummary.totalSignals} color="#c62828" />
                <SourceBar label="Voice" count={sourceSummary.voiceCount} total={sourceSummary.totalSignals} color="#2e7d32" />
              </div>
            )}
          </div>

          {/* ── 2. Top Issues Across ALL Sources ── */}
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>Top Issues — All Sources</h2>
                <p style={{ fontSize: '0.78rem', color: '#6C757D', margin: '0.2rem 0 0' }}>
                  Ranked by combined signal volume (feedback + support + voice). AI insights shown in blue.
                </p>
              </div>
              <Link href={routes.intelligenceThemes}
                style={{ fontSize: '0.8rem', color: '#20A4A4', textDecoration: 'none', fontWeight: 500 }}>
                View full ranking →
              </Link>
            </div>

            {topIssues && topIssues.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {topIssues.map((issue, i) => (
                  <UnifiedIssueRow
                    key={issue.id}
                    issue={issue}
                    rank={i + 1}
                    routes={routes}
                    onPromote={(id, title) => setPromoteModal({ themeId: id, themeTitle: title })}
                    onAssign={(id, title) => setAssignModal({ themeId: id, themeTitle: title })}
                    onResolve={(id, title) => setResolveModal({ themeId: id, themeTitle: title })}
                  />
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: '#6C757D', fontSize: '0.875rem' }}>
                No cross-source data yet. Click <strong>↻ Re-aggregate</strong> to compute unified theme counts.
              </div>
            )}
          </div>

          {/* ── 3. CIQ Signals + Roadmap Recommendations ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

            {/* Roadmap Recommendations */}
            <div style={CARD}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: '0 0 1rem' }}>
                Roadmap Recommendations
              </h2>
              {signals?.roadmapRecommendations && signals.roadmapRecommendations.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {signals.roadmapRecommendations.slice(0, 8).map((rec) => {
                    const style = RECOMMENDATION_COLORS[rec.recommendation] ?? RECOMMENDATION_COLORS.monitor;
                    const canPromote = rec.recommendation === 'promote_to_planned' || rec.recommendation === 'promote_to_committed';
                    return (
                      <div key={rec.themeId} style={{ padding: '0.875rem', background: '#f8f9fa', borderRadius: '0.5rem', borderLeft: `3px solid ${style.color}` }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.375rem' }}>
                          <Link href={routes.themeItem(rec.themeId)}
                            style={{ fontWeight: 600, color: '#0a2540', textDecoration: 'none', fontSize: '0.875rem', flex: 1 }}>
                            {rec.title}
                          </Link>
                          <span style={{ padding: '0.2rem 0.5rem', background: style.bg, color: style.color, borderRadius: '0.375rem', fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {style.label}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6C757D', marginBottom: '0.375rem' }}>{rec.rationale}</div>
                        <CiqScoreBar score={rec.ciqScore} />
                        {canPromote && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <ActionButton
                              label="+ Promote to Roadmap"
                              onClick={() => setPromoteModal({ themeId: rec.themeId, themeTitle: rec.title })}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#6C757D', fontSize: '0.875rem' }}>
                  No recommendations yet. CIQ scoring will generate recommendations as signals accumulate.
                </div>
              )}
            </div>

            {/* Top Themes by CIQ */}
            <div style={CARD}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>
                  Top Themes by CIQ
                </h2>
                <Link href={routes.intelligenceThemes}
                  style={{ fontSize: '0.8rem', color: '#20A4A4', textDecoration: 'none', fontWeight: 500 }}>
                  View all →
                </Link>
              </div>
              {themeRanking && themeRanking.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {themeRanking.slice(0, 8).map((theme, i) => (
                    <div key={theme.themeId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ width: 20, fontSize: '0.75rem', fontWeight: 700, color: '#6C757D', textAlign: 'right', flexShrink: 0 }}>
                        {i + 1}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem', gap: '0.5rem' }}>
                          <Link href={routes.themeItem(theme.themeId)}
                            style={{ fontWeight: 600, color: '#0a2540', textDecoration: 'none', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {theme.title}
                          </Link>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                            <span style={{ fontSize: '0.72rem', color: '#6C757D' }}>{theme.feedbackCount} signals</span>
                            <ActionButton
                              label="+ Roadmap"
                              onClick={() => setPromoteModal({ themeId: theme.themeId, themeTitle: theme.title })}
                            />
                          </div>
                        </div>
                        <CiqScoreBar score={theme.ciqScore} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#6C757D', fontSize: '0.875rem' }}>
                  No theme ranking data yet.
                </div>
              )}
            </div>
          </div>

          {/* ── 4. Strategic Signal Feed ── */}
          {signals?.signals && signals.signals.length > 0 && (
            <div style={CARD}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: '0 0 1rem' }}>
                Strategic Signal Feed
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                {signals.signals.slice(0, 12).map((sig, i) => {
                  const sc = SIGNAL_COLORS[sig.type] ?? { bg: '#f0f4f8', color: '#6C757D' };
                  return (
                    <div key={i} style={{ padding: '0.875rem', background: '#f8f9fa', borderRadius: '0.5rem', borderLeft: `3px solid ${sc.color}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                        <span style={{ padding: '0.15rem 0.4rem', background: sc.bg, color: sc.color, borderRadius: '0.25rem', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>
                          {sig.type}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0a2540', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sig.entityTitle}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#6C757D', flexShrink: 0 }}>
                          {(sig.strength * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0a2540', marginBottom: '0.2rem' }}>{sig.signal}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6C757D' }}>{sig.detail}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Modals ── */}
      {promoteModal && workspaceId && (
        <PromoteToRoadmapModal
          workspaceId={workspaceId}
          themeId={promoteModal.themeId}
          themeTitle={promoteModal.themeTitle}
          isOpen={true}
          onClose={() => setPromoteModal(null)}
          onSuccess={(roadmapItemId) => {
            setPromoteModal(null);
            router.push(routes.roadmapItem(roadmapItemId));
          }}
        />
      )}
      {assignModal && (
        <AssignTeamModal themeTitle={assignModal.themeTitle} onClose={() => setAssignModal(null)} />
      )}
      {resolveModal && (
        <ResolveModal themeTitle={resolveModal.themeTitle} onClose={() => setResolveModal(null)} />
      )}
    </div>
  );
}
