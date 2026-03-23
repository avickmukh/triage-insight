'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useCustomerList, useCreateCustomer, useRevenueSummary } from '@/hooks/use-customers';
import { useCurrentMemberRole } from '@/hooks/use-workspace';
import {
  Customer,
  CustomerSegment,
  AccountPriority,
  CustomerLifecycleStage,
  WorkspaceRole,
} from '@/lib/api-types';
import { appRoutes } from '@/lib/routes';

// ─── Design tokens (matching TriageInsight shell) ─────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const SEGMENT_COLORS: Record<CustomerSegment, { bg: string; color: string }> = {
  [CustomerSegment.SMB]:         { bg: '#e3f2fd', color: '#1565c0' },
  [CustomerSegment.MID_MARKET]:  { bg: '#fff8e1', color: '#b8860b' },
  [CustomerSegment.ENTERPRISE]:  { bg: '#f3e5f5', color: '#6a1b9a' },
};

const PRIORITY_COLORS: Record<AccountPriority, { bg: string; color: string }> = {
  [AccountPriority.LOW]:      { bg: '#f0f4f8', color: '#6C757D' },
  [AccountPriority.MEDIUM]:   { bg: '#e8f5e9', color: '#2e7d32' },
  [AccountPriority.HIGH]:     { bg: '#fff8e1', color: '#b8860b' },
  [AccountPriority.CRITICAL]: { bg: '#fce4ec', color: '#c62828' },
};

const LIFECYCLE_LABELS: Record<CustomerLifecycleStage, string> = {
  [CustomerLifecycleStage.LEAD]:      'Lead',
  [CustomerLifecycleStage.PROSPECT]:  'Prospect',
  [CustomerLifecycleStage.ACTIVE]:    'Active',
  [CustomerLifecycleStage.EXPANDING]: 'Expanding',
  [CustomerLifecycleStage.AT_RISK]:   'At Risk',
  [CustomerLifecycleStage.CHURNED]:   'Churned',
};

const LIFECYCLE_COLORS: Record<CustomerLifecycleStage, { bg: string; color: string }> = {
  [CustomerLifecycleStage.LEAD]:      { bg: '#f0f4f8', color: '#6C757D' },
  [CustomerLifecycleStage.PROSPECT]:  { bg: '#e3f2fd', color: '#1565c0' },
  [CustomerLifecycleStage.ACTIVE]:    { bg: '#e8f5e9', color: '#2e7d32' },
  [CustomerLifecycleStage.EXPANDING]: { bg: '#e8f5e9', color: '#1b5e20' },
  [CustomerLifecycleStage.AT_RISK]:   { bg: '#fff8e1', color: '#b8860b' },
  [CustomerLifecycleStage.CHURNED]:   { bg: '#fce4ec', color: '#c62828' },
};

function formatARR(value: number | null | undefined): string {
  if (!value) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

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

// ─── Revenue Summary Bar ──────────────────────────────────────────────────────
function RevenueSummaryBar({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading } = useRevenueSummary(workspaceId);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ ...CARD, flex: 1, padding: '1rem' }}>
            <Skeleton style={{ height: '0.75rem', width: '60%', marginBottom: '0.5rem' }} />
            <Skeleton style={{ height: '1.5rem', width: '80%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const stats = [
    { label: 'Total Customers', value: data.totalCustomers.toLocaleString(), accent: '#0a2540' },
    { label: 'Total ARR', value: formatARR(data.totalARR), accent: '#20A4A4' },
    { label: 'Open Deals', value: data.openDealCount.toLocaleString(), accent: '#f4a261' },
    { label: 'Open Pipeline', value: formatARR(data.openDealValue), accent: '#2e7d32' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
      {stats.map((s) => (
        <div key={s.label} style={{ ...CARD, padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#6C757D', fontWeight: 500, marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {s.label}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: s.accent }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Create Customer Modal ────────────────────────────────────────────────────
function CreateCustomerModal({ onClose }: { onClose: () => void }) {
  const { mutate: createCustomer, isPending, isError, error } = useCreateCustomer();
  const [form, setForm] = useState({
    name: '',
    companyName: '',
    email: '',
    arrValue: '',
    segment: '' as CustomerSegment | '',
    accountPriority: '' as AccountPriority | '',
    lifecycleStage: '' as CustomerLifecycleStage | '',
    externalRef: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    createCustomer(
      {
        name: form.name.trim(),
        companyName: form.companyName || undefined,
        email: form.email || undefined,
        arrValue: form.arrValue ? parseFloat(form.arrValue) : undefined,
        segment: (form.segment as CustomerSegment) || undefined,
        accountPriority: (form.accountPriority as AccountPriority) || undefined,
        lifecycleStage: (form.lifecycleStage as CustomerLifecycleStage) || undefined,
        externalRef: form.externalRef || undefined,
      },
      { onSuccess: onClose },
    );
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid #dee2e6',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    color: '#0a2540',
    background: '#fff',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#495057',
    marginBottom: '0.25rem',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10,37,64,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ ...CARD, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0a2540' }}>Add Customer</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: '#6C757D' }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Customer Name *</label>
              <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Acme Corp" />
            </div>
            <div>
              <label style={labelStyle}>Company Name</label>
              <input style={inputStyle} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Acme Corporation" />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contact@acme.com" />
            </div>
            <div>
              <label style={labelStyle}>ARR (USD)</label>
              <input style={inputStyle} type="number" min="0" step="1" value={form.arrValue} onChange={(e) => setForm({ ...form, arrValue: e.target.value })} placeholder="50000" />
            </div>
            <div>
              <label style={labelStyle}>External Ref</label>
              <input style={inputStyle} value={form.externalRef} onChange={(e) => setForm({ ...form, externalRef: e.target.value })} placeholder="SF-001" />
            </div>
            <div>
              <label style={labelStyle}>Segment</label>
              <select style={inputStyle} value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value as CustomerSegment | '' })}>
                <option value="">— Select —</option>
                {Object.values(CustomerSegment).map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Account Priority</label>
              <select style={inputStyle} value={form.accountPriority} onChange={(e) => setForm({ ...form, accountPriority: e.target.value as AccountPriority | '' })}>
                <option value="">— Select —</option>
                {Object.values(AccountPriority).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Lifecycle Stage</label>
              <select style={inputStyle} value={form.lifecycleStage} onChange={(e) => setForm({ ...form, lifecycleStage: e.target.value as CustomerLifecycleStage | '' })}>
                <option value="">— Select —</option>
                {Object.values(CustomerLifecycleStage).map((l) => <option key={l} value={l}>{LIFECYCLE_LABELS[l]}</option>)}
              </select>
            </div>
          </div>

          {isError && (
            <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#fce4ec', borderRadius: '0.5rem', fontSize: '0.8rem', color: '#c62828' }}>
              {(error as Error)?.message ?? 'Failed to create customer'}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '0.5rem 1rem', border: '1px solid #dee2e6', borderRadius: '0.5rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem' }}>
              Cancel
            </button>
            <button type="submit" disabled={isPending || !form.name.trim()} style={{ padding: '0.5rem 1.25rem', background: '#0a2540', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, opacity: isPending ? 0.7 : 1 }}>
              {isPending ? 'Adding…' : 'Add Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Customer Row ─────────────────────────────────────────────────────────────
function CustomerRow({ customer, orgSlug }: { customer: Customer & { _count?: { feedbacks: number; deals: number; signals: number } }; orgSlug: string }) {
  const r = appRoutes(orgSlug);
  const seg = customer.segment ? SEGMENT_COLORS[customer.segment] : null;
  const pri = PRIORITY_COLORS[customer.accountPriority ?? AccountPriority.MEDIUM];
  const lc = LIFECYCLE_COLORS[customer.lifecycleStage ?? CustomerLifecycleStage.PROSPECT];

  return (
    <tr style={{ borderBottom: '1px solid #f0f4f8' }}>
      <td style={{ padding: '0.875rem 1rem' }}>
        <Link href={`${r.customers}/${customer.id}`} style={{ textDecoration: 'none', color: '#0a2540', fontWeight: 600, fontSize: '0.9rem' }}>
          {customer.name}
        </Link>
        {customer.companyName && (
          <div style={{ fontSize: '0.75rem', color: '#6C757D', marginTop: '0.1rem' }}>{customer.companyName}</div>
        )}
      </td>
      <td style={{ padding: '0.875rem 1rem' }}>
        <span style={{ fontWeight: 700, color: '#0a2540', fontSize: '0.9rem' }}>{formatARR(customer.arrValue)}</span>
      </td>
      <td style={{ padding: '0.875rem 1rem' }}>
        {seg ? (
          <span style={{ ...seg, padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 600 }}>
            {customer.segment!.replace('_', ' ')}
          </span>
        ) : <span style={{ color: '#adb5bd' }}>—</span>}
      </td>
      <td style={{ padding: '0.875rem 1rem' }}>
        <span style={{ ...lc, padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 600 }}>
          {LIFECYCLE_LABELS[customer.lifecycleStage ?? CustomerLifecycleStage.PROSPECT]}
        </span>
      </td>
      <td style={{ padding: '0.875rem 1rem' }}>
        <span style={{ ...pri, padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 600 }}>
          {customer.accountPriority ?? 'MEDIUM'}
        </span>
      </td>
      <td style={{ padding: '0.875rem 1rem', fontSize: '0.8rem', color: '#6C757D' }}>
        {customer._count ? (
          <span>{customer._count.feedbacks} feedback · {customer._count.deals} deals</span>
        ) : '—'}
      </td>
      <td style={{ padding: '0.875rem 1rem' }}>
        <Link href={`${r.customers}/${customer.id}`} style={{ fontSize: '0.8rem', color: '#20A4A4', textDecoration: 'none', fontWeight: 500 }}>
          View →
        </Link>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const r = appRoutes(orgSlug);
  const { role } = useCurrentMemberRole();
  const canEdit = role === WorkspaceRole.ADMIN || role === WorkspaceRole.EDITOR;

  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<CustomerSegment | ''>('');
  const [lifecycleStage, setLifecycleStage] = useState<CustomerLifecycleStage | ''>('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data: customerData, isLoading, isError } = useCustomerList(orgSlug, {
    search: search || undefined,
    segment: (segment as CustomerSegment) || undefined,
    lifecycleStage: (lifecycleStage as CustomerLifecycleStage) || undefined,
    page,
    limit: 50,
  });

  const { data: revenueSummaryData } = useRevenueSummary(orgSlug);

  const customers = customerData?.data ?? [];
  const total = customerData?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0a2540' }}>Customers</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#6C757D' }}>
            Revenue-aware customer intelligence — linked to feedback, themes, and roadmap.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowCreate(true)}
            style={{ background: '#0a2540', color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1.25rem', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}
          >
            + Add Customer
          </button>
        )}
      </div>

      {/* ── Revenue Summary ──────────────────────────────────────────────── */}
      <RevenueSummaryBar workspaceId={orgSlug} />

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div style={{ ...CARD, marginBottom: '1rem', padding: '0.875rem 1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          placeholder="Search customers…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ flex: 1, minWidth: 180, padding: '0.4rem 0.75rem', border: '1px solid #dee2e6', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#0a2540' }}
        />
        <select
          value={segment}
          onChange={(e) => { setSegment(e.target.value as CustomerSegment | ''); setPage(1); }}
          style={{ padding: '0.4rem 0.75rem', border: '1px solid #dee2e6', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#0a2540', background: '#fff' }}
        >
          <option value="">All Segments</option>
          {Object.values(CustomerSegment).map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select
          value={lifecycleStage}
          onChange={(e) => { setLifecycleStage(e.target.value as CustomerLifecycleStage | ''); setPage(1); }}
          style={{ padding: '0.4rem 0.75rem', border: '1px solid #dee2e6', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#0a2540', background: '#fff' }}
        >
          <option value="">All Stages</option>
          {Object.values(CustomerLifecycleStage).map((l) => <option key={l} value={l}>{LIFECYCLE_LABELS[l]}</option>)}
        </select>
        {(search || segment || lifecycleStage) && (
          <button
            onClick={() => { setSearch(''); setSegment(''); setLifecycleStage(''); setPage(1); }}
            style={{ padding: '0.4rem 0.75rem', border: '1px solid #dee2e6', borderRadius: '0.5rem', fontSize: '0.8rem', background: '#fff', cursor: 'pointer', color: '#6C757D' }}
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Customer Table ───────────────────────────────────────────────── */}
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '2rem' }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                <Skeleton style={{ height: '1rem', flex: 2 }} />
                <Skeleton style={{ height: '1rem', flex: 1 }} />
                <Skeleton style={{ height: '1rem', flex: 1 }} />
                <Skeleton style={{ height: '1rem', flex: 1 }} />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#c62828' }}>
            Failed to load customers. Please try again.
          </div>
        ) : customers.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
            <div style={{ fontWeight: 600, color: '#0a2540', marginBottom: '0.25rem' }}>No customers yet</div>
            <div style={{ fontSize: '0.875rem', color: '#6C757D' }}>
              {search || segment || lifecycleStage ? 'No customers match your filters.' : 'Add your first customer to start tracking revenue intelligence.'}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8f9fa', borderBottom: '1px solid #e9ecef' }}>
                  {['Customer', 'ARR', 'Segment', 'Stage', 'Priority', 'Activity', ''].map((h) => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <CustomerRow key={c.id} customer={c as Customer & { _count?: { feedbacks: number; deals: number; signals: number } }} orgSlug={orgSlug} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: '0.875rem 1rem', borderTop: '1px solid #e9ecef', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#6C757D' }}>{total} customers total</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button disabled={page === 1} onClick={() => setPage(page - 1)} style={{ padding: '0.3rem 0.75rem', border: '1px solid #dee2e6', borderRadius: '0.4rem', background: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1, fontSize: '0.8rem' }}>← Prev</button>
              <span style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', color: '#0a2540' }}>Page {page} of {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage(page + 1)} style={{ padding: '0.3rem 0.75rem', border: '1px solid #dee2e6', borderRadius: '0.4rem', background: '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1, fontSize: '0.8rem' }}>Next →</button>
            </div>
          </div>
        )}
      </div>

      {showCreate && <CreateCustomerModal onClose={() => setShowCreate(false)} />}
    </>
  );
}
