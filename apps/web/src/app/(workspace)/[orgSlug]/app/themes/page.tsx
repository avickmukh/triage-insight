'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useThemeList, useCreateTheme, useTriggerRecluster } from '@/hooks/use-themes';
import { useCurrentMemberRole } from '@/hooks/use-workspace';
import { useRecalculateAllThemes } from '@/hooks/use-ciq';
import { Theme, ThemeStatus, WorkspaceRole } from '@/lib/api-types';
import { CiqImpactBadge } from '@/components/ciq/CiqImpactBadge';
import { appRoutes } from '@/lib/routes';
import { PageHeader } from '@/components/shared/ui/page-header';

// ─── Design tokens (matching TriageInsight shell) ─────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const STATUS_COLORS: Record<ThemeStatus, { bg: string; color: string }> = {
  [ThemeStatus.AI_GENERATED]: { bg: '#e8f7f7', color: '#20A4A4' },
  [ThemeStatus.VERIFIED]:     { bg: '#e8f5e9', color: '#2e7d32' },
  [ThemeStatus.RESURFACED]:   { bg: '#fff3e0', color: '#e65100' },
  [ThemeStatus.REOPENED]:     { bg: '#f3e8ff', color: '#6d28d9' },
  [ThemeStatus.ARCHIVED]:     { bg: '#f0f4f8', color: '#6C757D' },
};

const STATUS_LABELS: Record<ThemeStatus, string> = {
  [ThemeStatus.AI_GENERATED]: 'AI Generated',
  [ThemeStatus.VERIFIED]:     'Verified',
  [ThemeStatus.RESURFACED]:   'Resurfaced',
  [ThemeStatus.REOPENED]:     'Reopened',
  [ThemeStatus.ARCHIVED]:     'Archived',
};

const TABS: { label: string; value: string | undefined }[] = [
  { label: 'All',          value: undefined },
  { label: 'AI Generated', value: ThemeStatus.AI_GENERATED },
  { label: 'Verified',     value: ThemeStatus.VERIFIED },
  { label: 'Resurfaced',   value: ThemeStatus.RESURFACED },
  { label: 'Reopened',     value: ThemeStatus.REOPENED },
  { label: 'Archived',     value: ThemeStatus.ARCHIVED },
];

// ─── Skeleton shimmer ─────────────────────────────────────────────────────────
function Skeleton({ style }: { style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'linear-gradient(90deg, #f0f4f8 25%, #e4eaf0 50%, #f0f4f8 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s infinite',
        borderRadius: '0.5rem',
        ...style,
      }}
    />
  );
}

// ─── Priority score bar ───────────────────────────────────────────────────────
// priorityScore is stored as a 0–100 float by the CIQ scoring engine.
// IMPORTANT: Do NOT multiply by 100 — the value is already on a 0–100 scale.
// Color thresholds are aligned with CiqImpactBadge: ≥80 Critical, ≥55 High, ≥30 Medium, <30 Low.
function PriorityBar({ score }: { score: number | null | undefined }) {
  if (score == null) return <span style={{ color: '#adb5bd', fontSize: '0.8rem' }}>—</span>;
  const pct = Math.min(100, Math.round(score));
  const color = pct >= 80 ? '#e63946' : pct >= 55 ? '#f4a261' : pct >= 30 ? '#f59e0b' : '#20A4A4';
  const bandLabel = pct >= 80 ? 'Critical' : pct >= 55 ? 'High' : pct >= 30 ? 'Medium' : 'Low';
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
      title={`CIQ Priority Score: ${pct}/100 (${bandLabel}) — composite of signal volume, ARR exposure, deal pipeline, voice urgency, and support pressure. Connect your CRM to unlock full scoring potential.`}
    >
      <div style={{ flex: 1, height: '6px', background: '#e9ecef', borderRadius: '3px', minWidth: '60px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '0.75rem', color, fontWeight: 600, minWidth: '2.5rem', cursor: 'help' }}>{pct}</span>
    </div>
  );
}

// ─── Create Theme Modal ───────────────────────────────────────────────────────
function CreateThemeModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const { mutate: createTheme, isPending, isError, error } = useCreateTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createTheme(
      { title: title.trim(), description: description.trim() || undefined },
      { onSuccess: onClose }
    );
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(10,37,64,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ ...CARD, width: '100%', maxWidth: '28rem', padding: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0a2540', marginBottom: '1.25rem' }}>
          New Theme
        </h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#495057', display: 'block', marginBottom: '0.375rem' }}>
              Title <span style={{ color: '#e63946' }}>*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Onboarding friction"
              maxLength={255}
              required
              style={{
                width: '100%', padding: '0.625rem 0.875rem',
                border: '1px solid #ced4da', borderRadius: '0.5rem',
                fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#495057', display: 'block', marginBottom: '0.375rem' }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional summary of this theme…"
              rows={3}
              maxLength={2000}
              style={{
                width: '100%', padding: '0.625rem 0.875rem',
                border: '1px solid #ced4da', borderRadius: '0.5rem',
                fontSize: '0.9rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
              }}
            />
          </div>
          {isError && (
            <p style={{ color: '#e63946', fontSize: '0.8rem', margin: 0 }}>
              {(error as Error)?.message || 'Failed to create theme.'}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
                border: '1px solid #ced4da', background: '#fff',
                fontSize: '0.875rem', cursor: 'pointer', color: '#495057',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !title.trim()}
              style={{
                padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
                border: 'none', background: isPending || !title.trim() ? '#adb5bd' : '#0a2540',
                color: '#fff', fontSize: '0.875rem', cursor: isPending || !title.trim() ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              {isPending ? 'Creating…' : 'Create Theme'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── AI Confidence Badge ─────────────────────────────────────────────────────
/**
 * ConfidenceBadge
 *
 * Shows the AI CONFIDENCE level for this theme's narration.
 * Confidence = how certain the AI is about its summary, explanation, and
 * recommendation — based on signal volume, cluster cohesion, and consistency
 * of the underlying feedback. It is NOT the same as Decision Priority.
 *
 * High confidence (≥75%) means the AI had rich, consistent evidence.
 * Medium confidence (45–74%) means moderate evidence; review AI insights carefully.
 * Low confidence (<45%) means limited or noisy evidence; treat AI insights as provisional.
 */
function ConfidenceBadge({ confidence }: { confidence?: number | null }) {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  const style =
    confidence >= 0.75
      ? {
          bg: '#e8f5e9', color: '#2e7d32', label: 'Confidence: High',
          tooltip: `AI Confidence: High (${pct}%) — The AI had rich, consistent evidence to generate reliable insights for this theme. Summaries and recommendations can be trusted.`,
        }
      : confidence >= 0.45
      ? {
          bg: '#fff8e1', color: '#b8860b', label: 'Confidence: Medium',
          tooltip: `AI Confidence: Medium (${pct}%) — Moderate evidence available. The AI’s insights are reasonable but review them alongside the raw feedback before acting.`,
        }
      : {
          bg: '#f0f4f8', color: '#6C757D', label: 'Confidence: Low',
          tooltip: `AI Confidence: Low (${pct}%) — Limited or inconsistent evidence. AI insights for this theme are provisional. Gather more feedback signals before relying on them.`,
        };
  return (
    <span
      title={style.tooltip}
      style={{
        fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em',
        padding: '0.15rem 0.5rem', borderRadius: '999px',
        background: style.bg, color: style.color, cursor: 'help',
      }}
    >
      ✨ {style.label}
    </span>
  );
}

// ─── Theme Card ───────────────────────────────────────────────────────────────
function ThemeCard({ theme, href }: { theme: Theme; href: string }) {
  const statusStyle = STATUS_COLORS[theme.status] ?? { bg: '#f0f4f8', color: '#6C757D' };
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        style={{
          ...CARD,
          padding: '1.25rem 1.5rem',
          transition: 'box-shadow 0.15s, transform 0.15s',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(10,37,64,0.12)';
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(10,37,64,0.06)';
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {theme.pinned && (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f4a261', letterSpacing: '0.04em' }}>
                  📌 PINNED
                </span>
              )}
              <span
                style={{
                  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em',
                  padding: '0.2rem 0.6rem', borderRadius: '999px',
                  background: statusStyle.bg, color: statusStyle.color,
                }}
              >
                {STATUS_LABELS[theme.status]}
              </span>
              <CiqImpactBadge score={theme.priorityScore} showScore size="xs" />
            </div>
            <h3
              style={{
                fontSize: '1rem', fontWeight: 700, color: '#0a2540',
                margin: '0.375rem 0 0', lineHeight: 1.3,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {theme.title}
            </h3>
          </div>
          <ConfidenceBadge confidence={theme.aiConfidence} />
        </div>

        {/* Cluster confidence + outlier row */}
        {(theme.clusterConfidence != null || (theme.outlierCount != null && theme.outlierCount > 0)) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            {theme.clusterConfidence != null && (
              <span
                title={`Evidence Quality: ${Math.round(theme.clusterConfidence)}% — measures how cohesive the feedback cluster is (semantic similarity, cluster size, and variance). High ≥70%: feedback items are tightly related. Medium 40–69%: moderate cohesion. Low <40%: mixed signals, some items may not belong.`}
                style={{
                  fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em',
                  padding: '0.15rem 0.5rem', borderRadius: '999px', cursor: 'help',
                  background: theme.clusterConfidence >= 70 ? '#e8f5e9' : theme.clusterConfidence >= 40 ? '#fff8e1' : '#fdecea',
                  color: theme.clusterConfidence >= 70 ? '#2e7d32' : theme.clusterConfidence >= 40 ? '#b8860b' : '#c62828',
                }}
              >
                🔍 Evidence Quality: {Math.round(theme.clusterConfidence)}%
              </span>
            )}
            {theme.outlierCount != null && theme.outlierCount > 0 && (
              <span
                title={`${theme.outlierCount} item${theme.outlierCount !== 1 ? 's' : ''} may not belong here — similarity below threshold`}
                style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', background: '#fff7ed', color: '#9a3412', cursor: 'help' }}
              >
                ⚠ {theme.outlierCount} outlier{theme.outlierCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* Continuous Intelligence badges: Resurfacing + Recent Spike */}
        {((theme as any).resurfaceCount > 0 || ((theme as any).trendDelta != null && (theme as any).trendDelta >= 30)) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
            {(theme as any).resurfaceCount > 0 && (
              <span
                title={`This theme was shipped but received fresh signals ${(theme as any).resurfaceCount} time${(theme as any).resurfaceCount !== 1 ? 's' : ''}. The problem may not be fully resolved.`}
                style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', background: '#fff3e0', color: '#e65100', cursor: 'help', border: '1px solid #ffcc80' }}
              >
                🔄 Resurfacing ×{(theme as any).resurfaceCount}
              </span>
            )}
            {(theme as any).trendDelta != null && (theme as any).trendDelta >= 30 && (
              <span
                title={`Signal velocity: +${Number((theme as any).trendDelta).toFixed(0)}% week-over-week — rapid signal growth detected`}
                style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', background: '#e8f5e9', color: '#1b5e20', cursor: 'help', border: '1px solid #a5d6a7' }}
              >
                ⚡ Recent Spike +{Number((theme as any).trendDelta).toFixed(0)}%
              </span>
            )}
          </div>
        )}
        {/* Trend + auto-merge row */}
        {(theme.trendDirection || theme.autoMergeCandidate || theme.shortLabel) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            {theme.trendDirection && (
              <span
                title={`Signal trend: ${theme.trendDelta != null ? (theme.trendDelta >= 0 ? '+' : '') + theme.trendDelta.toFixed(0) + '% vs last week' : 'no data'}`}
                style={{
                  fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', cursor: 'help',
                  background: theme.trendDirection === 'UP' ? '#e8f5e9' : theme.trendDirection === 'DOWN' ? '#fdecea' : '#f0f4f8',
                  color: theme.trendDirection === 'UP' ? '#2e7d32' : theme.trendDirection === 'DOWN' ? '#c62828' : '#6C757D',
                }}
              >
                {theme.trendDirection === 'UP' ? '↑' : theme.trendDirection === 'DOWN' ? '↓' : '→'}
                {' '}{theme.trendDirection}
                {theme.trendDelta != null && ` ${Math.abs(theme.trendDelta).toFixed(0)}%`}
              </span>
            )}
            {theme.autoMergeCandidate && (
              <span
                title="This theme may be a duplicate — review auto-merge suggestions"
                style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', background: '#fff3cd', color: '#b8860b', cursor: 'help' }}
              >
                ⚠️ Merge candidate
              </span>
            )}
            {theme.shortLabel && theme.shortLabel !== theme.title && (
              <span style={{ fontSize: '0.65rem', color: '#6C757D', fontStyle: 'italic' }}>
                “{theme.shortLabel}”
              </span>
            )}
          </div>
        )}

        {/* Impact sentence */}
        {theme.impactSentence && (
          <p style={{ fontSize: '0.78rem', color: '#20A4A4', margin: '0 0 0.5rem', fontStyle: 'italic', borderLeft: '2px solid #20A4A4', paddingLeft: '0.5rem' }}>
            {theme.impactSentence}
          </p>
        )}

        {/* AI Summary (preferred) or manual description */}
        {(theme.aiSummary || theme.description) && (
          <p
            style={{
              fontSize: '0.85rem', color: '#6C757D', margin: '0 0 0.875rem',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {theme.aiSummary || theme.description}
          </p>
        )}

        {/* Why it matters — shown only if available */}
        {theme.aiExplanation && (
          <p
            style={{
              fontSize: '0.78rem', color: '#7c5cbf',
              margin: '0 0 0.875rem',
              display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              fontStyle: 'italic',
            }}
          >
            💡 {theme.aiExplanation}
          </p>
        )}

        {/* Stats row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div title="Direct Signals: count of feedback items, voice recordings, support tickets, and survey responses directly linked to this theme. This may differ from the total Linked Feedback count shown on the detail page, which includes broader related evidence.">
            <span style={{ fontSize: '0.75rem', color: '#adb5bd', display: 'block', cursor: 'help' }}>Direct Signals</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0a2540', cursor: 'help' }}>
              {theme.totalSignalCount ?? theme._count?.feedbacks ?? theme.feedbackCount ?? 0}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: '8rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#adb5bd', display: 'block', marginBottom: '0.25rem' }}>CIQ Score</span>
            <PriorityBar score={theme.priorityScore ?? theme.aggregatedPriorityScore} />
          </div>
          {theme.revenueInfluence != null && theme.revenueInfluence > 0 && (
            <div>
              <span style={{ fontSize: '0.75rem', color: '#adb5bd', display: 'block' }}>Revenue</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#2e7d32' }}>
                ${(theme.revenueInfluence / 1000).toFixed(0)}K
              </span>
            </div>
          )}
          {(theme as any).lastEvidenceAt && (
            <div>
              <span style={{ fontSize: '0.75rem', color: '#adb5bd', display: 'block' }}>Last Activity</span>
              <span style={{ fontSize: '0.8rem', color: '#495057' }} title={`Most recent signal: ${new Date((theme as any).lastEvidenceAt).toLocaleString()}`}>
                {new Date((theme as any).lastEvidenceAt).toLocaleDateString()}
              </span>
            </div>
          )}
          {!(theme as any).lastEvidenceAt && (
            <div>
              <span style={{ fontSize: '0.75rem', color: '#adb5bd', display: 'block' }}>Updated</span>
              <span style={{ fontSize: '0.8rem', color: '#495057' }}>
                {new Date(theme.updatedAt).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ThemesPage() {
  const params = useParams();
  const slug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';
  const r = appRoutes(slug);

  const [activeStatus, setActiveStatus] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'priority' | 'feedback'>('default');
  const [showCreate, setShowCreate] = useState(false);
  const [rescoreAllMsg, setRescoreAllMsg] = useState<string | null>(null);

  const { role } = useCurrentMemberRole();
  const canEdit = role === WorkspaceRole.ADMIN || role === WorkspaceRole.EDITOR;

  const { mutate: triggerRecluster, isPending: isReclustering } = useTriggerRecluster();
  const { mutate: recalculateAll, isPending: isRecalculating } = useRecalculateAllThemes();
  const [reclusterMsg, setReclusterMsg] = useState<string | null>(null);

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useThemeList({
      status: activeStatus,
      search: search.trim() || undefined,
    });

  const allThemes: Theme[] = data?.pages?.flatMap((p) => p.data) ?? [];
  const totalCount = data?.pages?.[0]?.total ?? 0;

  // Client-side sort on top of server-paginated data
  const sortedThemes = [...allThemes].sort((a, b) => {
    if (sortBy === 'priority') {
      const aScore = a.priorityScore ?? -1;
      const bScore = b.priorityScore ?? -1;
      return bScore - aScore;
    }
    if (sortBy === 'feedback') {
      // Use totalSignalCount as canonical cross-source signal count
      const aCount = a.totalSignalCount ?? a._count?.feedbacks ?? a.feedbackCount ?? 0;
      const bCount = b.totalSignalCount ?? b._count?.feedbacks ?? b.feedbackCount ?? 0;
      return bCount - aCount;
    }
    return 0; // default: server order
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── Header ── */}
      <PageHeader
        stage="themes"
        title="All Themes"
        description="AI-clustered problems automatically grouped from feedback, voice, support, and survey signals. This is where raw signals become named, trackable issues."
        nextAction="Click a theme to see its evidence and CIQ score. Use CIQ Scoring in Prioritization to rank by business impact."
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        {canEdit && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                triggerRecluster(undefined, {
                  onSuccess: (res) => setReclusterMsg(res.message),
                });
              }}
              disabled={isReclustering}
              style={{
                padding: '0.5rem 1rem', borderRadius: '0.5rem',
                border: '1px solid #ced4da', background: '#fff',
                fontSize: '0.875rem', cursor: isReclustering ? 'not-allowed' : 'pointer',
                color: '#495057', fontWeight: 500,
              }}
            >
              {isReclustering ? 'Reclustering…' : '⟳ Recluster'}
            </button>
            <button
              onClick={() => {
                recalculateAll(undefined, {
                  onSuccess: (res) => {
                    setRescoreAllMsg(`✓ ${res.message} (${res.enqueued} jobs enqueued)`);
                    setTimeout(() => setRescoreAllMsg(null), 8000);
                  },
                });
              }}
              disabled={isRecalculating}
              style={{
                padding: '0.5rem 1rem', borderRadius: '0.5rem',
                border: '1px solid #b3d4f5', background: '#f0f7ff',
                fontSize: '0.875rem', cursor: isRecalculating ? 'not-allowed' : 'pointer',
                color: '#1a6fc4', fontWeight: 500,
              }}
            >
              {isRecalculating ? 'Scoring…' : '↻ Rescore All'}
            </button>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
                border: 'none', background: '#0a2540',
                color: '#fff', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 600,
              }}
            >
              + New Theme
            </button>
          </div>
        )}
      </div>

      {/* ── Rescore All banner ── */}
      {rescoreAllMsg && (
        <div
          style={{
            background: '#e8f4fd', border: '1px solid #b3d4f5', borderRadius: '0.625rem',
            padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#1a6fc4',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <span>{rescoreAllMsg}</span>
          <button
            onClick={() => setRescoreAllMsg(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1a6fc4', fontSize: '1rem' }}
          >
            ×
          </button>
        </div>
      )}

      {/* ── Recluster success banner ── */}
      {reclusterMsg && (
        <div
          style={{
            background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '0.625rem',
            padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#2e7d32',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <span>✓ {reclusterMsg}</span>
          <button
            onClick={() => setReclusterMsg(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2e7d32', fontSize: '1rem' }}
          >
            ×
          </button>
        </div>
      )}

      {/* ── Search + Tabs ── */}
      <div style={{ ...CARD, padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search themes…"
          style={{
            flex: 1, minWidth: '12rem', padding: '0.5rem 0.875rem',
            border: '1px solid #ced4da', borderRadius: '0.5rem',
            fontSize: '0.875rem', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          {TABS.map((tab) => (
            <button
              key={tab.label}
              onClick={() => setActiveStatus(tab.value)}
              style={{
                padding: '0.375rem 0.875rem', borderRadius: '999px',
                border: activeStatus === tab.value ? '1.5px solid #0a2540' : '1px solid #e9ecef',
                background: activeStatus === tab.value ? '#0a2540' : '#fff',
                color: activeStatus === tab.value ? '#fff' : '#495057',
                fontSize: '0.8rem', fontWeight: activeStatus === tab.value ? 700 : 400,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* Sort selector */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'default' | 'priority' | 'feedback')}
          style={{
            padding: '0.375rem 0.625rem', borderRadius: '0.5rem',
            border: '1px solid #ced4da', background: '#fff',
            fontSize: '0.8rem', color: '#495057', cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="default">Sort: Default</option>
          <option value="priority">Sort: Priority Score ↓</option>
          <option value="feedback">Sort: Feedback Count ↓</option>
        </select>
        {!isLoading && (
          <span style={{ fontSize: '0.8rem', color: '#adb5bd', whiteSpace: 'nowrap' }}>
            {totalCount} theme{totalCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Loading ── */}
      {isLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(20rem, 1fr))', gap: '1rem' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ ...CARD, padding: '1.25rem 1.5rem' }}>
              <Skeleton style={{ height: '1rem', width: '40%', marginBottom: '0.75rem' }} />
              <Skeleton style={{ height: '1.25rem', width: '70%', marginBottom: '0.5rem' }} />
              <Skeleton style={{ height: '0.875rem', width: '90%', marginBottom: '0.25rem' }} />
              <Skeleton style={{ height: '0.875rem', width: '60%', marginBottom: '1rem' }} />
              <div style={{ display: 'flex', gap: '1rem' }}>
                <Skeleton style={{ height: '2rem', width: '4rem' }} />
                <Skeleton style={{ height: '2rem', flex: 1 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Error ── */}
      {isError && !isLoading && (
        <div
          style={{
            ...CARD,
            background: '#fff5f5', border: '1px solid #f5c6cb',
            padding: '1.5rem', textAlign: 'center',
          }}
        >
          <p style={{ color: '#e63946', fontWeight: 600, margin: '0 0 0.5rem' }}>
            Failed to load themes
          </p>
          <p style={{ color: '#6C757D', fontSize: '0.875rem', margin: 0 }}>
            {(error as Error)?.message || 'An unexpected error occurred.'}
          </p>
        </div>
      )}

      {/* ── Empty ── */}
      {!isLoading && !isError && allThemes.length === 0 && (
        <div style={{ ...CARD, padding: '2.5rem 2rem' }}>
          {search || activeStatus ? (
            /* Filter empty state */
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔍</div>
              <p style={{ fontWeight: 700, color: '#0a2540', fontSize: '1.05rem', margin: '0 0 0.4rem' }}>No themes match your filters</p>
              <p style={{ color: '#6C757D', fontSize: '0.875rem', margin: 0 }}>Try adjusting your search or clearing the status filter.</p>
            </div>
          ) : (
            /* First-time empty state */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🧩</div>
                <p style={{ fontWeight: 700, color: '#0a2540', fontSize: '1.1rem', margin: '0 0 0.4rem' }}>No themes yet</p>
                <p style={{ color: '#6C757D', fontSize: '0.875rem', maxWidth: '480px', margin: '0 auto', lineHeight: 1.6 }}>
                  Themes are created automatically when the AI clusters your feedback. You can also create them manually.
                </p>
              </div>
              {/* How themes activate */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                {[
                  { icon: '💬', title: 'Add feedback', desc: 'Paste, import CSV, or connect Slack to start collecting signals.' },
                  { icon: '🤖', title: 'AI clusters it', desc: 'Semantic similarity groups related feedback into themes automatically.' },
                  { icon: '📊', title: 'CIQ scores it', desc: 'Each theme is ranked by frequency, ARR, voice, survey, and support signals.' },
                ].map((step) => (
                  <div key={step.title} style={{ background: '#f8fafc', borderRadius: '0.6rem', padding: '0.875rem', border: '1px solid #e9ecef' }}>
                    <div style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>{step.icon}</div>
                    <p style={{ fontWeight: 700, color: '#0a2540', fontSize: '0.85rem', margin: '0 0 0.25rem' }}>{step.title}</p>
                    <p style={{ color: '#6C757D', fontSize: '0.78rem', margin: 0, lineHeight: 1.5 }}>{step.desc}</p>
                  </div>
                ))}
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setShowCreate(true)}
                    style={{
                      padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
                      border: 'none', background: '#0a2540',
                      color: '#fff', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 600,
                    }}
                  >
                    + Create theme manually
                  </button>
                  <button
                    onClick={() => triggerRecluster()}
                    disabled={isReclustering}
                    style={{
                      padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
                      border: '1px solid #20A4A4', background: '#fff',
                      color: '#20A4A4', fontSize: '0.875rem', cursor: isReclustering ? 'not-allowed' : 'pointer',
                      fontWeight: 600, opacity: isReclustering ? 0.7 : 1,
                    }}
                  >
                    {isReclustering ? 'Clustering…' : '🤖 Run AI clustering'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Theme Grid ── */}
      {!isLoading && !isError && sortedThemes.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(20rem, 1fr))', gap: '1rem' }}>
          {sortedThemes.map((theme) => (
            <ThemeCard key={theme.id} theme={theme} href={r.themeItem(theme.id)} />
          ))}
        </div>
      )}

      {/* ── Load More ── */}
      {hasNextPage && (
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            style={{
              padding: '0.625rem 2rem', borderRadius: '0.5rem',
              border: '1px solid #ced4da', background: '#fff',
              fontSize: '0.875rem', cursor: isFetchingNextPage ? 'not-allowed' : 'pointer',
              color: '#495057',
            }}
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      {/* ── Create Modal ── */}
      {showCreate && <CreateThemeModal onClose={() => setShowCreate(false)} />}

      {/* Shimmer keyframe */}
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}
