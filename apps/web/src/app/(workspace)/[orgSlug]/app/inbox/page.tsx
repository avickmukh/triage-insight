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
  [FeedbackSourceType.MANUAL]: 'Manual',
  [FeedbackSourceType.PUBLIC_PORTAL]: 'Portal',
  [FeedbackSourceType.EMAIL]: 'Email',
  [FeedbackSourceType.SLACK]: 'Slack',
  [FeedbackSourceType.CSV_IMPORT]: 'CSV',
  [FeedbackSourceType.VOICE]: 'Voice',
  [FeedbackSourceType.API]: 'API',
};

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

const PRIMARY_SOURCE_TABS: { label: string; value: FeedbackPrimarySource | undefined; icon: string }[] = [
  { label: 'All Sources', value: undefined,                          icon: '◈' },
  { label: 'Feedback',    value: FeedbackPrimarySource.FEEDBACK,    icon: '💬' },
  { label: 'Voice',       value: FeedbackPrimarySource.VOICE,       icon: '🎙' },
  { label: 'Survey',      value: FeedbackPrimarySource.SURVEY,      icon: '📋' },
  { label: 'Support',     value: FeedbackPrimarySource.SUPPORT,     icon: '🎧' },
];

const PRIMARY_SOURCE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  [FeedbackPrimarySource.FEEDBACK]: { bg: '#e8f7f7', color: '#20A4A4', border: '#b2dfdb' },
  [FeedbackPrimarySource.VOICE]:    { bg: '#e8f0fe', color: '#1a73e8', border: '#c5d8fb' },
  [FeedbackPrimarySource.SURVEY]:   { bg: '#fff8e1', color: '#b8860b', border: '#ffe082' },
  [FeedbackPrimarySource.SUPPORT]:  { bg: '#fce8ff', color: '#7c3aed', border: '#e9d5ff' },
};

const SECONDARY_SOURCE_BY_PRIMARY: Record<string, FeedbackSecondarySource[]> = {
  [FeedbackPrimarySource.FEEDBACK]: [
    FeedbackSecondarySource.MANUAL,
    FeedbackSecondarySource.CSV_UPLOAD,
    FeedbackSecondarySource.PORTAL,
    FeedbackSecondarySource.EMAIL,
    FeedbackSecondarySource.SLACK,
    FeedbackSecondarySource.API,
    FeedbackSecondarySource.WEBHOOK,
    FeedbackSecondarySource.IMPORT,
    FeedbackSecondarySource.OTHER,
  ],
  [FeedbackPrimarySource.VOICE]: [
    FeedbackSecondarySource.TRANSCRIPT,
    FeedbackSecondarySource.MANUAL,
    FeedbackSecondarySource.OTHER,
  ],
  [FeedbackPrimarySource.SURVEY]: [
    FeedbackSecondarySource.MANUAL,
    FeedbackSecondarySource.API,
    FeedbackSecondarySource.IMPORT,
    FeedbackSecondarySource.OTHER,
  ],
  [FeedbackPrimarySource.SUPPORT]: [
    FeedbackSecondarySource.ZENDESK,
    FeedbackSecondarySource.INTERCOM,
    FeedbackSecondarySource.EMAIL,
    FeedbackSecondarySource.WEBHOOK,
    FeedbackSecondarySource.API,
    FeedbackSecondarySource.OTHER,
  ],
};

const ALL_SECONDARY_SOURCES: FeedbackSecondarySource[] = Object.values(FeedbackSecondarySource);

const TABS: { label: string; value: FeedbackStatus | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'New', value: FeedbackStatus.NEW },
  { label: 'In Review', value: FeedbackStatus.IN_REVIEW },
  { label: 'Processed', value: FeedbackStatus.PROCESSED },
  { label: 'Archived', value: FeedbackStatus.ARCHIVED },
];

// ─── CSV Import Modal (3-step wizard) ────────────────────────────────────────

type ImportState = 'idle' | 'parsing' | 'mapping' | 'loading' | 'success' | 'error';

interface CsvImportResult {
  importedCount: number;
  total: number;
  batchId: string;
}

interface CsvColumnMapping {
  feedbackText: string;
  title?: string;
  customerEmail?: string;
  source?: string;
}

const FIELD_LABELS: { key: keyof CsvColumnMapping; label: string; required: boolean; hint: string }[] = [
  { key: 'feedbackText', label: 'Feedback Text',   required: true,  hint: 'The main feedback content (required)' },
  { key: 'title',        label: 'Title / Subject', required: false, hint: 'Short title or subject line (optional)' },
  { key: 'customerEmail',label: 'Customer Email',  required: false, hint: 'Customer email for linking (optional)' },
  { key: 'source',       label: 'Source Channel',  required: false, hint: 'e.g. email, slack, portal (optional)' },
];

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

  // Column mapping state
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [csvTotalRows, setCsvTotalRows] = useState<number>(0);
  const [mapping, setMapping] = useState<CsvColumnMapping>({ feedbackText: '' });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setImportState('idle');
    setResult(null);
    setErrorMessage('');
    setCsvHeaders([]);
    setCsvPreview([]);
    setMapping({ feedbackText: '' });
  };

  // Step 1 → Step 2: parse headers
  const handleParseHeaders = async () => {
    if (!selectedFile) return;
    setImportState('parsing');
    setErrorMessage('');
    try {
      const res = await apiClient.feedback.parseCsvHeaders(workspaceId, selectedFile);
      setCsvHeaders(res.headers);
      setCsvPreview(res.preview);
      setCsvTotalRows(res.totalRows);
      // Auto-detect best column for feedbackText
      const autoText = res.headers.find((h) =>
        ['feedback', 'text', 'description', 'body', 'content', 'message', 'comment', 'title', 'subject', 'summary'].includes(h.toLowerCase())
      ) ?? res.headers[0] ?? '';
      setMapping({ feedbackText: autoText });
      setImportState('mapping');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err instanceof Error ? err.message : 'Failed to read CSV headers.');
      setErrorMessage(msg);
      setImportState('error');
    }
  };

  // Step 2 → Step 3: run import with mapping
  const handleSubmit = async () => {
    if (!selectedFile) return;
    if (!mapping.feedbackText) {
      setErrorMessage('Please select the column that contains the feedback text.');
      return;
    }
    setImportState('loading');
    setErrorMessage('');
    try {
      const res = await apiClient.feedback.importCsv(workspaceId, selectedFile, mapping);
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
    setCsvHeaders([]);
    setCsvPreview([]);
    setMapping({ feedbackText: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const stepIndex = importState === 'mapping' || importState === 'loading' ? 1 : importState === 'success' ? 2 : 0;

  return (
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
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '0.875rem',
          boxShadow: '0 8px 32px rgba(10,37,64,0.16)',
          width: '100%',
          maxWidth: importState === 'mapping' ? '36rem' : '28rem',
          padding: '1.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          transition: 'max-width 0.2s ease',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0A2540', marginBottom: '0.2rem' }}>
              Import CSV
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#6C757D' }}>
              {stepIndex === 0 && 'Step 1 of 2 — Select your CSV file'}
              {stepIndex === 1 && `Step 2 of 2 — Map columns (${csvTotalRows} rows detected)`}
              {stepIndex === 2 && 'Import complete'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C757D', fontSize: '1.25rem', lineHeight: 1, padding: '0.1rem 0.3rem' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Step indicator */}
        {importState !== 'success' && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {['Select File', 'Map Columns', 'Done'].map((label, i) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div
                  style={{
                    width: '1.4rem',
                    height: '1.4rem',
                    borderRadius: '50%',
                    background: i <= stepIndex ? '#20A4A4' : '#e9ecef',
                    color: i <= stepIndex ? '#fff' : '#adb5bd',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {i + 1}
                </div>
                <span style={{ fontSize: '0.75rem', color: i <= stepIndex ? '#0A2540' : '#adb5bd', fontWeight: i === stepIndex ? 700 : 400 }}>
                  {label}
                </span>
                {i < 2 && <span style={{ color: '#dee2e6', fontSize: '0.75rem' }}>›</span>}
              </div>
            ))}
          </div>
        )}

        {/* ── STEP 1: File picker ── */}
        {(importState === 'idle' || importState === 'parsing' || importState === 'error') && (
          <>
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
              Upload any CSV file — you will map columns in the next step. Max file size: <strong>10 MB</strong>.
            </div>

            <div>
              <label
                htmlFor="csv-file-input"
                style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0A2540', marginBottom: '0.4rem' }}
              >
                Select file
              </label>
              <input
                id="csv-file-input"
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                disabled={importState === 'parsing'}
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

            {importState === 'parsing' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#20A4A4', fontSize: '0.88rem', fontWeight: 600 }}>
                <span style={{ display: 'inline-block', width: '1rem', height: '1rem', border: '2px solid #20A4A4', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                Reading column headers…
              </div>
            )}

            {importState === 'error' && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#c0392b', fontWeight: 600 }}>
                {errorMessage || 'Failed to read the file. Please check the format and try again.'}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                onClick={onClose}
                disabled={importState === 'parsing'}
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #dee2e6', background: '#fff', color: '#0A2540', fontWeight: 600, fontSize: '0.85rem', cursor: importState === 'parsing' ? 'not-allowed' : 'pointer', opacity: importState === 'parsing' ? 0.6 : 1 }}
              >
                Cancel
              </button>
              <button
                onClick={handleParseHeaders}
                disabled={!selectedFile || importState === 'parsing'}
                style={{ padding: '0.5rem 1.1rem', borderRadius: '0.5rem', border: 'none', background: !selectedFile || importState === 'parsing' ? '#a0d4d4' : '#20A4A4', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: !selectedFile || importState === 'parsing' ? 'not-allowed' : 'pointer' }}
              >
                {importState === 'parsing' ? 'Reading…' : 'Next →'}
              </button>
            </div>
          </>
        )}

        {/* ── STEP 2: Column Mapping ── */}
        {(importState === 'mapping' || importState === 'loading') && (
          <>
            {/* Preview table */}
            {csvPreview.length > 0 && (
              <div style={{ overflowX: 'auto', borderRadius: '0.5rem', border: '1px solid #e9ecef' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      {csvHeaders.map((h) => (
                        <th key={h} style={{ padding: '0.4rem 0.6rem', textAlign: 'left', color: '#495057', fontWeight: 700, borderBottom: '1px solid #e9ecef', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f0f4f8' }}>
                        {csvHeaders.map((h) => (
                          <td key={h} style={{ padding: '0.35rem 0.6rem', color: '#6C757D', maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row[h] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Mapping selectors */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <p style={{ fontSize: '0.82rem', color: '#495057', margin: 0 }}>
                Map your CSV columns to TriageInsight fields:
              </p>
              {FIELD_LABELS.map(({ key, label, required, hint }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ flex: '0 0 9rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0A2540' }}>
                      {label}
                      {required && <span style={{ color: '#e53e3e', marginLeft: '0.2rem' }}>*</span>}
                    </span>
                    <p style={{ fontSize: '0.72rem', color: '#adb5bd', margin: '0.1rem 0 0' }}>{hint}</p>
                  </div>
                  <select
                    value={mapping[key] ?? ''}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [key]: e.target.value || undefined }))}
                    disabled={importState === 'loading'}
                    style={{
                      flex: 1,
                      padding: '0.4rem 0.6rem',
                      border: `1px solid ${required && !mapping[key] ? '#fca5a5' : '#dee2e6'}`,
                      borderRadius: '0.4rem',
                      fontSize: '0.82rem',
                      color: '#0A2540',
                      background: '#fff',
                      cursor: importState === 'loading' ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {!required && <option value="">— not mapped —</option>}
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {importState === 'loading' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#20A4A4', fontSize: '0.88rem', fontWeight: 600 }}>
                <span style={{ display: 'inline-block', width: '1rem', height: '1rem', border: '2px solid #20A4A4', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                Uploading and processing…
              </div>
            )}

            {errorMessage && importState !== 'loading' && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#c0392b', fontWeight: 600 }}>
                {errorMessage}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                onClick={() => { setImportState('idle'); setErrorMessage(''); }}
                disabled={importState === 'loading'}
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #dee2e6', background: '#fff', color: '#0A2540', fontWeight: 600, fontSize: '0.85rem', cursor: importState === 'loading' ? 'not-allowed' : 'pointer', opacity: importState === 'loading' ? 0.6 : 1 }}
              >
                ← Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!mapping.feedbackText || importState === 'loading'}
                style={{ padding: '0.5rem 1.1rem', borderRadius: '0.5rem', border: 'none', background: !mapping.feedbackText || importState === 'loading' ? '#a0d4d4' : '#20A4A4', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: !mapping.feedbackText || importState === 'loading' ? 'not-allowed' : 'pointer' }}
              >
                {importState === 'loading' ? 'Importing…' : `Import ${csvTotalRows} rows`}
              </button>
            </div>
          </>
        )}

        {/* ── STEP 3: Success ── */}
        {importState === 'success' && result && (
          <>
            <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '0.5rem', padding: '1rem', fontSize: '0.88rem', color: '#2e7d32' }}>
              <p style={{ fontWeight: 700, marginBottom: '0.35rem' }}>✓ Import complete</p>
              <p>
                <strong>{result.importedCount}</strong> rows imported
                {result.total > result.importedCount && (
                  <>, <strong>{result.total - result.importedCount}</strong> skipped</>
                )}.
              </p>
              <p style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: '#388e3c' }}>
                The AI pipeline is now running in the background. Themes will appear shortly.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                onClick={handleReset}
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #dee2e6', background: '#fff', color: '#0A2540', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Import another
              </button>
              <button
                onClick={onClose}
                style={{ padding: '0.5rem 1.1rem', borderRadius: '0.5rem', border: 'none', background: '#20A4A4', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>

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
  const [activeSecondarySource, setActiveSecondarySource] = useState<FeedbackSecondarySource | undefined>(undefined);
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

  // ── Bulk selection state (Step 3 Gap Fix) ─────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionState, setBulkActionState] = useState<'idle' | 'loading'>('idle');
  const [bulkAssignThemeId, setBulkAssignThemeId] = useState<string>('');

  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  const { role: memberRole } = useCurrentMemberRole();
  const canEdit = memberRole === WorkspaceRole.ADMIN || memberRole === WorkspaceRole.EDITOR;

  const { useFeedbackList } = useFeedback();
  const { data, isLoading, isError } = useFeedbackList({
    status: activeStatus,
    primarySource: activePrimarySource,
    secondarySource: activeSecondarySource,
    search: search || undefined,
    limit: 50,
  });

  const feedbackItems: Feedback[] = data?.pages[0]?.data ?? [];
  const total = data?.pages[0]?.total ?? 0;

  const handleBulkDismiss = async () => {
    if (selectedIds.size === 0) return;
    setBulkActionState('loading');
    try {
      await apiClient.feedback.bulkDismiss(workspaceId, Array.from(selectedIds));
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['feedback', workspaceId] });
    } finally {
      setBulkActionState('idle');
    }
  };

  const handleBulkAssign = async () => {
    if (selectedIds.size === 0 || !bulkAssignThemeId) return;
    setBulkActionState('loading');
    try {
      await apiClient.feedback.bulkAssign(workspaceId, Array.from(selectedIds), bulkAssignThemeId);
      setSelectedIds(new Set());
      setBulkAssignThemeId('');
      queryClient.invalidateQueries({ queryKey: ['feedback', workspaceId] });
    } finally {
      setBulkActionState('idle');
    }
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = () => {
    if (selectedIds.size === feedbackItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(feedbackItems.map((f) => f.id)));
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1rem' }}>
      {/* CSV Import Modal */}
      {showCsvModal && (
        <CsvImportModal
          workspaceId={workspaceId}
          onClose={() => setShowCsvModal(false)}
          onImported={(batchId) => {
            setCurrentBatchId(batchId);
            setShowCsvModal(false);
            queryClient.invalidateQueries({ queryKey: ['feedback', workspaceId] });
          }}
        />
      )}

      {/* AI Pipeline Progress overlay */}
      {currentBatchId && (
        <AIPipelineProgress
          workspaceId={workspaceId}
          batchId={currentBatchId}
          onComplete={() => {
            setCurrentBatchId(undefined);
            queryClient.invalidateQueries({ queryKey: ['feedback', workspaceId] });
          }}
        />
      )}

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0A2540', marginBottom: '0.25rem' }}>
            Feedback Inbox
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#6C757D' }}>
            {total > 0 ? `${total} items` : 'No feedback yet'}
          </p>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowCsvModal(true)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                border: '1px solid #20A4A4',
                background: '#fff',
                color: '#20A4A4',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              ↑ Import CSV
            </button>
            <button
              onClick={async () => {
                setPipelineState('loading');
                try {
                  const res = await apiClient.feedback.reprocessPipeline(workspaceId);
                  setPipelineResult(res);
                  setPipelineState('done');
                  markPipelineStarted(workspaceId);
                } catch {
                  setPipelineState('error');
                }
              }}
              disabled={pipelineState === 'loading'}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                border: '1px solid #dee2e6',
                background: '#fff',
                color: '#0A2540',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: pipelineState === 'loading' ? 'not-allowed' : 'pointer',
                opacity: pipelineState === 'loading' ? 0.6 : 1,
              }}
            >
              {pipelineState === 'loading' ? '⟳ Running…' : '⟳ Re-run AI'}
            </button>
          </div>
        )}
      </div>

      {/* Pipeline result toast */}
      {pipelineState === 'done' && pipelineResult && (
        <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#2e7d32', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✓ AI pipeline triggered — {pipelineResult.enqueued} items enqueued.</span>
          <button onClick={() => setPipelineState('idle')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2e7d32', fontSize: '1rem' }}>×</button>
        </div>
      )}

      {/* Primary source tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {PRIMARY_SOURCE_TABS.map((tab) => (
          <button
            key={tab.label}
            onClick={() => { setActivePrimarySource(tab.value); setActiveSecondarySource(undefined); }}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '2rem',
              border: '1px solid',
              borderColor: activePrimarySource === tab.value ? '#20A4A4' : '#dee2e6',
              background: activePrimarySource === tab.value ? '#e8f7f7' : '#fff',
              color: activePrimarySource === tab.value ? '#20A4A4' : '#6C757D',
              fontWeight: activePrimarySource === tab.value ? 700 : 400,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* Status tabs + secondary source filter row */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map((tab) => (
          <button
            key={tab.label}
            onClick={() => setActiveStatus(tab.value)}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '0.4rem',
              border: '1px solid',
              borderColor: activeStatus === tab.value ? '#0A2540' : '#dee2e6',
              background: activeStatus === tab.value ? '#0A2540' : '#fff',
              color: activeStatus === tab.value ? '#fff' : '#6C757D',
              fontWeight: activeStatus === tab.value ? 700 : 400,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <select
            value={activeSecondarySource ?? ''}
            onChange={(e) => setActiveSecondarySource((e.target.value as FeedbackSecondarySource) || undefined)}
            style={{ padding: '0.35rem 0.6rem', border: '1px solid #dee2e6', borderRadius: '0.4rem', fontSize: '0.8rem', color: '#0A2540', background: '#fff', cursor: 'pointer' }}
          >
            <option value="">All channels</option>
            {(activePrimarySource ? SECONDARY_SOURCE_BY_PRIMARY[activePrimarySource] : ALL_SECONDARY_SOURCES).map((s) => (
              <option key={s} value={s}>{SECONDARY_SOURCE_LABELS[s] ?? s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Search feedback…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '0.55rem 0.85rem',
            border: '1px solid #dee2e6',
            borderRadius: '0.5rem',
            fontSize: '0.88rem',
            color: '#0A2540',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Select-all header */}
      {canEdit && feedbackItems.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem', padding: '0 0.25rem' }}>
          <input
            type="checkbox"
            checked={selectedIds.size === feedbackItems.length && feedbackItems.length > 0}
            onChange={toggleSelectAll}
            style={{ cursor: 'pointer', width: '1rem', height: '1rem' }}
          />
          <span style={{ fontSize: '0.8rem', color: '#6C757D' }}>
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
          </span>
        </div>
      )}

      {/* Feedback list */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6C757D' }}>Loading…</div>
      ) : isError ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#c0392b' }}>Failed to load feedback.</div>
      ) : feedbackItems.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '3rem', color: '#6C757D' }}>
          <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0A2540', marginBottom: '0.5rem' }}>No feedback yet</p>
          <p style={{ fontSize: '0.88rem' }}>Import a CSV file or connect an integration to get started.</p>
          {canEdit && (
            <button
              onClick={() => setShowCsvModal(true)}
              style={{ marginTop: '1rem', padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: '#20A4A4', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}
            >
              ↑ Import CSV
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {feedbackItems.map((item) => {
            const statusColor = STATUS_COLORS[item.status] ?? { bg: '#f0f4f8', color: '#6C757D' };
            const primaryColor = item.primarySource ? PRIMARY_SOURCE_COLORS[item.primarySource] : undefined;
            const isSelected = selectedIds.has(item.id);
            return (
              <div
                key={item.id}
                style={{
                  ...CARD,
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  gap: '0.75rem',
                  alignItems: 'flex-start',
                  outline: isSelected ? '2px solid #20A4A4' : 'none',
                  outlineOffset: '-2px',
                }}
              >
                {canEdit && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(item.id)}
                    style={{ cursor: 'pointer', marginTop: '0.2rem', width: '1rem', height: '1rem', flexShrink: 0 }}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                    <Link
                      href={r.inboxItem(item.id)}
                      style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0A2540', textDecoration: 'none', flex: 1, minWidth: 0 }}
                    >
                      {item.title || 'Untitled'}
                    </Link>
                    <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap' }}>
                      {primaryColor && item.primarySource && (
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '1rem', background: primaryColor.bg, color: primaryColor.color, border: `1px solid ${primaryColor.border}` }}>
                          {item.primarySource}
                        </span>
                      )}
                      {item.secondarySource && (
                        <span style={{ fontSize: '0.72rem', fontWeight: 500, padding: '0.15rem 0.5rem', borderRadius: '1rem', background: '#f0f4f8', color: '#495057', border: '1px solid #dee2e6' }}>
                          {SECONDARY_SOURCE_LABELS[item.secondarySource] ?? item.secondarySource}
                        </span>
                      )}
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '1rem', background: statusColor.bg, color: statusColor.color }}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                  {item.description && (
                    <p style={{ fontSize: '0.83rem', color: '#495057', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {item.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    {item.sentiment !== null && item.sentiment !== undefined && (
                      <span style={{ fontSize: '0.75rem', color: item.sentiment > 0.2 ? '#2e7d32' : item.sentiment < -0.2 ? '#c0392b' : '#6C757D' }}>
                        Sentiment: {item.sentiment > 0 ? '+' : ''}{item.sentiment.toFixed(2)}
                      </span>
                    )}
                    <span style={{ fontSize: '0.75rem', color: '#adb5bd' }}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                    {(item.themes as ThemeFeedback[] | undefined)?.length ? (
                      <span style={{ fontSize: '0.75rem', color: '#20A4A4', fontWeight: 600 }}>
                        {(item.themes as ThemeFeedback[]).length} theme{(item.themes as ThemeFeedback[]).length > 1 ? 's' : ''}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && canEdit && (
        <div
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#0A2540',
            color: '#fff',
            borderRadius: '2rem',
            padding: '0.6rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            boxShadow: '0 4px 20px rgba(10,37,64,0.3)',
            zIndex: 200,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{selectedIds.size} selected</span>
          <button
            onClick={handleBulkDismiss}
            disabled={bulkActionState === 'loading'}
            style={{ padding: '0.35rem 0.85rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 600, fontSize: '0.82rem', cursor: bulkActionState === 'loading' ? 'not-allowed' : 'pointer', opacity: bulkActionState === 'loading' ? 0.6 : 1 }}
          >
            Archive
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <input
              type="text"
              placeholder="Theme ID…"
              value={bulkAssignThemeId}
              onChange={(e) => setBulkAssignThemeId(e.target.value)}
              style={{ padding: '0.3rem 0.6rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.8rem', width: '8rem', outline: 'none' }}
            />
            <button
              onClick={handleBulkAssign}
              disabled={!bulkAssignThemeId || bulkActionState === 'loading'}
              style={{ padding: '0.35rem 0.85rem', borderRadius: '1rem', border: 'none', background: '#20A4A4', color: '#fff', fontWeight: 600, fontSize: '0.82rem', cursor: !bulkAssignThemeId || bulkActionState === 'loading' ? 'not-allowed' : 'pointer', opacity: !bulkAssignThemeId || bulkActionState === 'loading' ? 0.6 : 1 }}
            >
              Assign to Theme
            </button>
          </div>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '0.1rem 0.3rem' }}
            aria-label="Clear selection"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
