'use client';

/**
 * Workspace Dashboard — /:orgSlug/app
 *
 * The primary dashboard accessible to all workspace roles (ADMIN, EDITOR, VIEWER).
 *
 * Metrics sourced from real backend data only:
 *   - Total Feedback  : useFeedbackCount()          → GET /workspaces/:id/feedback?limit=1
 *   - New Feedback    : useFeedbackCount(NEW)        → GET /workspaces/:id/feedback?status=NEW&limit=1
 *   - Open Themes     : useThemeCount(ACTIVE)        → GET /workspaces/:id/themes?status=ACTIVE&limit=1
 *   - Shipped Items   : useRoadmapBoard()            → GET /workspaces/:id/roadmap  (board[SHIPPED].length)
 *   - Recent Feedback : useRecentFeedback(5)         → GET /workspaces/:id/feedback?limit=5
 *
 * No fabricated analytics. Revenue-at-risk and trend charts are deferred until
 * the backend exposes a dedicated stats/analytics endpoint.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useFeedbackCount, useRecentFeedback } from '@/hooks/use-feedback';
import { useThemeCount } from '@/hooks/use-themes';
import { useRoadmapBoard } from '@/hooks/use-roadmap';
import { useWorkspace } from '@/hooks/use-workspace';
import { FeedbackStatus, FeedbackSourceType, RoadmapStatus, ThemeStatus } from '@/lib/api-types';
import { appRoutes } from '@/lib/routes';

// ─── Design tokens (matching TriageInsight shell) ─────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

// ─── Status badge colours (shared with Inbox page) ────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  [FeedbackStatus.NEW]:       { bg: '#e8f7f7', color: '#20A4A4' },
  [FeedbackStatus.IN_REVIEW]: { bg: '#fff8e1', color: '#b8860b' },
  [FeedbackStatus.PROCESSED]: { bg: '#e8f5e9', color: '#2e7d32' },
  [FeedbackStatus.ARCHIVED]:  { bg: '#f0f4f8', color: '#6C757D' },
  [FeedbackStatus.MERGED]:    { bg: '#fce8ff', color: '#7c3aed' },
};

const STATUS_LABELS: Record<string, string> = {
  [FeedbackStatus.NEW]:       'New',
  [FeedbackStatus.IN_REVIEW]: 'In Review',
  [FeedbackStatus.PROCESSED]: 'Processed',
  [FeedbackStatus.ARCHIVED]:  'Archived',
  [FeedbackStatus.MERGED]:    'Merged',
};

const SOURCE_LABELS: Record<string, string> = {
  [FeedbackSourceType.MANUAL]:        'Manual',
  [FeedbackSourceType.PUBLIC_PORTAL]: 'Portal',
  [FeedbackSourceType.EMAIL]:         'Email',
  [FeedbackSourceType.SLACK]:         'Slack',
  [FeedbackSourceType.CSV_IMPORT]:    'CSV',
  [FeedbackSourceType.VOICE]:         'Voice',
  [FeedbackSourceType.API]:           'API',
};

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  accent,
  isLoading,
  isError,
}: {
  label: string;
  value: number | undefined;
  sub?: string;
  accent?: string;
  isLoading: boolean;
  isError: boolean;
}) {
  let display: string;
  if (isLoading) display = '…';
  else if (isError) display = '—';
  else display = String(value ?? 0);

  return (
    <div style={{ ...CARD, padding: '1.25rem 1.5rem' }}>
      <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6C757D', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
        {label}
      </p>
      <p style={{ fontSize: '2rem', fontWeight: 800, color: accent ?? '#0A2540', lineHeight: 1 }}>
        {display}
      </p>
      {sub && (
        <p style={{ fontSize: '0.8rem', color: '#6C757D', marginTop: '0.4rem' }}>{sub}</p>
      )}
    </div>
  );
}

// ─── Skeleton shimmer row ─────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div
      style={{
        height: '3.5rem',
        background: 'linear-gradient(90deg, #f0f4f8 25%, #e4eaf0 50%, #f0f4f8 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s infinite',
        borderRadius: '0.6rem',
      }}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const params = useParams();
  const slug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';
  const r = appRoutes(slug);

  // ── Workspace name for greeting ──────────────────────────────────────────
  const { workspace } = useWorkspace();

  // ── Stat card data ───────────────────────────────────────────────────────
  const totalFeedback = useFeedbackCount();
  const newFeedback   = useFeedbackCount(FeedbackStatus.NEW);
  const activeThemes  = useThemeCount(ThemeStatus.ACTIVE);

  // Roadmap board: RoadmapBoardResponse = { [status: string]: RoadmapItem[] }
  // The backend groups items by status key; never an array at the top level.
  const { data: board, isLoading: boardLoading, isError: boardError } = useRoadmapBoard();
  const shippedCount = board?.[RoadmapStatus.SHIPPED]?.length ?? 0;

  // ── Recent feedback preview ──────────────────────────────────────────────
  const { data: recentData, isLoading: recentLoading, isError: recentError } = useRecentFeedback(5);
  const recentFeedback = recentData?.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0A2540', marginBottom: '0.25rem' }}>
          {workspace ? `${workspace.name} — Dashboard` : 'Dashboard'}
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#6C757D' }}>
          Executive overview of your product signal landscape.
        </p>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        <StatCard
          label="Total Feedback"
          value={totalFeedback.data}
          sub="All time"
          isLoading={totalFeedback.isLoading}
          isError={totalFeedback.isError}
        />
        <StatCard
          label="New Feedback"
          value={newFeedback.data}
          sub="Awaiting triage"
          accent="#20A4A4"
          isLoading={newFeedback.isLoading}
          isError={newFeedback.isError}
        />
        <StatCard
          label="Open Themes"
          value={activeThemes.data}
          sub="Active clusters"
          isLoading={activeThemes.isLoading}
          isError={activeThemes.isError}
        />
        <StatCard
          label="Shipped"
          value={shippedCount}
          sub="Roadmap items"
          accent="#20A4A4"
          isLoading={boardLoading}
          isError={boardError}
        />
      </div>

      {/* ── Recent Feedback ───────────────────────────────────────────────── */}
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0A2540' }}>Recent Feedback</h2>
          <Link href={r.inbox} style={{ fontSize: '0.82rem', color: '#20A4A4', textDecoration: 'none', fontWeight: 600 }}>
            View all →
          </Link>
        </div>

        {recentLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {[...Array(3)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : recentError ? (
          <p style={{ color: '#e63946', fontSize: '0.9rem' }}>
            Failed to load recent feedback. Please refresh.
          </p>
        ) : recentFeedback.length === 0 ? (
          <p style={{ color: '#6C757D', fontSize: '0.9rem' }}>
            No feedback yet. Share your public portal to start collecting signals.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {recentFeedback.map((fb) => {
              const sc = STATUS_COLORS[fb.status] ?? { bg: '#f0f4f8', color: '#6C757D' };
              const sourceLabel = SOURCE_LABELS[fb.sourceType] ?? fb.sourceType;
              return (
                <Link
                  key={fb.id}
                  href={r.inboxItem(fb.id)}
                  style={{
                    textDecoration: 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    padding: '0.875rem 1rem',
                    background: '#F8F9FA',
                    borderRadius: '0.6rem',
                    border: '1px solid #e9ecef',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0A2540', marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fb.title}
                    </p>
                    {fb.description && (
                      <p style={{ fontSize: '0.8rem', color: '#6C757D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {fb.description}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: '1rem', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.7rem', color: '#adb5bd', whiteSpace: 'nowrap' }}>
                      {sourceLabel}
                    </span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '999px', background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
                      {STATUS_LABELS[fb.status] ?? fb.status}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Quick links ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        {[
          { href: r.themes,  label: 'Manage Themes',  desc: 'Cluster and organise feedback signals' },
          { href: r.roadmap, label: 'View Roadmap',   desc: 'Track planned and shipped work' },
          { href: r.voice,   label: 'Voice Feedback', desc: 'Upload and triage call recordings' },
          { href: r.digest,  label: 'Weekly Digest',  desc: 'AI-generated feedback summary' },
        ].map((q) => (
          <Link
            key={q.href}
            href={q.href}
            style={{ ...CARD, textDecoration: 'none', display: 'block', borderLeft: '3px solid #20A4A4' }}
          >
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0A2540', marginBottom: '0.25rem' }}>{q.label}</p>
            <p style={{ fontSize: '0.8rem', color: '#6C757D' }}>{q.desc}</p>
          </Link>
        ))}
      </div>

      {/* Shimmer keyframe — injected once per page mount */}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
