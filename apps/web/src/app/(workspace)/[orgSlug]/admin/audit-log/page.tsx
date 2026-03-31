'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { useCurrentMemberRole } from '@/hooks/use-workspace';
import { WorkspaceRole } from '@/lib/api-types';
import type { AuditLogEntry, AuditLogResponse } from '@/lib/api-types';

// ─── Design tokens ────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

// ─── Action colour map ────────────────────────────────────────────────────────
const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  THEME_CREATE:        { bg: '#e8f7f7', color: '#20A4A4' },
  THEME_UPDATE:        { bg: '#fff8e1', color: '#b8860b' },
  THEME_DELETE:        { bg: '#fee2e2', color: '#b91c1c' },
  FEEDBACK_MERGE:      { bg: '#f3e8ff', color: '#6d28d9' },
  ROADMAP_ITEM_CREATE: { bg: '#e8f5e9', color: '#2e7d32' },
  ROADMAP_ITEM_UPDATE: { bg: '#e8f5e9', color: '#2e7d32' },
  MEMBER_INVITE:       { bg: '#e3f2fd', color: '#1565c0' },
  MEMBER_REMOVE:       { bg: '#fee2e2', color: '#b91c1c' },
  WORKSPACE_UPDATE:    { bg: '#f0f4f8', color: '#495057' },
};

const defaultColor = { bg: '#f0f4f8', color: '#495057' };

// ─── Audit Log Page ───────────────────────────────────────────────────────────
export default function AuditLogPage() {
  const params = useParams();
  const slug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';
  const { role } = useCurrentMemberRole();

  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async (p: number, action: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.workspace.getAuditLog(p, 50, action || undefined);
      setData(res);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? (err instanceof Error ? err.message : 'Failed to load audit log');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(page, actionFilter);
  }, [fetchLogs, page, actionFilter]);

  // Guard: only admins can view this page
  if (role && role !== WorkspaceRole.ADMIN) {
    return (
      <div style={{ ...CARD, textAlign: 'center', padding: '3rem' }}>
        <p style={{ fontSize: '1rem', color: '#6C757D' }}>
          🔒 Only workspace admins can view the audit log.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0a2540', margin: 0 }}>
              🔍 Audit Log
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#6C757D', margin: '0.25rem 0 0' }}>
              Full history of all workspace actions — theme changes, roadmap updates, member events, and more.
            </p>
          </div>
          <button
            onClick={() => fetchLogs(page, actionFilter)}
            disabled={loading}
            style={{
              padding: '0.5rem 1.125rem', borderRadius: '0.5rem',
              border: '1px solid #ced4da', background: '#fff',
              fontSize: '0.875rem', cursor: 'pointer', color: '#495057',
              fontWeight: 500,
            }}
          >
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <input
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value.toUpperCase()); setPage(1); }}
            placeholder="Filter by action (e.g. THEME_UPDATE)"
            style={{
              flex: 1, minWidth: '200px', padding: '0.45rem 0.75rem',
              border: '1px solid #ced4da', borderRadius: '0.5rem',
              fontSize: '0.85rem', color: '#0a2540', outline: 'none',
              fontFamily: 'monospace',
            }}
          />
          {actionFilter && (
            <button
              onClick={() => { setActionFilter(''); setPage(1); }}
              style={{
                padding: '0.45rem 0.875rem', borderRadius: '0.5rem',
                border: '1px solid #dee2e6', background: '#f8f9fa',
                fontSize: '0.8rem', cursor: 'pointer', color: '#6C757D',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Log table */}
      <div style={CARD}>
        {loading && !data ? (
          <p style={{ fontSize: '0.9rem', color: '#adb5bd', textAlign: 'center', padding: '2rem 0' }}>
            Loading audit log…
          </p>
        ) : error ? (
          <p style={{ fontSize: '0.9rem', color: '#e63946', textAlign: 'center', padding: '2rem 0' }}>
            {error}
          </p>
        ) : data && data.data.length === 0 ? (
          <p style={{ fontSize: '0.9rem', color: '#adb5bd', textAlign: 'center', padding: '2rem 0' }}>
            No audit log entries found{actionFilter ? ` for action "${actionFilter}"` : ''}.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {/* Column headers */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 2fr 2fr auto',
              gap: '0.5rem', padding: '0.5rem 0.75rem',
              background: '#f8f9fa', borderRadius: '0.5rem 0.5rem 0 0',
              borderBottom: '1px solid #e9ecef',
            }}>
              {['Time', 'Action', 'User', ''].map((h) => (
                <span key={h} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
              ))}
            </div>

            {data?.data.map((entry: AuditLogEntry, idx: number) => {
              const ac = ACTION_COLORS[entry.action] ?? defaultColor;
              const isExpanded = expandedId === entry.id;
              return (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex', flexDirection: 'column',
                    borderBottom: idx < (data.data.length - 1) ? '1px solid #f0f4f8' : 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'grid', gridTemplateColumns: '1fr 2fr 2fr auto',
                      gap: '0.5rem', padding: '0.625rem 0.75rem',
                      cursor: 'pointer',
                      background: isExpanded ? '#f8f9fa' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    <span style={{ fontSize: '0.78rem', color: '#6C757D', fontVariantNumeric: 'tabular-nums' }}>
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 700,
                      background: ac.bg, color: ac.color,
                      borderRadius: '999px', padding: '0.15rem 0.5rem',
                      display: 'inline-flex', alignItems: 'center',
                      width: 'fit-content', fontFamily: 'monospace',
                    }}>
                      {entry.action}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#495057' }}>
                      {entry.userName ?? entry.userEmail ?? entry.userId ?? 'System'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#adb5bd' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div style={{
                      padding: '0.75rem 1rem 0.875rem',
                      background: '#f8f9fa',
                      borderTop: '1px solid #e9ecef',
                    }}>
                      <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 0.375rem' }}>
                        Details
                      </p>
                      <pre style={{
                        fontSize: '0.78rem', color: '#0a2540',
                        background: '#fff', border: '1px solid #e9ecef',
                        borderRadius: '0.375rem', padding: '0.625rem 0.875rem',
                        overflowX: 'auto', margin: 0, lineHeight: 1.6,
                        fontFamily: 'monospace',
                      }}>
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#6C757D' }}>
              Page {data.page} of {data.totalPages} · {data.total} total entries
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                style={{
                  padding: '0.35rem 0.875rem', borderRadius: '0.5rem',
                  border: '1px solid #dee2e6', background: '#fff',
                  fontSize: '0.8rem', cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  color: page <= 1 ? '#adb5bd' : '#0a2540',
                }}
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages || loading}
                style={{
                  padding: '0.35rem 0.875rem', borderRadius: '0.5rem',
                  border: '1px solid #dee2e6', background: '#fff',
                  fontSize: '0.8rem', cursor: page >= data.totalPages ? 'not-allowed' : 'pointer',
                  color: page >= data.totalPages ? '#adb5bd' : '#0a2540',
                }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
