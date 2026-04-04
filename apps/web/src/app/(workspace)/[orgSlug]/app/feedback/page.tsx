'use client';
/**
 * /:orgSlug/app/feedback — Feedback Source Management
 *
 * Dedicated source-management surface for the "Feedback" primary source.
 * Mirrors the pattern of /app/voice, /app/surveys, and /app/support/overview.
 *
 * Responsibilities:
 *   1. Manual submission (inline FeedbackForm)
 *   2. CSV import (upload zone + AIPipelineProgress banner)
 *   3. Public portal status (visibility, URL, link to admin settings)
 *   4. AI pipeline processing state (re-trigger + live progress)
 *   5. Recent feedback from this source (primarySource=FEEDBACK), with
 *      secondary-source badges and links to individual inbox items
 *
 * What this page does NOT do:
 *   - Cross-source triage (that is the inbox's job)
 *   - Status changes on individual items (inbox)
 *   - Theme/roadmap management (themes / roadmap pages)
 *
 * All feedback submitted here enters the same CIQ / theme / roadmap pipeline
 * as voice, survey, and support signals — no separate scoring path.
 */
import { useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FeedbackForm } from '@/components/shared/forms/feedback-form';
import { AIPipelineProgress, markPipelineStarted } from '@/components/pipeline/AIPipelineProgress';
import { useFeedback } from '@/hooks/use-feedback';
import { useWorkspace, useCurrentMemberRole } from '@/hooks/use-workspace';
import { useWorkspaceLimits } from '@/hooks/use-workspace-limits';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import apiClient from '@/lib/api-client';
import {
  Feedback,
  FeedbackPrimarySource,
  FeedbackSecondarySource,
  FeedbackSourceType,
  FeedbackStatus,
  WorkspaceRole,
} from '@/lib/api-types';
import { appRoutes, orgAdminRoutes } from '@/lib/routes';
import { PageHeader } from '@/components/shared/ui/page-header';

// ─── Design tokens (shared across source pages) ───────────────────────────────
const C = {
  navy:    '#0A2540',
  teal:    '#20A4A4',
  green:   '#198754',
  amber:   '#FFC107',
  red:     '#DC3545',
  muted:   '#6C757D',
  border:  '#DEE2E6',
  surface: '#FFFFFF',
  bg:      '#F8F9FA',
  purple:  '#6F42C1',
  blue:    '#0D6EFD',
};

// ─── Shared style constants ───────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '0.72rem', fontWeight: 700, color: C.muted,
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.5rem',
    }}>
      {children}
    </div>
  );
}

/** Human-readable labels for secondary source badges */
const SECONDARY_SOURCE_LABELS: Record<string, string> = {
  [FeedbackSecondarySource.MANUAL]:    'Manual',
  [FeedbackSecondarySource.CSV_UPLOAD]:'CSV',
  [FeedbackSecondarySource.PORTAL]:    'Portal',
  [FeedbackSecondarySource.EMAIL]:     'Email',
  [FeedbackSecondarySource.SLACK]:     'Slack',
  [FeedbackSecondarySource.ZENDESK]:   'Zendesk',
  [FeedbackSecondarySource.INTERCOM]:  'Intercom',
  [FeedbackSecondarySource.API]:       'API',
  [FeedbackSecondarySource.WEBHOOK]:   'Webhook',
  [FeedbackSecondarySource.IMPORT]:    'Import',
  [FeedbackSecondarySource.OTHER]:     'Other',
  // Legacy sourceType fallbacks (only values not already covered above)
  [FeedbackSourceType.CSV_IMPORT]:     'CSV',
  [FeedbackSourceType.PUBLIC_PORTAL]:  'Portal',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  [FeedbackStatus.NEW]:       { bg: '#e8f7f7', color: C.teal },
  [FeedbackStatus.IN_REVIEW]: { bg: '#fff8e1', color: '#b8860b' },
  [FeedbackStatus.PROCESSED]: { bg: '#e8f5e9', color: C.green },
  [FeedbackStatus.ARCHIVED]:  { bg: '#f0f4f8', color: C.muted },
  [FeedbackStatus.MERGED]:    { bg: '#fce8ff', color: C.purple },
};

// ─── Source channel card ──────────────────────────────────────────────────────
interface ChannelCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  badgeColor?: string;
  stat?: string;
  action?: React.ReactNode;
}
function ChannelCard({ icon, title, description, badge, badgeColor, stat, action }: ChannelCardProps) {
  return (
    <div style={{
      ...CARD,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{
          width: '2.25rem', height: '2.25rem', borderRadius: '0.5rem',
          background: '#f0fafa', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: C.navy }}>{title}</span>
            {badge && (
              <span style={{
                fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.5rem',
                borderRadius: '999px', background: badgeColor ?? '#e8f7f7', color: C.teal,
                letterSpacing: '0.02em',
              }}>
                {badge}
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.82rem', color: C.muted, marginTop: '0.2rem', lineHeight: 1.5 }}>
            {description}
          </p>
        </div>
      </div>
      {stat && (
        <div style={{ fontSize: '0.8rem', color: C.muted, borderTop: `1px solid ${C.border}`, paddingTop: '0.6rem' }}>
          {stat}
        </div>
      )}
      {action && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '0.6rem' }}>
          {action}
        </div>
      )}
    </div>
  );
}

// ─── CSV import inline zone ───────────────────────────────────────────────────
type ImportState = 'idle' | 'loading' | 'success' | 'error';
interface CsvImportResult { importedCount: number; total: number; batchId: string; }

function CsvImportZone({
  workspaceId,
  onImported,
}: {
  workspaceId: string;
  onImported: (batchId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importState, setImportState] = useState<ImportState>('idle');
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setImportState('idle');
    setResult(null);
    setErrorMessage('');
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;
    setImportState('loading');
    setErrorMessage('');
    try {
      const res = await apiClient.feedback.importCsv(workspaceId, selectedFile);
      setResult(res);
      setImportState('success');
      markPipelineStarted(workspaceId, res.batchId);
      onImported(res.batchId);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setErrorMessage(msg);
      setImportState('error');
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setImportState('idle');
    setResult(null);
    setErrorMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (importState === 'success' && result) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{
          background: '#e8f5e9', border: '1px solid #c8e6c9',
          borderRadius: '0.5rem', padding: '0.875rem 1rem',
          fontSize: '0.875rem', color: '#2e7d32',
        }}>
          <p style={{ fontWeight: 700, marginBottom: '0.25rem' }}>✓ Import complete</p>
          <p>
            <strong>{result.importedCount}</strong> rows imported
            {result.total > result.importedCount && (
              <>, <strong>{result.total - result.importedCount}</strong> skipped</>
            )}.
            AI analysis is running — check the progress banner above.
          </p>
        </div>
        <button
          onClick={handleReset}
          style={{
            alignSelf: 'flex-start', padding: '0.45rem 1rem',
            borderRadius: '0.5rem', border: `1px solid ${C.border}`,
            background: C.surface, color: C.navy, fontWeight: 600,
            fontSize: '0.82rem', cursor: 'pointer',
          }}
        >
          Import another file
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {/* Format hint */}
      <div style={{
        background: '#f0f4f8', borderRadius: '0.5rem',
        padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#495057', lineHeight: 1.6,
      }}>
        <strong>Accepted column names:</strong>{' '}
        <code style={{ fontSize: '0.78rem', background: '#e9ecef', padding: '0.1rem 0.3rem', borderRadius: '0.25rem' }}>
          title / feedback / text / subject
        </code>
        {', '}
        <code style={{ fontSize: '0.78rem', background: '#e9ecef', padding: '0.1rem 0.3rem', borderRadius: '0.25rem' }}>
          description / body / content
        </code>
        {', '}
        <code style={{ fontSize: '0.78rem', background: '#e9ecef', padding: '0.1rem 0.3rem', borderRadius: '0.25rem' }}>
          source / sourceType
        </code>{' '}
        (optional). Max <strong>10 MB</strong>.
      </div>
      {/* Drop zone */}
      <div
        style={{
          border: `2px dashed ${C.border}`, borderRadius: '0.75rem',
          padding: '1.75rem 1rem', textAlign: 'center',
          background: selectedFile ? '#f0fafa' : C.bg,
          transition: 'background 0.15s',
        }}
      >
        {selectedFile ? (
          <div style={{ fontSize: '0.875rem', color: C.navy }}>
            <span style={{ fontWeight: 700 }}>{selectedFile.name}</span>
            <span style={{ color: C.muted, marginLeft: '0.5rem' }}>
              — {(selectedFile.size / 1024).toFixed(1)} KB
            </span>
          </div>
        ) : (
          <>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.muted}
              strokeWidth="1.5" style={{ margin: '0 auto 0.5rem', display: 'block' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p style={{ fontSize: '0.85rem', color: C.muted }}>
              Select a CSV file to upload
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          disabled={importState === 'loading'}
          style={{
            display: 'block', width: '100%', marginTop: '0.75rem',
            fontSize: '0.82rem', color: C.navy, padding: '0.4rem 0.5rem',
            border: `1px solid ${C.border}`, borderRadius: '0.5rem',
            background: C.surface, cursor: 'pointer',
          }}
        />
      </div>
      {/* Error */}
      {importState === 'error' && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: '0.5rem', padding: '0.75rem 1rem',
          fontSize: '0.85rem', color: '#c0392b', fontWeight: 600,
        }}>
          {errorMessage || 'Upload failed. Please check the file and try again.'}
        </div>
      )}
      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button
          onClick={handleSubmit}
          disabled={!selectedFile || importState === 'loading'}
          style={{
            padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: 'none',
            background: !selectedFile || importState === 'loading' ? '#a0d4d4' : C.teal,
            color: C.surface, fontWeight: 700, fontSize: '0.875rem',
            cursor: !selectedFile || importState === 'loading' ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}
        >
          {importState === 'loading' && (
            <span style={{
              display: 'inline-block', width: '0.875rem', height: '0.875rem',
              border: '2px solid #fff', borderTopColor: 'transparent',
              borderRadius: '50%', animation: 'spin 0.7s linear infinite',
            }} />
          )}
          {importState === 'loading' ? 'Uploading…' : 'Import CSV'}
        </button>
        {selectedFile && importState !== 'loading' && (
          <button
            onClick={handleReset}
            style={{
              padding: '0.5rem 1rem', borderRadius: '0.5rem',
              border: `1px solid ${C.border}`, background: C.surface,
              color: C.navy, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Recent feedback row ──────────────────────────────────────────────────────
function FeedbackRow({ item, orgSlug }: { item: Feedback; orgSlug: string }) {
  const r = appRoutes(orgSlug);
  const sc = STATUS_COLORS[item.status] ?? { bg: '#f0f4f8', color: C.muted };
  const secondaryLabel =
    (item.secondarySource && SECONDARY_SOURCE_LABELS[item.secondarySource]) ??
    (item.sourceType && SECONDARY_SOURCE_LABELS[item.sourceType]) ??
    'Direct';

  return (
    <Link
      href={r.inboxItem(item.id)}
      style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        padding: '0.875rem 1rem', borderRadius: '0.625rem',
        border: `1px solid ${C.border}`, background: C.surface,
        textDecoration: 'none', color: 'inherit', gap: '1rem',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: '0.875rem', fontWeight: 600, color: C.navy,
          marginBottom: item.description ? '0.2rem' : 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.title}
        </p>
        {item.description && (
          <p style={{
            fontSize: '0.8rem', color: C.muted, lineHeight: 1.5,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {item.description}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <span style={{
          fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem',
          borderRadius: '999px', background: '#f0f4f8', color: C.muted,
          border: `1px solid ${C.border}`,
        }}>
          {secondaryLabel}
        </span>
        <span style={{
          fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem',
          borderRadius: '999px', background: sc.bg, color: sc.color,
        }}>
          {item.status.replace('_', '\u00a0')}
        </span>
        <span style={{ fontSize: '0.78rem', color: '#adb5bd' }}>
          {new Date(item.createdAt).toLocaleDateString()}
        </span>
      </div>
    </Link>
  );
}

// ─── Portal status panel ──────────────────────────────────────────────────────
interface PortalSettings {
  portalVisibility: string;
  name: string;
  description?: string;
  slug: string;
  portalUrl: string;
  customDomain?: string | null;
}

function PortalStatusPanel({ orgSlug }: { orgSlug: string }) {
  const adminR = orgAdminRoutes(orgSlug);
  const { data: settings, isLoading, isError } = useQuery<PortalSettings>({
    queryKey: ['workspace', 'portal-settings'],
    queryFn: () =>
      (apiClient.workspace as unknown as { getPortalSettings: () => Promise<PortalSettings> })
        .getPortalSettings(),
    staleTime: 60_000,
  });

  const isPublic = settings?.portalVisibility === 'PUBLIC';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {isLoading && (
        <div style={{ height: '3rem', background: '#e9ecef', borderRadius: '0.5rem', animation: 'shimmer 1.5s infinite' }} />
      )}
      {isError && (
        <p style={{ fontSize: '0.85rem', color: C.red }}>
          Could not load portal settings.
        </p>
      )}
      {settings && (
        <>
          {/* Visibility badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.7rem',
              borderRadius: '999px',
              background: isPublic ? '#e8f5e9' : '#fff8e1',
              color: isPublic ? C.green : '#b8860b',
            }}>
              {isPublic ? '● Public' : '● Private'}
            </span>
            <span style={{ fontSize: '0.82rem', color: C.muted }}>
              {settings.name || orgSlug}
            </span>
          </div>
          {/* Portal URL */}
          <div style={{
            background: C.bg, borderRadius: '0.5rem', padding: '0.6rem 0.875rem',
            fontSize: '0.82rem', color: C.navy, display: 'flex', alignItems: 'center',
            gap: '0.5rem', flexWrap: 'wrap',
          }}>
            <span style={{ color: C.muted, flexShrink: 0 }}>Portal URL:</span>
            <a
              href={settings.portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: C.teal, fontWeight: 600, wordBreak: 'break-all' }}
            >
              {settings.portalUrl}
            </a>
          </div>
          {settings.customDomain && (
            <div style={{ fontSize: '0.8rem', color: C.muted }}>
              Custom domain: <strong style={{ color: C.navy }}>{settings.customDomain}</strong>
            </div>
          )}
          {/* Admin link */}
          <Link
            href={adminR.settings + '#portal'}
            style={{
              alignSelf: 'flex-start', fontSize: '0.82rem', fontWeight: 600,
              color: C.teal, textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
            }}
          >
            Manage portal settings →
          </Link>
        </>
      )}
      <style>{`@keyframes shimmer { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  );
}

// ─── Pipeline re-trigger panel ────────────────────────────────────────────────
function PipelinePanel({ workspaceId }: { workspaceId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<{ enqueued: number; total: number } | null>(null);

  const handleReprocess = useCallback(async () => {
    setState('loading');
    setResult(null);
    try {
      const res = await apiClient.feedback.reprocessPipeline(workspaceId);
      setResult(res);
      setState('done');
    } catch {
      setState('error');
    }
  }, [workspaceId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ fontSize: '0.82rem', color: C.muted, lineHeight: 1.5 }}>
        Re-enqueues the AI analysis job for all unprocessed feedback items in this workspace.
        Use this if the pipeline stalled or new feedback was imported while the worker was offline.
      </p>
      {state === 'done' && result && (
        <div style={{
          background: '#e8f5e9', border: '1px solid #c8e6c9',
          borderRadius: '0.5rem', padding: '0.75rem 1rem',
          fontSize: '0.85rem', color: '#2e7d32', fontWeight: 600,
        }}>
          ✓ {result.enqueued} item{result.enqueued !== 1 ? 's' : ''} queued for analysis
          {result.total > 0 && ` (${result.total} total unprocessed)`}.
        </div>
      )}
      {state === 'error' && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: '0.5rem', padding: '0.75rem 1rem',
          fontSize: '0.85rem', color: '#c0392b', fontWeight: 600,
        }}>
          Failed to trigger pipeline. Please try again.
        </div>
      )}
      <button
        onClick={handleReprocess}
        disabled={state === 'loading'}
        style={{
          alignSelf: 'flex-start', padding: '0.5rem 1.1rem',
          borderRadius: '0.5rem', border: `1px solid ${C.border}`,
          background: state === 'loading' ? C.bg : C.surface,
          color: C.navy, fontWeight: 600, fontSize: '0.82rem',
          cursor: state === 'loading' ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}
      >
        {state === 'loading' && (
          <span style={{
            display: 'inline-block', width: '0.875rem', height: '0.875rem',
            border: `2px solid ${C.navy}`, borderTopColor: 'transparent',
            borderRadius: '50%', animation: 'spin 0.7s linear infinite',
          }} />
        )}
        {state === 'loading' ? 'Triggering…' : '↻ Re-trigger AI pipeline'}
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function FeedbackSourcePage() {
  const params = useParams();
  const orgSlug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';
  const r = appRoutes(orgSlug);

  const { workspace } = useWorkspace();
  const { role } = useCurrentMemberRole();
  const { limits } = useWorkspaceLimits();
  const queryClient = useQueryClient();

  const { enabled: csvEnabled } = useFeatureFlag('csvImport');
  const { enabled: portalEnabled } = useFeatureFlag('publicPortal');

  const canEdit = role === WorkspaceRole.ADMIN || role === WorkspaceRole.EDITOR;

  // CSV import pipeline tracking
  const [currentBatchId, setCurrentBatchId] = useState<string | undefined>(undefined);
  const handleImported = (batchId: string) => {
    setCurrentBatchId(batchId);
    queryClient.invalidateQueries({ queryKey: ['feedback'] });
  };

  // Recent feedback (primarySource=FEEDBACK, limit 10)
  const { useFeedbackList } = useFeedback();
  const { data: recentData, isLoading: recentLoading, refetch } = useFeedbackList({
    primarySource: FeedbackPrimarySource.FEEDBACK,
    limit: 10,
  });
  const recentItems: Feedback[] = recentData?.pages?.flatMap((p) => p.data) ?? [];

  // Usage stats from limits
  const feedbackThisMonth = limits?.feedbackThisMonth;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <PageHeader
        stage="signals"
        title="Feedback Source"
        description="Manage how direct product feedback enters TriageInsight — manual submission, CSV import, and the public portal. All channels feed the same theme clustering and CIQ priority pipeline."
        nextAction="After uploading, view clustered themes in Theme Insights or check the Impact Dashboard for CIQ scores."
      />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
          <button
            onClick={() => refetch()}
            style={{
              padding: '0.5rem 1rem', background: 'transparent',
              border: `1px solid ${C.border}`, borderRadius: '0.5rem',
              color: C.muted, fontSize: '0.8rem', cursor: 'pointer',
            }}
          >
            ↻ Refresh
          </button>
          {canEdit && (
            <Link
              href={r.inboxNew}
              style={{
                padding: '0.5rem 1rem', background: C.teal,
                border: 'none', borderRadius: '0.5rem',
                color: C.surface, fontSize: '0.875rem', fontWeight: 700,
                cursor: 'pointer', textDecoration: 'none', display: 'inline-flex',
                alignItems: 'center', gap: '0.35rem',
              }}
            >
              + New Feedback
            </Link>
          )}
        </div>
      </div>

      {/* ── AI pipeline progress banner (appears after CSV import) ────────── */}
      {workspace?.id && (
        <AIPipelineProgress
          workspaceId={workspace.id}
          batchId={currentBatchId}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['feedback'] });
          }}
        />
      )}

      {/* ── How it works banner ───────────────────────────────────────────── */}
      <div style={{
        background: '#F0FAFA', border: `1px solid ${C.teal}33`,
        borderRadius: '0.75rem', padding: '0.875rem 1.25rem',
        display: 'flex', alignItems: 'flex-start', gap: '0.875rem',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.teal}
          strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div style={{ fontSize: '0.85rem', color: C.navy, lineHeight: 1.6 }}>
          <strong>How it works:</strong> Feedback arrives via manual entry, CSV upload, the
          public portal, or API integration → each item is AI-analysed for sentiment, urgency,
          and theme fit → automatically clustered into themes → CIQ scores are updated so the
          priority board reflects the full cross-source signal picture. The{' '}
          <Link href={r.inbox} style={{ color: C.teal, fontWeight: 600 }}>Feedback Inbox</Link>{' '}
          is the unified triage surface for reviewing and actioning items from all sources.
        </div>
      </div>

      {/* ── Source channel overview ───────────────────────────────────────── */}
      <section>
        <SectionLabel>Ingestion Channels</SectionLabel>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '1rem',
        }}>
          {/* Manual */}
          <ChannelCard
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            }
            title="Manual Entry"
            badge="Always on"
            description="Submit feedback directly on behalf of a customer or from an internal source."
            stat={
              feedbackThisMonth
                ? `${feedbackThisMonth.used} / ${feedbackThisMonth.limit ?? '∞'} items this month`
                : undefined
            }
            action={
              canEdit ? (
                <Link
                  href={r.inboxNew}
                  style={{
                    fontSize: '0.82rem', fontWeight: 600, color: C.teal,
                    textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                  }}
                >
                  + Submit feedback →
                </Link>
              ) : undefined
            }
          />

          {/* CSV */}
          <ChannelCard
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            }
            title="CSV Import"
            badge={csvEnabled ? 'Enabled' : 'Upgrade required'}
            badgeColor={csvEnabled ? '#e8f7f7' : '#fff8e1'}
            description="Bulk-import historical feedback from spreadsheets or CRM exports."
            action={
              !csvEnabled ? (
                <Link
                  href={r.upgrade}
                  style={{ fontSize: '0.82rem', fontWeight: 600, color: '#b8860b', textDecoration: 'none' }}
                >
                  Upgrade to unlock →
                </Link>
              ) : undefined
            }
          />

          {/* Public portal */}
          <ChannelCard
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            }
            title="Public Portal"
            badge={portalEnabled ? 'Enabled' : 'Upgrade required'}
            badgeColor={portalEnabled ? '#e8f7f7' : '#fff8e1'}
            description="Customer-facing portal where users can submit and upvote feedback publicly."
            action={
              portalEnabled ? (
                <Link
                  href={orgAdminRoutes(orgSlug).settings + '#portal'}
                  style={{ fontSize: '0.82rem', fontWeight: 600, color: C.teal, textDecoration: 'none' }}
                >
                  Portal settings →
                </Link>
              ) : (
                <Link
                  href={r.upgrade}
                  style={{ fontSize: '0.82rem', fontWeight: 600, color: '#b8860b', textDecoration: 'none' }}
                >
                  Upgrade to unlock →
                </Link>
              )
            }
          />

          {/* API / integrations */}
          <ChannelCard
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            }
            title="API & Integrations"
            badge="REST API"
            description="Ingest feedback programmatically via the TriageInsight REST API or Slack/email integrations."
            action={
              <Link
                href={orgAdminRoutes(orgSlug).integrations}
                style={{ fontSize: '0.82rem', fontWeight: 600, color: C.teal, textDecoration: 'none' }}
              >
                Manage integrations →
              </Link>
            }
          />
        </div>
      </section>

      {/* ── Manual submission ─────────────────────────────────────────────── */}
      {canEdit && (
        <section>
          <SectionLabel>Manual Submission</SectionLabel>
          <div style={{ ...CARD, maxWidth: '40rem' }}>
            <FeedbackForm
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['feedback'] });
                refetch();
              }}
            />
          </div>
        </section>
      )}

      {/* ── CSV import ────────────────────────────────────────────────────── */}
      {canEdit && csvEnabled && workspace?.id && (
        <section>
          <SectionLabel>CSV Import</SectionLabel>
          <div style={{ ...CARD, maxWidth: '40rem' }}>
            <CsvImportZone workspaceId={workspace.id} onImported={handleImported} />
          </div>
        </section>
      )}

      {/* ── Public portal status ──────────────────────────────────────────── */}
      {portalEnabled && (
        <section>
          <SectionLabel>Public Portal Status</SectionLabel>
          <div style={{ ...CARD, maxWidth: '40rem' }}>
            <PortalStatusPanel orgSlug={orgSlug} />
          </div>
        </section>
      )}

      {/* ── AI pipeline ───────────────────────────────────────────────────── */}
      {canEdit && workspace?.id && (
        <section>
          <SectionLabel>AI Processing Pipeline</SectionLabel>
          <div style={{ ...CARD, maxWidth: '40rem' }}>
            <PipelinePanel workspaceId={workspace.id} />
          </div>
        </section>
      )}

      {/* ── Recent feedback from this source ─────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <SectionLabel>
            Recent Feedback {recentItems.length > 0 ? `(${recentItems.length} shown)` : ''}
          </SectionLabel>
          <Link
            href={r.inbox + '?primarySource=FEEDBACK'}
            style={{ fontSize: '0.82rem', fontWeight: 600, color: C.teal, textDecoration: 'none' }}
          >
            View all in inbox →
          </Link>
        </div>

        {recentLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{
                height: '3.5rem', background: '#e9ecef', borderRadius: '0.625rem',
                animation: 'shimmer 1.5s infinite',
              }} />
            ))}
          </div>
        )}

        {!recentLoading && recentItems.length === 0 && (
          <div style={{
            padding: '2.5rem 2rem', textAlign: 'center',
            border: `2px dashed ${C.border}`, borderRadius: '0.875rem', color: C.muted,
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.border}
              strokeWidth="1.5" style={{ margin: '0 auto 0.75rem', display: 'block' }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No feedback yet</div>
            <div style={{ fontSize: '0.8rem' }}>
              {canEdit
                ? 'Submit your first feedback item above or import a CSV file.'
                : 'No feedback has been added to this workspace yet.'}
            </div>
          </div>
        )}

        {!recentLoading && recentItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {recentItems.map((item) => (
              <FeedbackRow key={item.id} item={item} orgSlug={orgSlug} />
            ))}
          </div>
        )}
      </section>

      {/* ── Quick links ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
        {[
          { href: r.inbox,    label: 'Feedback Inbox',      icon: '📥' },
          { href: r.themes,   label: 'Theme Clusters',       icon: '⬡' },
          { href: r.roadmap,  label: 'Roadmap',              icon: '🗺' },
          { href: r.ciq,      label: 'Priority Intelligence', icon: '📊' },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.75rem 1rem', borderRadius: '0.625rem',
              border: `1px solid ${C.border}`, background: C.surface,
              textDecoration: 'none', color: C.navy, fontSize: '0.875rem',
              fontWeight: 600, transition: 'background 0.1s',
            }}
          >
            <span style={{ fontSize: '1rem' }}>{link.icon}</span>
            {link.label}
          </Link>
        ))}
      </div>

      <style>{`@keyframes shimmer { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  );
}
