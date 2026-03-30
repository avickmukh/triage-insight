'use client';

import { useRef, useState, useCallback } from 'react';
import { useFeedback } from '@/hooks/use-feedback';
import { useWorkspace, useCurrentMemberRole } from '@/hooks/use-workspace';
import { Feedback, FeedbackPrimarySource, FeedbackSecondarySource, FeedbackSourceType, FeedbackStatus, SemanticSearchResult, ThemeFeedback, WorkspaceRole } from '@/lib/api-types';
import apiClient from '@/lib/api-client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { appRoutes } from '@/lib/routes';
import { useQueryClient } from '@tanstack/react-query';
import { AIPipelineProgress, markPipelineStarted } from '@/components/pipeline/AIPipelineProgress';

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  [FeedbackStatus.NEW]: { bg: '#e8f7f7', color: '#20A4A4' },
  [FeedbackStatus.IN_REVIEW]: { bg: '#fff8e1', color: '#b8860b' },
  [FeedbackStatus.PROCESSED]: { bg: '#e8f5e9', color: '#2e7d32' },
  [FeedbackStatus.ARCHIVED]: { bg: '#f0f4f8', color: '#6C757D' },
  [FeedbackStatus.MERGED]: { bg: '#fce8ff', color: '#7c3aed' },
};

const SOURCE_LABELS: Record<string, string> = {
  // Legacy sourceType labels (kept for backward compat)
  [FeedbackSourceType.MANUAL]: 'Manual',
  [FeedbackSourceType.PUBLIC_PORTAL]: 'Portal',
  [FeedbackSourceType.EMAIL]: 'Email',
  [FeedbackSourceType.SLACK]: 'Slack',
  [FeedbackSourceType.CSV_IMPORT]: 'CSV',
  [FeedbackSourceType.VOICE]: 'Voice',
  [FeedbackSourceType.API]: 'API',
};

/** Human-readable labels for the unified secondary source badges */
const SECONDARY_SOURCE_LABELS: Record<string, string> = {
  [FeedbackSecondarySource.MANUAL]: 'Manual',
  [FeedbackSecondarySource.CSV_UPLOAD]: 'CSV',
  [FeedbackSecondarySource.PORTAL]: 'Portal',
  [FeedbackSecondarySource.EMAIL]: 'Email',
  [FeedbackSecondarySource.SLACK]: 'Slack',
  [FeedbackSecondarySource.ZENDESK]: 'Zendesk',
  [FeedbackSecondarySource.INTERCOM]: 'Intercom',
  [FeedbackSecondarySource.API]: 'API',
  [FeedbackSecondarySource.WEBHOOK]: 'Webhook',
  [FeedbackSecondarySource.TRANSCRIPT]: 'Transcript',
  [FeedbackSecondarySource.IMPORT]: 'Import',
  [FeedbackSecondarySource.OTHER]: 'Other',
};

/** Primary source filter tabs for the inbox top-level source selector */
const PRIMARY_SOURCE_TABS: { label: string; value: FeedbackPrimarySource | undefined }[] = [
  { label: 'All Sources', value: undefined },
  { label: 'Feedback', value: FeedbackPrimarySource.FEEDBACK },
  { label: 'Voice', value: FeedbackPrimarySource.VOICE },
  { label: 'Survey', value: FeedbackPrimarySource.SURVEY },
  { label: 'Support', value: FeedbackPrimarySource.SUPPORT },
];

const TABS: { label: string; value: FeedbackStatus | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'New', value: FeedbackStatus.NEW },
  { label: 'In Review', value: FeedbackStatus.IN_REVIEW },
  { label: 'Processed', value: FeedbackStatus.PROCESSED },
  { label: 'Archived', value: FeedbackStatus.ARCHIVED },
];

// ─── CSV Import Modal ─────────────────────────────────────────────────────────

type ImportState = 'idle' | 'loading' | 'success' | 'error';

interface CsvImportResult {
  importedCount: number;
  total: number;
  batchId: string;
}

function CsvImportModal({
  workspaceId,
  onClose,
  onImported,
}: {
  workspaceId: string;
  onClose: () => void;
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
      // Mark pipeline as started so the progress overlay appears immediately
      // and persists if the user closes the tab.
      // Pass batchId so polling uses the batch-scoped endpoint (total = 50, not 2307).
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

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,37,64,0.35)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      {/* Modal panel — stop propagation so clicks inside don't close */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '0.875rem',
          boxShadow: '0 8px 32px rgba(10,37,64,0.16)',
          width: '100%',
          maxWidth: '28rem',
          padding: '1.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0A2540', marginBottom: '0.2rem' }}>
              Import CSV
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#6C757D' }}>
              Bulk-import feedback rows from a CSV file.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#6C757D',
              fontSize: '1.25rem',
              lineHeight: 1,
              padding: '0.1rem 0.3rem',
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Format hint */}
        <div
          style={{
            background: '#f0f4f8',
            borderRadius: '0.5rem',
            padding: '0.75rem 1rem',
            fontSize: '0.8rem',
            color: '#495057',
            lineHeight: 1.6,
          }}
        >
          <strong>Flexible column names accepted:</strong>{' '}
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
          (optional){'. '}
          Max file size: <strong>10 MB</strong>.
        </div>

        {/* File picker */}
        {importState !== 'success' && (
          <div>
            <label
              htmlFor="csv-file-input"
              style={{
                display: 'block',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#0A2540',
                marginBottom: '0.4rem',
              }}
            >
              Select file
            </label>
            <input
              id="csv-file-input"
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              disabled={importState === 'loading'}
              style={{
                display: 'block',
                width: '100%',
                fontSize: '0.85rem',
                color: '#0A2540',
                padding: '0.45rem 0.6rem',
                border: '1px solid #dee2e6',
                borderRadius: '0.5rem',
                background: '#fff',
                cursor: 'pointer',
              }}
            />
            {selectedFile && (
              <p style={{ fontSize: '0.78rem', color: '#6C757D', marginTop: '0.3rem' }}>
                {selectedFile.name} &mdash; {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>
        )}

        {/* Loading state */}
        {importState === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#20A4A4', fontSize: '0.88rem', fontWeight: 600 }}>
            <span
              style={{
                display: 'inline-block',
                width: '1rem',
                height: '1rem',
                border: '2px solid #20A4A4',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 0.7s linear infinite',
              }}
            />
            Uploading and processing…
          </div>
        )}

        {/* Success state */}
        {importState === 'success' && result && (
          <div
            style={{
              background: '#e8f5e9',
              border: '1px solid #c8e6c9',
              borderRadius: '0.5rem',
              padding: '1rem',
              fontSize: '0.88rem',
              color: '#2e7d32',
            }}
          >
            <p style={{ fontWeight: 700, marginBottom: '0.35rem' }}>✓ Import complete</p>
            <p>
              <strong>{result.importedCount}</strong> rows imported
              {result.total > result.importedCount && (
                <>, <strong>{result.total - result.importedCount}</strong> skipped</>
              )}.
            </p>
          </div>
        )}

        {/* Error state */}
        {importState === 'error' && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '0.5rem',
              padding: '0.75rem 1rem',
              fontSize: '0.85rem',
              color: '#c0392b',
              fontWeight: 600,
            }}
          >
            {errorMessage || 'Upload failed. Please check the file and try again.'}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
          {importState === 'success' ? (
            <>
              <button
                onClick={handleReset}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #dee2e6',
                  background: '#fff',
                  color: '#0A2540',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Import another
              </button>
              <button
                onClick={onClose}
                style={{
                  padding: '0.5rem 1.1rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: '#20A4A4',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={importState === 'loading'}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #dee2e6',
                  background: '#fff',
                  color: '#0A2540',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: importState === 'loading' ? 'not-allowed' : 'pointer',
                  opacity: importState === 'loading' ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!selectedFile || importState === 'loading'}
                style={{
                  padding: '0.5rem 1.1rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: !selectedFile || importState === 'loading' ? '#a0d4d4' : '#20A4A4',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: !selectedFile || importState === 'loading' ? 'not-allowed' : 'pointer',
                }}
              >
                {importState === 'loading' ? 'Uploading…' : 'Import'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Spinner keyframe — injected as a style tag */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const params = useParams();
  const slug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';
  const r = appRoutes(slug);
  const [activeStatus, setActiveStatus] = useState<FeedbackStatus | undefined>(undefined);
  const [activePrimarySource, setActivePrimarySource] = useState<FeedbackPrimarySource | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [currentBatchId, setCurrentBatchId] = useState<string | undefined>(undefined);

  // ── AI Pipeline re-trigger state ───────────────────────────────────────
  const [pipelineState, setPipelineState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [pipelineResult, setPipelineResult] = useState<{ enqueued: number; total: number } | null>(null);

  // ── AI Semantic Search state ─────────────────────────────────────────────
  const [aiMode, setAiMode] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [aiResults, setAiResults] = useState<SemanticSearchResult[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const { workspace } = useWorkspace();
  const { role } = useCurrentMemberRole();
  const queryClient = useQueryClient();

  const runAiSearch = useCallback(async (q: string) => {
    if (!workspace?.id || !q.trim()) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await apiClient.feedback.semanticSearch(workspace.id, q.trim());
      setAiResults(res.data);
    } catch (err: unknown) {
      // NestJS can return message as a string OR an array of validation strings.
      // Always coerce to a plain string so React never receives an object/array child.
      const rawMsg =
        (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
      const msg = Array.isArray(rawMsg)
        ? rawMsg.join('; ')
        : typeof rawMsg === 'string' && rawMsg
        ? rawMsg
        : err instanceof Error
        ? err.message
        : 'AI search failed. Please try again.';
      setAiError(msg);
      setAiResults(null);
    } finally {
      setAiLoading(false);
    }
  }, [workspace?.id]);

  const { useFeedbackList } = useFeedback();
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useFeedbackList({
      status: activeStatus,
      primarySource: activePrimarySource,
      search: search.trim() || undefined,
    });

  const allItems: Feedback[] = data?.pages?.flatMap((p) => p.data) ?? [];

  // Only ADMIN and EDITOR may import CSV (mirrors backend @Roles guard)
  const canImport =
    role === WorkspaceRole.ADMIN || role === WorkspaceRole.EDITOR;

  const handleImported = (batchId: string) => {
    // Store batchId so AIPipelineProgress polls the batch-scoped endpoint
    setCurrentBatchId(batchId);
    // Invalidate the feedback list so the new rows appear immediately
    queryClient.invalidateQueries({ queryKey: ['feedback'] });
  };

  const handleReprocessPipeline = useCallback(async () => {
    if (!workspace?.id) return;
    setPipelineState('loading');
    setPipelineResult(null);
    try {
      const res = await apiClient.feedback.reprocessPipeline(workspace.id);
      setPipelineResult(res);
      setPipelineState('done');
      // Mark pipeline as started so the progress overlay appears
      markPipelineStarted(workspace.id);
      // Refresh list after a short delay so newly-processed items appear
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['feedback'] }), 3000);
    } catch {
      setPipelineState('error');
    }
  }, [workspace?.id, queryClient]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* CSV Import Modal */}
      {showCsvModal && workspace?.id && (
        <CsvImportModal
          workspaceId={workspace.id}
          onClose={() => setShowCsvModal(false)}
          onImported={handleImported}
        />
      )}

      {/* AI Pipeline progress banner — scoped to the current batch */}
      {workspace?.id && (
        <AIPipelineProgress
          workspaceId={workspace.id}
          batchId={currentBatchId}
          onComplete={() => queryClient.invalidateQueries({ queryKey: ['feedback'] })}
        />
      )}

      {/* Header row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              color: '#0A2540',
              marginBottom: '0.25rem',
            }}
          >
            Feedback Inbox
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#6C757D' }}>
            Triage and manage all incoming feedback.
          </p>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Run AI Pipeline — only shown to ADMIN / EDITOR */}
          {canImport && (
            <button
              onClick={handleReprocessPipeline}
              disabled={pipelineState === 'loading'}
              title={pipelineResult ? `Last run: ${pipelineResult.enqueued}/${pipelineResult.total} jobs enqueued` : 'Re-run AI pipeline (embedding → sentiment → theme clustering) on all unprocessed feedback'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 1.1rem',
                borderRadius: '0.5rem',
                background: pipelineState === 'done' ? '#d4edda' : pipelineState === 'error' ? '#f8d7da' : '#fff',
                color: pipelineState === 'done' ? '#155724' : pipelineState === 'error' ? '#721c24' : '#0A2540',
                fontWeight: 700,
                fontSize: '0.85rem',
                border: `1px solid ${pipelineState === 'done' ? '#c3e6cb' : pipelineState === 'error' ? '#f5c6cb' : '#dee2e6'}`,
                cursor: pipelineState === 'loading' ? 'not-allowed' : 'pointer',
                boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
                opacity: pipelineState === 'loading' ? 0.7 : 1,
              }}
            >
              {pipelineState === 'loading'
                ? '⏳ Processing…'
                : pipelineState === 'done'
                ? `✓ ${pipelineResult?.enqueued ?? 0} jobs queued`
                : pipelineState === 'error'
                ? '✗ Pipeline failed'
                : '⚡ Run AI Pipeline'}
            </button>
          )}

          {/* Import CSV — only shown to ADMIN / EDITOR */}
          {canImport && (
            <button
              onClick={() => setShowCsvModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 1.1rem',
                borderRadius: '0.5rem',
                background: '#fff',
                color: '#0A2540',
                fontWeight: 700,
                fontSize: '0.85rem',
                border: '1px solid #dee2e6',
                cursor: 'pointer',
                boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
              }}
            >
              ↑ Import CSV
            </button>
          )}

          {/* New Feedback */}
          <Link
            href={r.inboxNew}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 1.1rem',
              borderRadius: '0.5rem',
              background: '#20A4A4',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.85rem',
              textDecoration: 'none',
              boxShadow: '0 1px 4px rgba(10,37,64,0.10)',
            }}
          >
            + New Feedback
          </Link>
        </div>
      </div>

      {/* Search + status filter */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

        {/* Search mode toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => { setAiMode(false); setAiResults(null); setAiError(null); }}
            style={{
              padding: '0.3rem 0.85rem',
              borderRadius: '999px',
              border: '1px solid',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              borderColor: !aiMode ? '#0A2540' : '#dee2e6',
              background: !aiMode ? '#0A2540' : '#fff',
              color: !aiMode ? '#fff' : '#6C757D',
              transition: 'all 0.15s',
            }}
          >
            Keyword
          </button>
          <button
            onClick={() => setAiMode(true)}
            style={{
              padding: '0.3rem 0.85rem',
              borderRadius: '999px',
              border: '1px solid',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              borderColor: aiMode ? '#20A4A4' : '#dee2e6',
              background: aiMode ? '#e8f7f7' : '#fff',
              color: aiMode ? '#20A4A4' : '#6C757D',
              transition: 'all 0.15s',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            <span style={{ fontSize: '0.7rem' }}>&#10024;</span> AI Search
          </button>
        </div>

        {/* Keyword search input */}
        {!aiMode && (
          <input
            type="text"
            placeholder="Search feedback…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '0.5rem 0.875rem',
              borderRadius: '0.5rem',
              border: '1px solid #dee2e6',
              fontSize: '0.875rem',
              color: '#0A2540',
              outline: 'none',
              width: '100%',
              maxWidth: '28rem',
              background: '#fff',
            }}
          />
        )}

        {/* AI semantic search input */}
        {aiMode && (
          <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '36rem' }}>
            <input
              type="text"
              placeholder="Describe what you’re looking for… e.g. “slowness during checkout”"
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runAiSearch(aiQuery); }}
              style={{
                flex: 1,
                padding: '0.5rem 0.875rem',
                borderRadius: '0.5rem',
                border: '1px solid #20A4A4',
                fontSize: '0.875rem',
                color: '#0A2540',
                outline: 'none',
                background: '#fff',
              }}
            />
            <button
              onClick={() => runAiSearch(aiQuery)}
              disabled={aiLoading || !aiQuery.trim()}
              style={{
                padding: '0.5rem 1.1rem',
                borderRadius: '0.5rem',
                border: 'none',
                background: aiLoading || !aiQuery.trim() ? '#a0d4d4' : '#20A4A4',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: aiLoading || !aiQuery.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {aiLoading ? 'Searching…' : 'Search'}
            </button>
          </div>
        )}

        {/* Primary source filter tabs — always visible in keyword mode */}
        {!aiMode && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid #f0f4f8', paddingBottom: '0.5rem' }}>
            {PRIMARY_SOURCE_TABS.map((t) => (
              <button
                key={t.label}
                onClick={() => setActivePrimarySource(t.value)}
                style={{
                  padding: '0.35rem 0.9rem',
                  borderRadius: '999px',
                  border: '1px solid',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderColor: activePrimarySource === t.value ? '#0A2540' : '#dee2e6',
                  background: activePrimarySource === t.value ? '#0A2540' : '#fff',
                  color: activePrimarySource === t.value ? '#fff' : '#6C757D',
                  transition: 'all 0.15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Status filter tabs (keyword mode only) */}
        {!aiMode && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {TABS.map((t) => (
              <button
                key={t.label}
                onClick={() => setActiveStatus(t.value)}
                style={{
                  padding: '0.4rem 1rem',
                  borderRadius: '999px',
                  border: '1px solid',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderColor: activeStatus === t.value ? '#20A4A4' : '#dee2e6',
                  background: activeStatus === t.value ? '#e8f7f7' : '#fff',
                  color: activeStatus === t.value ? '#20A4A4' : '#6C757D',
                  transition: 'all 0.15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* AI Search Results */}
      {aiMode && (
        <div style={CARD}>
          {/* AI mode header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f0f4f8' }}>
            <span style={{ fontSize: '0.8rem', color: '#20A4A4', fontWeight: 700 }}>&#10024; AI Semantic Search</span>
            {aiResults !== null && (
              <span style={{ fontSize: '0.75rem', color: '#6C757D' }}>
                {aiResults.length} result{aiResults.length !== 1 ? 's' : ''} for &ldquo;{aiQuery}&rdquo;
              </span>
            )}
          </div>

          {aiLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#20A4A4', fontSize: '0.88rem', fontWeight: 600, padding: '1rem 0' }}>
              <span style={{ display: 'inline-block', width: '1rem', height: '1rem', border: '2px solid #20A4A4', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Searching with AI…
            </div>
          ) : aiError ? (
            <div style={{ padding: '1rem', background: '#fef2f2', borderRadius: '0.5rem', color: '#c0392b', fontSize: '0.85rem', fontWeight: 600 }}>
              {aiError}
            </div>
          ) : aiResults === null ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#6C757D', fontSize: '0.875rem' }}>
              Enter a natural-language query above and press <strong>Search</strong> or <strong>Enter</strong>.
            </div>
          ) : aiResults.length === 0 ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
              <p style={{ color: '#0A2540', fontWeight: 700, fontSize: '1rem', marginBottom: '0.35rem' }}>No similar feedback found</p>
              <p style={{ color: '#6C757D', fontSize: '0.875rem' }}>Try rephrasing your query, or lower the similarity threshold.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {aiResults.map((fb, i) => {
                const sc = STATUS_COLORS[fb.status] ?? { bg: '#f0f4f8', color: '#6C757D' };
                // Prefer unified secondarySource label; fall back to legacy sourceType label
                const sourceLabel = (fb.secondarySource && SECONDARY_SOURCE_LABELS[fb.secondarySource])
                  ?? SOURCE_LABELS[fb.sourceType]
                  ?? fb.sourceType;
                const pct = Math.round(Number(fb.similarity) * 100);
                return (
                  <Link
                    key={fb.id}
                    href={r.inboxItem(fb.id)}
                    style={{
                      textDecoration: 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.875rem 0',
                      borderBottom: i < aiResults.length - 1 ? '1px solid #f0f4f8' : 'none',
                    }}
                  >
                    {/* Title + description */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0A2540', marginBottom: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {fb.title}
                      </p>
                      {fb.description && (
                        <p style={{ fontSize: '0.8rem', color: '#6C757D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {fb.description}
                        </p>
                      )}
                    </div>
                    {/* Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1rem', flexShrink: 0 }}>
                      {/* Similarity score badge */}
                      <span
                        title={`Cosine similarity: ${fb.similarity}`}
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '999px',
                          background: pct >= 80 ? '#e8f5e9' : pct >= 60 ? '#e8f7f7' : '#f0f4f8',
                          color: pct >= 80 ? '#2e7d32' : pct >= 60 ? '#20A4A4' : '#6C757D',
                          border: '1px solid',
                          borderColor: pct >= 80 ? '#c8e6c9' : pct >= 60 ? '#b2dfdb' : '#e9ecef',
                        }}
                      >
                        {pct}% match
                      </span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '999px', background: '#f0f4f8', color: '#6C757D', border: '1px solid #e9ecef' }}>
                        {sourceLabel}
                      </span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '999px', background: sc.bg, color: sc.color }}>
                        {fb.status.replace('_', '\u00a0')}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: '#adb5bd' }}>
                        {new Date(fb.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* List card (keyword mode) */}
      {!aiMode && <div style={CARD}>
        {isLoading ? (
          /* Skeleton shimmer */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                style={{
                  height: '3.5rem',
                  borderRadius: '0.5rem',
                  background: 'linear-gradient(90deg, #f0f4f8 25%, #e9ecef 50%, #f0f4f8 75%)',
                  backgroundSize: '200% 100%',
                }}
              />
            ))}
          </div>
        ) : isError ? (
          /* Error state */
          <div style={{ padding: '1.5rem', textAlign: 'center' }}>
            <p
              style={{
                color: '#c0392b',
                fontWeight: 600,
                marginBottom: '0.25rem',
                fontSize: '0.95rem',
              }}
            >
              Failed to load feedback
            </p>
            <p style={{ color: '#6C757D', fontSize: '0.85rem' }}>
              {typeof (error as Error)?.message === 'string'
                ? (error as Error).message
                : 'An unexpected error occurred. Please try again.'}
            </p>
          </div>
        ) : allItems.length === 0 ? (
          /* Empty state */
          <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
            <p
              style={{
                color: '#0A2540',
                fontWeight: 700,
                fontSize: '1rem',
                marginBottom: '0.35rem',
              }}
            >
              No feedback found
            </p>
            <p style={{ color: '#6C757D', fontSize: '0.875rem' }}>
              {search
                ? 'Try a different search term or clear the filter.'
                : 'Submit feedback via the portal or add it manually using the button above.'}
            </p>
          </div>
        ) : (
          /* Feedback rows */
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {allItems.map((fb, i) => {
              const sc = STATUS_COLORS[fb.status] ?? { bg: '#f0f4f8', color: '#6C757D' };
              // Prefer unified secondarySource label; fall back to legacy sourceType label
              const sourceLabel = (fb.secondarySource && SECONDARY_SOURCE_LABELS[fb.secondarySource])
                ?? SOURCE_LABELS[fb.sourceType]
                ?? fb.sourceType;
              return (
                <Link
                  key={fb.id}
                  href={r.inboxItem(fb.id)}
                  style={{
                    textDecoration: 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.875rem 0',
                    borderBottom:
                      i < allItems.length - 1 ? '1px solid #f0f4f8' : 'none',
                  }}
                >
                  {/* Title + description + theme pills */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        color: '#0A2540',
                        marginBottom: '0.15rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {fb.title}
                    </p>
                    {fb.description && (
                      <p
                        style={{
                          fontSize: '0.8rem',
                          color: '#6C757D',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginBottom: fb.themes && fb.themes.length > 0 ? '0.35rem' : 0,
                        }}
                      >
                        {fb.description}
                      </p>
                    )}
                    {/* Theme identifier pills */}
                    {fb.themes && fb.themes.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {(fb.themes as ThemeFeedback[]).slice(0, 3).map((tf) => (
                          <span
                            key={tf.themeId}
                            title={tf.theme?.title ?? tf.themeId}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.2rem',
                              background: '#ede9fe',
                              color: '#7c3aed',
                              padding: '0.1rem 0.5rem',
                              borderRadius: '999px',
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              maxWidth: '8rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span style={{ fontSize: '0.6rem' }}>⬡</span>
                            {tf.theme?.title ?? 'Theme'}
                          </span>
                        ))}
                        {fb.themes.length > 3 && (
                          <span style={{ background: '#f3f0ff', color: '#7c3aed', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 600 }}>
                            +{fb.themes.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Badges + date */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginLeft: '1rem',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '999px',
                        background: '#f0f4f8',
                        color: '#6C757D',
                        border: '1px solid #e9ecef',
                      }}
                    >
                      {sourceLabel}
                    </span>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.6rem',
                        borderRadius: '999px',
                        background: sc.bg,
                        color: sc.color,
                      }}
                    >
                      {fb.status.replace('_', '\u00a0')}
                    </span>
                    {/* Merged-away indicator: this item was merged into another */}
                    {fb.mergedIntoId && (
                      <span
                        title={`Merged into ${fb.mergedIntoId}`}
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '999px',
                          background: '#fce8ff',
                          color: '#7c3aed',
                          border: '1px solid #e9d5ff',
                        }}
                      >
                        Merged
                      </span>
                    )}
                    <span style={{ fontSize: '0.78rem', color: '#adb5bd' }}>
                      {new Date(fb.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Load more */}
        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            style={{
              marginTop: '1rem',
              width: '100%',
              padding: '0.6rem',
              borderRadius: '0.5rem',
              border: '1px solid #dee2e6',
              background: '#fff',
              color: '#20A4A4',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>}
    </div>
  );
}
