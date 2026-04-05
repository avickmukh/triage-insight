'use client';
/**
 * Inbox — v2 (UX Redesign)
 *
 * Changes from v1 (Feedback Inbox):
 * ─────────────────────────────────────────────────────────────────────────────
 * Step 1  — Renamed "Feedback Inbox" → "Inbox" everywhere (title, header, nav)
 * Step 2  — Empty state redesign: icon + "No data yet" + 3-tier CTAs
 *           (Connect Integration / Import CSV / Use Sample Data)
 * Step 3  — Header cleanup: consistent button group [Connect] [Import CSV] [Re-run AI]
 * Step 4  — Filter bar: Primary source tabs + Status tabs + Channel dropdown
 * Step 5  — Search bar: full-width, improved placeholder + hint text
 * Step 6  — Row layout: LEFT text | MIDDLE theme+source | RIGHT CIQ+priority+ARR
 * Step 7  — Bulk action bar: smooth animation, Merge / Assign / Dismiss actions
 * Step 8  — Microcopy: "No data yet", "Upload your data", confident tone
 * Step 9  — Visual polish: p-6 cards, rounded-2xl, subtle shadows, breathing space
 * Step 10 — Validation: first-time user understands in 5 seconds, clear CTAs
 */

import { useRef, useState, useCallback } from 'react';
import { useFeedback } from '@/hooks/use-feedback';
import { useWorkspace, useCurrentMemberRole } from '@/hooks/use-workspace';
import {
  Feedback,
  FeedbackPrimarySource,
  FeedbackSecondarySource,
  FeedbackSourceType,
  FeedbackStatus,
  SemanticSearchResult,
  ThemeFeedback,
  WorkspaceRole,
} from '@/lib/api-types';
import apiClient from '@/lib/api-client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { appRoutes } from '@/lib/routes';
import { useQueryClient } from '@tanstack/react-query';
import { AIPipelineProgress, markPipelineStarted } from '@/components/pipeline/AIPipelineProgress';

// ─── Design tokens ────────────────────────────────────────────────────────────
const NAVY  = '#0A2540';
const TEAL  = '#20A4A4';
const GREY  = '#6C757D';
const LIGHT = '#F8F9FA';
const BORDER = '#e9ecef';

const CARD: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: '1rem',
  padding: '1.5rem',
  boxShadow: '0 1px 6px rgba(10,37,64,0.06)',
};

// ─── Status colours ───────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  [FeedbackStatus.NEW]:       { bg: '#e8f7f7', color: TEAL },
  [FeedbackStatus.IN_REVIEW]: { bg: '#fff8e1', color: '#b8860b' },
  [FeedbackStatus.PROCESSED]: { bg: '#e8f5e9', color: '#2e7d32' },
  [FeedbackStatus.ARCHIVED]:  { bg: '#f0f4f8', color: GREY },
  [FeedbackStatus.MERGED]:    { bg: '#fce8ff', color: '#7c3aed' },
};

// ─── Priority helpers ─────────────────────────────────────────────────────────
function getPriority(ciqScore?: number | null): { label: string; bg: string; color: string } {
  if (!ciqScore) return { label: 'Low',    bg: '#f0f4f8', color: GREY };
  if (ciqScore >= 70) return { label: 'High',   bg: '#fef2f2', color: '#c0392b' };
  if (ciqScore >= 40) return { label: 'Medium', bg: '#fff8e1', color: '#b8860b' };
  return                      { label: 'Low',    bg: '#f0f4f8', color: GREY };
}

// ─── Source labels ────────────────────────────────────────────────────────────
const SOURCE_LABELS: Record<string, string> = {
  [FeedbackSourceType.MANUAL]:       'Manual',
  [FeedbackSourceType.PUBLIC_PORTAL]:'Portal',
  [FeedbackSourceType.EMAIL]:        'Email',
  [FeedbackSourceType.SLACK]:        'Slack',
  [FeedbackSourceType.CSV_IMPORT]:   'CSV',
  [FeedbackSourceType.VOICE]:        'Voice',
  [FeedbackSourceType.API]:          'API',
};

const SECONDARY_SOURCE_LABELS: Record<string, string> = {
  [FeedbackSecondarySource.MANUAL]:     'Manual',
  [FeedbackSecondarySource.CSV_UPLOAD]: 'CSV',
  [FeedbackSecondarySource.PORTAL]:     'Portal',
  [FeedbackSecondarySource.EMAIL]:      'Email',
  [FeedbackSecondarySource.SLACK]:      'Slack',
  [FeedbackSecondarySource.ZENDESK]:    'Zendesk',
  [FeedbackSecondarySource.INTERCOM]:   'Intercom',
  [FeedbackSecondarySource.API]:        'API',
  [FeedbackSecondarySource.WEBHOOK]:    'Webhook',
  [FeedbackSecondarySource.TRANSCRIPT]: 'Transcript',
  [FeedbackSecondarySource.IMPORT]:     'Import',
  [FeedbackSecondarySource.OTHER]:      'Other',
};

// ─── Source tabs ──────────────────────────────────────────────────────────────
const PRIMARY_SOURCE_TABS: { label: string; value: FeedbackPrimarySource | undefined; icon: string }[] = [
  { label: 'All Sources', value: undefined,                          icon: '◈' },
  { label: 'Feedback',    value: FeedbackPrimarySource.FEEDBACK,    icon: '💬' },
  { label: 'Support',     value: FeedbackPrimarySource.SUPPORT,     icon: '🎧' },
  { label: 'Survey',      value: FeedbackPrimarySource.SURVEY,      icon: '📋' },
  { label: 'Voice',       value: FeedbackPrimarySource.VOICE,       icon: '🎙' },
];

const PRIMARY_SOURCE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  [FeedbackPrimarySource.FEEDBACK]: { bg: '#e8f7f7', color: TEAL,      border: '#b2dfdb' },
  [FeedbackPrimarySource.VOICE]:    { bg: '#e8f0fe', color: '#1a73e8', border: '#c5d8fb' },
  [FeedbackPrimarySource.SURVEY]:   { bg: '#fff8e1', color: '#b8860b', border: '#ffe082' },
  [FeedbackPrimarySource.SUPPORT]:  { bg: '#fce8ff', color: '#7c3aed', border: '#e9d5ff' },
};

const SECONDARY_SOURCE_BY_PRIMARY: Record<string, FeedbackSecondarySource[]> = {
  [FeedbackPrimarySource.FEEDBACK]: [
    FeedbackSecondarySource.MANUAL, FeedbackSecondarySource.CSV_UPLOAD,
    FeedbackSecondarySource.PORTAL, FeedbackSecondarySource.EMAIL,
    FeedbackSecondarySource.SLACK,  FeedbackSecondarySource.API,
    FeedbackSecondarySource.WEBHOOK, FeedbackSecondarySource.IMPORT, FeedbackSecondarySource.OTHER,
  ],
  [FeedbackPrimarySource.VOICE]:   [FeedbackSecondarySource.TRANSCRIPT, FeedbackSecondarySource.MANUAL, FeedbackSecondarySource.OTHER],
  [FeedbackPrimarySource.SURVEY]:  [FeedbackSecondarySource.MANUAL, FeedbackSecondarySource.API, FeedbackSecondarySource.IMPORT, FeedbackSecondarySource.OTHER],
  [FeedbackPrimarySource.SUPPORT]: [FeedbackSecondarySource.ZENDESK, FeedbackSecondarySource.INTERCOM, FeedbackSecondarySource.EMAIL, FeedbackSecondarySource.WEBHOOK, FeedbackSecondarySource.API, FeedbackSecondarySource.OTHER],
};

const ALL_SECONDARY_SOURCES: FeedbackSecondarySource[] = Object.values(FeedbackSecondarySource);

const STATUS_TABS: { label: string; value: FeedbackStatus | undefined }[] = [
  { label: 'All',       value: undefined },
  { label: 'New',       value: FeedbackStatus.NEW },
  { label: 'In Review', value: FeedbackStatus.IN_REVIEW },
  { label: 'Processed', value: FeedbackStatus.PROCESSED },
  { label: 'Archived',  value: FeedbackStatus.ARCHIVED },
];

// ─── CSV Import Modal (3-step wizard) ─────────────────────────────────────────
type ImportState = 'idle' | 'parsing' | 'mapping' | 'loading' | 'success' | 'error';

interface CsvImportResult { importedCount: number; total: number; batchId: string; }
interface CsvColumnMapping { feedbackText: string; title?: string; customerEmail?: string; source?: string; }

const FIELD_LABELS: { key: keyof CsvColumnMapping; label: string; required: boolean; hint: string }[] = [
  { key: 'feedbackText',  label: 'Feedback Text',   required: true,  hint: 'The main feedback content (required)' },
  { key: 'title',         label: 'Title / Subject', required: false, hint: 'Short title or subject line (optional)' },
  { key: 'customerEmail', label: 'Customer Email',  required: false, hint: 'Customer email for linking (optional)' },
  { key: 'source',        label: 'Source Channel',  required: false, hint: 'e.g. email, slack, portal (optional)' },
];

function CsvImportModal({ workspaceId, onClose, onImported }: { workspaceId: string; onClose: () => void; onImported: (batchId: string) => void; }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importState, setImportState]   = useState<ImportState>('idle');
  const [result, setResult]             = useState<CsvImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [csvHeaders, setCsvHeaders]     = useState<string[]>([]);
  const [csvPreview, setCsvPreview]     = useState<Record<string, string>[]>([]);
  const [csvTotalRows, setCsvTotalRows] = useState<number>(0);
  const [mapping, setMapping]           = useState<CsvColumnMapping>({ feedbackText: '' });

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

  const handleParseHeaders = async () => {
    if (!selectedFile) return;
    setImportState('parsing');
    setErrorMessage('');
    try {
      const res = await apiClient.feedback.parseCsvHeaders(workspaceId, selectedFile);
      setCsvHeaders(res.headers);
      setCsvPreview(res.preview);
      setCsvTotalRows(res.totalRows);
      const autoText = res.headers.find((h) =>
        ['feedback', 'text', 'description', 'body', 'content', 'message', 'comment', 'title', 'subject', 'summary'].includes(h.toLowerCase())
      ) ?? res.headers[0] ?? '';
      setMapping({ feedbackText: autoText });
      setImportState('mapping');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (err instanceof Error ? err.message : 'Failed to read CSV headers.');
      setErrorMessage(msg);
      setImportState('error');
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;
    if (!mapping.feedbackText) { setErrorMessage('Please select the column that contains the feedback text.'); return; }
    setImportState('loading');
    setErrorMessage('');
    try {
      const res = await apiClient.feedback.importCsv(workspaceId, selectedFile, mapping);
      setResult(res);
      setImportState('success');
      markPipelineStarted(workspaceId, res.batchId);
      onImported(res.batchId);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setErrorMessage(msg);
      setImportState('error');
    }
  };

  const handleReset = () => {
    setSelectedFile(null); setImportState('idle'); setResult(null); setErrorMessage('');
    setCsvHeaders([]); setCsvPreview([]); setMapping({ feedbackText: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const stepIndex = importState === 'mapping' || importState === 'loading' ? 1 : importState === 'success' ? 2 : 0;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,37,64,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '1rem', boxShadow: '0 12px 40px rgba(10,37,64,0.18)', width: '100%', maxWidth: importState === 'mapping' ? '38rem' : '30rem', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', transition: 'max-width 0.2s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: NAVY, marginBottom: '0.2rem' }}>Upload your data</h2>
            <p style={{ fontSize: '0.82rem', color: GREY }}>
              {stepIndex === 0 && 'Step 1 of 2 — Select your CSV file'}
              {stepIndex === 1 && `Step 2 of 2 — Map columns (${csvTotalRows} rows detected)`}
              {stepIndex === 2 && 'Import complete'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: GREY, fontSize: '1.25rem', lineHeight: 1, padding: '0.1rem 0.3rem' }} aria-label="Close">×</button>
        </div>

        {importState !== 'success' && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {['Select File', 'Map Columns', 'Done'].map((label, i) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ width: '1.4rem', height: '1.4rem', borderRadius: '50%', background: i <= stepIndex ? TEAL : BORDER, color: i <= stepIndex ? '#fff' : '#adb5bd', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
                <span style={{ fontSize: '0.75rem', color: i <= stepIndex ? NAVY : '#adb5bd', fontWeight: i === stepIndex ? 700 : 400 }}>{label}</span>
                {i < 2 && <span style={{ color: BORDER, fontSize: '0.75rem' }}>›</span>}
              </div>
            ))}
          </div>
        )}

        {(importState === 'idle' || importState === 'parsing' || importState === 'error') && (
          <>
            <div style={{ background: LIGHT, borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#495057', lineHeight: 1.6 }}>
              Upload any CSV file — you will map columns in the next step. Max file size: <strong>10 MB</strong>.
            </div>
            <div>
              <label htmlFor="csv-file-input" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: NAVY, marginBottom: '0.4rem' }}>Select file</label>
              <input id="csv-file-input" ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} disabled={importState === 'parsing'} style={{ display: 'block', width: '100%', fontSize: '0.85rem', color: NAVY, padding: '0.45rem 0.6rem', border: `1px solid ${BORDER}`, borderRadius: '0.5rem', background: '#fff', cursor: 'pointer' }} />
              {selectedFile && <p style={{ fontSize: '0.78rem', color: GREY, marginTop: '0.3rem' }}>{selectedFile.name} &mdash; {(selectedFile.size / 1024).toFixed(1)} KB</p>}
            </div>
            {importState === 'parsing' && <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: TEAL, fontSize: '0.88rem', fontWeight: 600 }}><span style={{ display: 'inline-block', width: '1rem', height: '1rem', border: `2px solid ${TEAL}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Reading column headers…</div>}
            {importState === 'error' && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#c0392b', fontWeight: 600 }}>{errorMessage || 'Failed to read the file. Please check the format and try again.'}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button onClick={onClose} disabled={importState === 'parsing'} style={{ padding: '0.55rem 1.1rem', borderRadius: '0.5rem', border: `1px solid ${BORDER}`, background: '#fff', color: NAVY, fontWeight: 600, fontSize: '0.85rem', cursor: importState === 'parsing' ? 'not-allowed' : 'pointer', opacity: importState === 'parsing' ? 0.6 : 1 }}>Cancel</button>
              <button onClick={handleParseHeaders} disabled={!selectedFile || importState === 'parsing'} style={{ padding: '0.55rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: !selectedFile || importState === 'parsing' ? '#a0d4d4' : TEAL, color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: !selectedFile || importState === 'parsing' ? 'not-allowed' : 'pointer' }}>{importState === 'parsing' ? 'Reading…' : 'Next →'}</button>
            </div>
          </>
        )}

        {(importState === 'mapping' || importState === 'loading') && (
          <>
            {csvPreview.length > 0 && (
              <div style={{ overflowX: 'auto', borderRadius: '0.5rem', border: `1px solid ${BORDER}` }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <thead><tr style={{ background: LIGHT }}>{csvHeaders.map((h) => <th key={h} style={{ padding: '0.4rem 0.6rem', textAlign: 'left', color: '#495057', fontWeight: 700, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>{csvPreview.map((row, i) => <tr key={i} style={{ borderBottom: `1px solid ${LIGHT}` }}>{csvHeaders.map((h) => <td key={h} style={{ padding: '0.35rem 0.6rem', color: GREY, maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[h] ?? ''}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <p style={{ fontSize: '0.82rem', color: '#495057', margin: 0 }}>Map your CSV columns to TriageInsight fields:</p>
              {FIELD_LABELS.map(({ key, label, required, hint }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ flex: '0 0 9rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: NAVY }}>{label}{required && <span style={{ color: '#e53e3e', marginLeft: '0.2rem' }}>*</span>}</span>
                    <p style={{ fontSize: '0.72rem', color: '#adb5bd', margin: '0.1rem 0 0' }}>{hint}</p>
                  </div>
                  <select value={mapping[key] ?? ''} onChange={(e) => setMapping((prev) => ({ ...prev, [key]: e.target.value || undefined }))} disabled={importState === 'loading'} style={{ flex: 1, padding: '0.4rem 0.6rem', border: `1px solid ${required && !mapping[key] ? '#fca5a5' : BORDER}`, borderRadius: '0.4rem', fontSize: '0.82rem', color: NAVY, background: '#fff', cursor: importState === 'loading' ? 'not-allowed' : 'pointer' }}>
                    {!required && <option value="">— not mapped —</option>}
                    {csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {importState === 'loading' && <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: TEAL, fontSize: '0.88rem', fontWeight: 600 }}><span style={{ display: 'inline-block', width: '1rem', height: '1rem', border: `2px solid ${TEAL}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Uploading and processing…</div>}
            {errorMessage && importState !== 'loading' && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#c0392b', fontWeight: 600 }}>{errorMessage}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button onClick={() => { setImportState('idle'); setErrorMessage(''); }} disabled={importState === 'loading'} style={{ padding: '0.55rem 1.1rem', borderRadius: '0.5rem', border: `1px solid ${BORDER}`, background: '#fff', color: NAVY, fontWeight: 600, fontSize: '0.85rem', cursor: importState === 'loading' ? 'not-allowed' : 'pointer', opacity: importState === 'loading' ? 0.6 : 1 }}>← Back</button>
              <button onClick={handleSubmit} disabled={!mapping.feedbackText || importState === 'loading'} style={{ padding: '0.55rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: !mapping.feedbackText || importState === 'loading' ? '#a0d4d4' : TEAL, color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: !mapping.feedbackText || importState === 'loading' ? 'not-allowed' : 'pointer' }}>{importState === 'loading' ? 'Importing…' : `Import ${csvTotalRows} rows`}</button>
            </div>
          </>
        )}

        {importState === 'success' && result && (
          <>
            <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '0.5rem', padding: '1rem', fontSize: '0.88rem', color: '#2e7d32' }}>
              <p style={{ fontWeight: 700, marginBottom: '0.35rem' }}>✓ Import complete</p>
              <p><strong>{result.importedCount}</strong> rows imported{result.total > result.importedCount && <>, <strong>{result.total - result.importedCount}</strong> skipped</>}.</p>
              <p style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: '#388e3c' }}>The AI pipeline is now running in the background. Themes will appear shortly.</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button onClick={handleReset} style={{ padding: '0.55rem 1.1rem', borderRadius: '0.5rem', border: `1px solid ${BORDER}`, background: '#fff', color: NAVY, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Import another</button>
              <button onClick={onClose} style={{ padding: '0.55rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: TEAL, color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>Done</button>
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ canEdit, onImport, orgSlug }: { canEdit: boolean; onImport: () => void; orgSlug: string }) {
  return (
    <div style={{ ...CARD, textAlign: 'center', padding: '4rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
      {/* Illustration */}
      <div style={{ width: 72, height: 72, borderRadius: '1.25rem', background: '#e8f7f7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.25rem' }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
          <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
        </svg>
      </div>

      <div>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: NAVY, marginBottom: '0.5rem' }}>No data yet</h2>
        <p style={{ fontSize: '0.95rem', color: GREY, maxWidth: '26rem', lineHeight: 1.6 }}>
          Connect your tools or upload data to start seeing insights.
        </p>
      </div>

      {canEdit && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', width: '100%', maxWidth: '18rem' }}>
          {/* Primary CTA */}
          <Link
            href={`/${orgSlug}/admin/integrations`}
            style={{ display: 'block', width: '100%', padding: '0.75rem 1.5rem', borderRadius: '0.75rem', border: 'none', background: TEAL, color: '#fff', fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none', textAlign: 'center', boxShadow: '0 2px 8px rgba(32,164,164,0.25)' }}
          >
            Connect Integration
          </Link>
          {/* Secondary CTA */}
          <button
            onClick={onImport}
            style={{ width: '100%', padding: '0.7rem 1.5rem', borderRadius: '0.75rem', border: `2px solid ${TEAL}`, background: '#fff', color: TEAL, fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}
          >
            Import CSV
          </button>
          {/* Tertiary CTA */}
          <button
            onClick={onImport}
            style={{ background: 'none', border: 'none', color: GREY, fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline', padding: '0.25rem' }}
          >
            Use Sample Data
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Feedback Row ─────────────────────────────────────────────────────────────
function FeedbackRow({
  item,
  isSelected,
  canEdit,
  onToggle,
  inboxItemHref,
}: {
  item: Feedback;
  isSelected: boolean;
  canEdit: boolean;
  onToggle: () => void;
  inboxItemHref: string;
}) {
  const statusColor  = STATUS_COLORS[item.status] ?? { bg: '#f0f4f8', color: GREY };
  const primaryColor = item.primarySource ? PRIMARY_SOURCE_COLORS[item.primarySource] : undefined;
  const themes       = (item.themes as ThemeFeedback[] | undefined) ?? [];
  // Use the linked theme's canonical CIQ score for the badge.
  // This is the same score shown on Theme Ranking / Theme Detail pages.
  // Feedback.ciqScore is a feedback-level urgency signal — it is intentionally
  // different from Theme CIQ and should not be shown as "CIQ" in the Inbox.
  const linkedThemeCiqScore = themes[0]?.theme?.ciqScore ?? null;
  const priority     = getPriority(linkedThemeCiqScore);
  const ciqScore     = linkedThemeCiqScore != null ? Math.round(linkedThemeCiqScore) : null;
  const arr          = (item as Feedback & { revenueInfluence?: number }).revenueInfluence;

  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${isSelected ? TEAL : BORDER}`,
        borderRadius: '1rem',
        padding: '1rem 1.25rem',
        display: 'grid',
        gridTemplateColumns: canEdit ? '1.25rem 1fr auto' : '1fr auto',
        gap: '0.75rem',
        alignItems: 'center',
        boxShadow: isSelected ? `0 0 0 2px ${TEAL}22` : '0 1px 4px rgba(10,37,64,0.05)',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
      }}
      onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 10px rgba(10,37,64,0.1)'; }}
      onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(10,37,64,0.05)'; }}
    >
      {/* Checkbox */}
      {canEdit && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: 'pointer', width: '1rem', height: '1rem', accentColor: TEAL, flexShrink: 0 }}
        />
      )}

      {/* LEFT + MIDDLE: text, theme badge, source */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
          <Link href={inboxItemHref} style={{ fontSize: '0.9rem', fontWeight: 700, color: NAVY, textDecoration: 'none', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.title || 'Untitled'}
          </Link>
        </div>
        {item.description && (
          <p style={{ fontSize: '0.82rem', color: '#495057', margin: '0 0 0.4rem', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {item.description}
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Theme badges */}
          {themes.slice(0, 2).map((tf) => (
            <span key={tf.themeId} style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '1rem', background: '#e8f7f7', color: TEAL, border: `1px solid #b2dfdb` }}>
              {(tf as ThemeFeedback & { theme?: { name?: string } }).theme?.name ?? 'Theme'}
            </span>
          ))}
          {/* Source badge */}
          {primaryColor && item.primarySource && (
            <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '1rem', background: primaryColor.bg, color: primaryColor.color, border: `1px solid ${primaryColor.border}` }}>
              {item.primarySource}
            </span>
          )}
          {item.secondarySource && (
            <span style={{ fontSize: '0.7rem', fontWeight: 500, padding: '0.15rem 0.5rem', borderRadius: '1rem', background: LIGHT, color: '#495057', border: `1px solid ${BORDER}` }}>
              {SECONDARY_SOURCE_LABELS[item.secondarySource] ?? item.secondarySource}
            </span>
          )}
          {/* Status */}
          <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '1rem', background: statusColor.bg, color: statusColor.color }}>
            {item.status}
          </span>
          <span style={{ fontSize: '0.72rem', color: '#adb5bd', marginLeft: 'auto' }}>
            {new Date(item.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* RIGHT: CIQ score + priority + ARR */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem', flexShrink: 0 }}>
        {ciqScore != null ? (
          <span
            title="Theme CIQ: canonical signal intelligence score for the linked theme (0–100). Same value shown on Theme Ranking and Theme Detail pages."
            style={{ fontSize: '0.75rem', fontWeight: 800, padding: '0.2rem 0.6rem', borderRadius: '1rem', background: '#e8f7f7', color: TEAL, border: `1px solid #b2dfdb`, whiteSpace: 'nowrap', cursor: 'help' }}
          >
            CIQ {ciqScore}
          </span>
        ) : (
          <span
            title="Theme CIQ not yet computed — score will appear once this feedback is assigned to a theme and the AI pipeline has run."
            style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '1rem', background: '#f8f9fa', color: '#adb5bd', border: '1px solid #dee2e6', whiteSpace: 'nowrap', cursor: 'help' }}
          >
            CIQ —
          </span>
        )}
        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '1rem', background: priority.bg, color: priority.color }}>
          {priority.label}
        </span>
        {arr != null && arr > 0 && (
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#2e7d32', whiteSpace: 'nowrap' }}>
            ${arr.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function InboxPage() {
  const params   = useParams();
  const slug     = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';
  const r        = appRoutes(slug);

  const [activeStatus,          setActiveStatus]          = useState<FeedbackStatus | undefined>(undefined);
  const [activePrimarySource,   setActivePrimarySource]   = useState<FeedbackPrimarySource | undefined>(undefined);
  const [activeSecondarySource, setActiveSecondarySource] = useState<FeedbackSecondarySource | undefined>(undefined);
  const [search,                setSearch]                = useState('');
  const [showCsvModal,          setShowCsvModal]          = useState(false);
  const [currentBatchId,        setCurrentBatchId]        = useState<string | undefined>(undefined);
  const [showSearchHint,        setShowSearchHint]        = useState(false);

  // Pipeline re-trigger
  const [pipelineState,  setPipelineState]  = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [pipelineResult, setPipelineResult] = useState<{ enqueued: number; total: number } | null>(null);

  // Semantic search (kept for future use)
  const [aiMode,    setAiMode]    = useState(false);
  const [aiResults, setAiResults] = useState<SemanticSearchResult[] | null>(null);

  // Bulk selection
  const [selectedIds,      setSelectedIds]      = useState<Set<string>>(new Set());
  const [bulkActionState,  setBulkActionState]  = useState<'idle' | 'loading'>('idle');
  const [bulkAssignThemeId, setBulkAssignThemeId] = useState<string>('');

  const queryClient = useQueryClient();
  const { workspace }     = useWorkspace();
  const workspaceId       = workspace?.id ?? '';
  const { role: memberRole } = useCurrentMemberRole();
  const canEdit = memberRole === WorkspaceRole.ADMIN || memberRole === WorkspaceRole.EDITOR;

  const { useFeedbackList } = useFeedback();
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFeedbackList({
    status:          activeStatus,
    primarySource:   activePrimarySource,
    secondarySource: activeSecondarySource,
    search:          search || undefined,
    limit:           50,
  });

  // Flatten all loaded pages into a single list
  const feedbackItems: Feedback[] = data?.pages.flatMap((p) => p.data) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  const handleBulkDismiss = async () => {
    if (selectedIds.size === 0) return;
    setBulkActionState('loading');
    try {
      await apiClient.feedback.bulkDismiss(workspaceId, Array.from(selectedIds));
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['feedback', workspaceId] });
    } finally { setBulkActionState('idle'); }
  };

  const handleBulkAssign = async () => {
    if (selectedIds.size === 0 || !bulkAssignThemeId) return;
    setBulkActionState('loading');
    try {
      await apiClient.feedback.bulkAssign(workspaceId, Array.from(selectedIds), bulkAssignThemeId);
      setSelectedIds(new Set()); setBulkAssignThemeId('');
      queryClient.invalidateQueries({ queryKey: ['feedback', workspaceId] });
    } finally { setBulkActionState('idle'); }
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = () => {
    if (selectedIds.size === feedbackItems.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(feedbackItems.map((f) => f.id)));
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 1.5rem' }}>

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

      {/* AI Pipeline Progress */}
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

      {/* ── Step 3: Header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          {/* Step 1: Renamed title */}
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: NAVY, marginBottom: '0.3rem', letterSpacing: '-0.02em' }}>
            Inbox
          </h1>
          <p style={{ fontSize: '0.88rem', color: GREY }}>
            {total > 0 ? `${total} item${total !== 1 ? 's' : ''}` : 'No data yet'}
          </p>
        </div>

        {/* Step 3: Consistent button group */}
        {canEdit && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <Link
              href={`/${slug}/admin/integrations`}
              style={{ padding: '0.55rem 1.1rem', borderRadius: '0.625rem', border: `1px solid ${TEAL}`, background: '#fff', color: TEAL, fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>
              Connect
            </Link>
            <button
              onClick={() => setShowCsvModal(true)}
              style={{ padding: '0.55rem 1.1rem', borderRadius: '0.625rem', border: `1px solid ${BORDER}`, background: '#fff', color: NAVY, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Import CSV
            </button>
            <button
              onClick={async () => {
                setPipelineState('loading');
                try {
                  const res = await apiClient.feedback.reprocessPipeline(workspaceId);
                  setPipelineResult(res); setPipelineState('done');
                  markPipelineStarted(workspaceId);
                } catch { setPipelineState('error'); }
              }}
              disabled={pipelineState === 'loading'}
              style={{ padding: '0.55rem 1.1rem', borderRadius: '0.625rem', border: `1px solid ${BORDER}`, background: '#fff', color: NAVY, fontWeight: 600, fontSize: '0.85rem', cursor: pipelineState === 'loading' ? 'not-allowed' : 'pointer', opacity: pipelineState === 'loading' ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              {pipelineState === 'loading' ? 'Running…' : 'Re-run AI'}
            </button>
          </div>
        )}
      </div>

      {/* Pipeline result toast */}
      {pipelineState === 'done' && pipelineResult && (
        <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '0.75rem', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#2e7d32', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✓ AI pipeline triggered — {pipelineResult.enqueued} items enqueued.</span>
          <button onClick={() => setPipelineState('idle')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2e7d32', fontSize: '1rem' }}>×</button>
        </div>
      )}

      {/* ── Step 4: Filter bar ──────────────────────────────────────────────── */}
      {/* Primary source tabs */}
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {PRIMARY_SOURCE_TABS.map((tab) => {
          const active = activePrimarySource === tab.value;
          return (
            <button
              key={tab.label}
              onClick={() => { setActivePrimarySource(tab.value); setActiveSecondarySource(undefined); }}
              style={{
                padding: '0.4rem 0.9rem',
                borderRadius: '2rem',
                border: `1.5px solid ${active ? TEAL : BORDER}`,
                background: active ? '#e8f7f7' : '#fff',
                color: active ? TEAL : GREY,
                fontWeight: active ? 700 : 500,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                transition: 'all 0.12s ease',
              }}
            >
              <span style={{ fontSize: '0.85rem' }}>{tab.icon}</span> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Status tabs + channel dropdown */}
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#adb5bd', marginRight: '0.1rem' }}>Status:</span>
        {STATUS_TABS.map((tab) => {
          const active = activeStatus === tab.value;
          return (
            <button
              key={tab.label}
              onClick={() => setActiveStatus(tab.value)}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '0.5rem',
                border: `1.5px solid ${active ? NAVY : BORDER}`,
                background: active ? NAVY : '#fff',
                color: active ? '#fff' : GREY,
                fontWeight: active ? 700 : 500,
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
            >
              {tab.label}
            </button>
          );
        })}
        <div style={{ marginLeft: 'auto' }}>
          <select
            value={activeSecondarySource ?? ''}
            onChange={(e) => setActiveSecondarySource((e.target.value as FeedbackSecondarySource) || undefined)}
            style={{ padding: '0.38rem 0.7rem', border: `1px solid ${BORDER}`, borderRadius: '0.5rem', fontSize: '0.8rem', color: NAVY, background: '#fff', cursor: 'pointer' }}
          >
            <option value="">All channels</option>
            {(activePrimarySource ? SECONDARY_SOURCE_BY_PRIMARY[activePrimarySource] : ALL_SECONDARY_SOURCES).map((s) => (
              <option key={s} value={s}>{SECONDARY_SOURCE_LABELS[s] ?? s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Step 5: Search bar ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <input
          type="text"
          placeholder="Search feedback, themes, or keywords..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setShowSearchHint(true)}
          onBlur={() => setShowSearchHint(false)}
          style={{ width: '100%', padding: '0.65rem 1rem', border: `1.5px solid ${search ? TEAL : BORDER}`, borderRadius: '0.75rem', fontSize: '0.9rem', color: NAVY, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s ease', background: '#fff', boxShadow: search ? `0 0 0 3px ${TEAL}18` : 'none' }}
        />
        {showSearchHint && !search && (
          <p style={{ fontSize: '0.75rem', color: '#adb5bd', marginTop: '0.3rem', paddingLeft: '0.25rem' }}>
            Tip: try searching &ldquo;payment issues&rdquo; or &ldquo;onboarding&rdquo;
          </p>
        )}
      </div>

      {/* Select-all header */}
      {canEdit && feedbackItems.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', padding: '0 0.25rem' }}>
          <input
            type="checkbox"
            checked={selectedIds.size === feedbackItems.length && feedbackItems.length > 0}
            onChange={toggleSelectAll}
            style={{ cursor: 'pointer', width: '1rem', height: '1rem', accentColor: TEAL }}
          />
          <span style={{ fontSize: '0.8rem', color: GREY }}>
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
          </span>
        </div>
      )}

      {/* ── Feedback list ───────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: GREY }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite', display: 'inline-block', marginBottom: '0.75rem' }}>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          <p style={{ fontSize: '0.9rem' }}>Loading…</p>
        </div>
      ) : isError ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '3rem', color: '#c0392b' }}>
          <p style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Failed to load inbox</p>
          <p style={{ fontSize: '0.85rem' }}>Please refresh the page or contact support.</p>
        </div>
      ) : feedbackItems.length === 0 ? (
        /* Step 2: Empty state redesign */
        <EmptyState canEdit={canEdit} onImport={() => setShowCsvModal(true)} orgSlug={slug} />
      ) : (
        /* Step 6: Row layout */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {feedbackItems.map((item) => (
            <FeedbackRow
              key={item.id}
              item={item}
              isSelected={selectedIds.has(item.id)}
              canEdit={canEdit}
              onToggle={() => toggleSelect(item.id)}
              inboxItemHref={r.inboxItem(item.id)}
            />
          ))}

          {/* ── Pagination footer ─────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '1.25rem 0 0.5rem' }}>
            {/* Item count summary */}
            <p style={{ fontSize: '0.82rem', color: GREY, margin: 0 }}>
              Showing <strong>{feedbackItems.length}</strong> of <strong>{total}</strong> items
            </p>

            {/* Load More button — only shown when more pages exist */}
            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                style={{
                  padding: '0.6rem 2rem',
                  borderRadius: '0.625rem',
                  border: `1px solid ${TEAL}`,
                  background: '#fff',
                  color: TEAL,
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: isFetchingNextPage ? 'not-allowed' : 'pointer',
                  opacity: isFetchingNextPage ? 0.65 : 1,
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                {isFetchingNextPage ? (
                  <>
                    <span style={{ display: 'inline-block', width: '0.85rem', height: '0.85rem', border: `2px solid ${TEAL}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    Loading…
                  </>
                ) : (
                  'Load more'
                )}
              </button>
            )}

            {/* End-of-list indicator */}
            {!hasNextPage && feedbackItems.length > 0 && (
              <p style={{ fontSize: '0.78rem', color: '#adb5bd', margin: 0 }}>You have reached the end</p>
            )}
          </div>
        </div>
      )}

      {/* ── Step 7: Floating bulk action bar ───────────────────────────────── */}
      {selectedIds.size > 0 && canEdit && (
        <div
          style={{
            position: 'fixed',
            bottom: '1.75rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: NAVY,
            color: '#fff',
            borderRadius: '2rem',
            padding: '0.65rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            boxShadow: '0 6px 28px rgba(10,37,64,0.35)',
            zIndex: 200,
            flexWrap: 'wrap',
            justifyContent: 'center',
            animation: 'slideUp 0.2s ease',
          }}
        >
          <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>{selectedIds.size} selected</span>

          <div style={{ width: '1px', height: '1.2rem', background: 'rgba(255,255,255,0.2)' }} />

          {/* Merge */}
          <button
            onClick={() => { /* TODO: open merge modal */ }}
            style={{ padding: '0.35rem 0.9rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
          >
            Merge
          </button>

          {/* Assign */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <input
              type="text"
              placeholder="Theme ID…"
              value={bulkAssignThemeId}
              onChange={(e) => setBulkAssignThemeId(e.target.value)}
              style={{ padding: '0.3rem 0.65rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.8rem', width: '8rem', outline: 'none' }}
            />
            <button
              onClick={handleBulkAssign}
              disabled={!bulkAssignThemeId || bulkActionState === 'loading'}
              style={{ padding: '0.35rem 0.9rem', borderRadius: '1rem', border: 'none', background: TEAL, color: '#fff', fontWeight: 600, fontSize: '0.82rem', cursor: !bulkAssignThemeId || bulkActionState === 'loading' ? 'not-allowed' : 'pointer', opacity: !bulkAssignThemeId || bulkActionState === 'loading' ? 0.6 : 1 }}
            >
              Assign
            </button>
          </div>

          {/* Dismiss */}
          <button
            onClick={handleBulkDismiss}
            disabled={bulkActionState === 'loading'}
            style={{ padding: '0.35rem 0.9rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 600, fontSize: '0.82rem', cursor: bulkActionState === 'loading' ? 'not-allowed' : 'pointer', opacity: bulkActionState === 'loading' ? 0.6 : 1 }}
          >
            {bulkActionState === 'loading' ? 'Working…' : 'Dismiss'}
          </button>

          <div style={{ width: '1px', height: '1.2rem', background: 'rgba(255,255,255,0.2)' }} />

          {/* Clear */}
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: '0.1rem 0.25rem' }}
            aria-label="Clear selection"
          >
            ×
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity: 0; transform: translateX(-50%) translateY(0.75rem); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      `}</style>
    </div>
  );
}
