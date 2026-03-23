'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useCustomerDetail, useUpdateCustomer } from '@/hooks/use-customers';
import { useCurrentMemberRole } from '@/hooks/use-workspace';
import {
  CustomerLifecycleStage,
  CustomerSegment,
  AccountPriority,
  WorkspaceRole,
  FeedbackStatus,
  RoadmapStatus,
} from '@/lib/api-types';
import { appRoutes } from '@/lib/routes';
import { useState } from 'react';

// ─── Design tokens ────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
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

const PRIORITY_COLORS: Record<AccountPriority, { bg: string; color: string }> = {
  [AccountPriority.LOW]:      { bg: '#f0f4f8', color: '#6C757D' },
  [AccountPriority.MEDIUM]:   { bg: '#e8f5e9', color: '#2e7d32' },
  [AccountPriority.HIGH]:     { bg: '#fff8e1', color: '#b8860b' },
  [AccountPriority.CRITICAL]: { bg: '#fce4ec', color: '#c62828' },
};

const FEEDBACK_STATUS_COLORS: Record<FeedbackStatus, { bg: string; color: string }> = {
  [FeedbackStatus.NEW]:       { bg: '#e3f2fd', color: '#1565c0' },
  [FeedbackStatus.IN_REVIEW]: { bg: '#fff8e1', color: '#b8860b' },
  [FeedbackStatus.PROCESSED]: { bg: '#e8f5e9', color: '#2e7d32' },
  [FeedbackStatus.ARCHIVED]:  { bg: '#f0f4f8', color: '#6C757D' },
  [FeedbackStatus.MERGED]:    { bg: '#f0f4f8', color: '#6C757D' },
};

const ROADMAP_STATUS_COLORS: Record<RoadmapStatus, { bg: string; color: string }> = {
  [RoadmapStatus.BACKLOG]:    { bg: '#f0f4f8', color: '#6C757D' },
  [RoadmapStatus.EXPLORING]:  { bg: '#e3f2fd', color: '#1565c0' },
  [RoadmapStatus.PLANNED]:    { bg: '#f3e5f5', color: '#6a1b9a' },
  [RoadmapStatus.COMMITTED]:  { bg: '#fff8e1', color: '#b8860b' },
  [RoadmapStatus.SHIPPED]:    { bg: '#e8f5e9', color: '#2e7d32' },
};

function formatARR(value: number | null | undefined): string {
  if (!value) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function Skeleton({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'linear-gradient(90deg, #f0f4f8 25%, #e4eaf0 50%, #f0f4f8 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite', borderRadius: '0.5rem', ...style }} />
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
      <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#0a2540' }}>{title}</h3>
      {count !== undefined && (
        <span style={{ background: '#e9ecef', color: '#495057', borderRadius: '1rem', padding: '0.1rem 0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>{count}</span>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CustomerDetailPage() {
  const { orgSlug, id } = useParams<{ orgSlug: string; id: string }>();
  const r = appRoutes(orgSlug);
  const { role } = useCurrentMemberRole();
  const canEdit = role === WorkspaceRole.ADMIN || role === WorkspaceRole.EDITOR;

  const { data: customer, isLoading, isError } = useCustomerDetail(orgSlug, id);
  const { mutate: updateCustomer, isPending: isUpdating } = useUpdateCustomer(orgSlug, id);

  const [editingArr, setEditingArr] = useState(false);
  const [arrInput, setArrInput] = useState('');

  if (isLoading) {
    return (
      <>
        <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
        <div style={{ marginBottom: '1rem' }}>
          <Skeleton style={{ height: '1.5rem', width: '40%', marginBottom: '0.5rem' }} />
          <Skeleton style={{ height: '0.875rem', width: '25%' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
          <Skeleton style={{ height: 300 }} />
          <Skeleton style={{ height: 300 }} />
        </div>
      </>
    );
  }

  if (isError || !customer) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <div style={{ color: '#c62828', fontWeight: 600 }}>Customer not found.</div>
        <Link href={r.customers} style={{ color: '#20A4A4', fontSize: '0.875rem', marginTop: '0.5rem', display: 'inline-block' }}>← Back to Customers</Link>
      </div>
    );
  }

  const lc = LIFECYCLE_COLORS[customer.lifecycleStage ?? CustomerLifecycleStage.PROSPECT];
  const pri = PRIORITY_COLORS[customer.accountPriority ?? AccountPriority.MEDIUM];
  const ri = customer.revenueIntelligence;

  return (
    <>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

      {/* ── Breadcrumb ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '1rem', fontSize: '0.8rem', color: '#6C757D' }}>
        <Link href={r.customers} style={{ color: '#20A4A4', textDecoration: 'none' }}>Customers</Link>
        <span style={{ margin: '0 0.4rem' }}>›</span>
        <span style={{ color: '#0a2540' }}>{customer.name}</span>
      </div>

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0a2540' }}>{customer.name}</h1>
          {customer.companyName && (
            <div style={{ fontSize: '0.875rem', color: '#6C757D', marginTop: '0.2rem' }}>{customer.companyName}</div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ ...lc, padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 600 }}>
              {LIFECYCLE_LABELS[customer.lifecycleStage ?? CustomerLifecycleStage.PROSPECT]}
            </span>
            <span style={{ ...pri, padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 600 }}>
              {customer.accountPriority ?? 'MEDIUM'}
            </span>
            {customer.segment && (
              <span style={{ background: '#f3e5f5', color: '#6a1b9a', padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 600 }}>
                {customer.segment.replace('_', ' ')}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* ── Left: Profile + Revenue Intelligence ──────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Profile card */}
          <div style={CARD}>
            <SectionHeader title="Profile" />
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1rem', fontSize: '0.85rem' }}>
              {customer.email && (
                <>
                  <dt style={{ color: '#6C757D', fontWeight: 500 }}>Email</dt>
                  <dd style={{ margin: 0, color: '#0a2540', wordBreak: 'break-all' }}>{customer.email}</dd>
                </>
              )}
              {customer.externalRef && (
                <>
                  <dt style={{ color: '#6C757D', fontWeight: 500 }}>Ext. Ref</dt>
                  <dd style={{ margin: 0, color: '#0a2540', fontFamily: 'monospace', fontSize: '0.8rem' }}>{customer.externalRef}</dd>
                </>
              )}
              <dt style={{ color: '#6C757D', fontWeight: 500 }}>ARR</dt>
              <dd style={{ margin: 0 }}>
                {editingArr && canEdit ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      updateCustomer({ arrValue: parseFloat(arrInput) || 0 }, { onSuccess: () => setEditingArr(false) });
                    }}
                    style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}
                  >
                    <input
                      type="number" min="0" step="1"
                      value={arrInput}
                      onChange={(e) => setArrInput(e.target.value)}
                      style={{ width: 90, padding: '0.2rem 0.4rem', border: '1px solid #dee2e6', borderRadius: '0.4rem', fontSize: '0.85rem' }}
                      autoFocus
                    />
                    <button type="submit" disabled={isUpdating} style={{ padding: '0.2rem 0.5rem', background: '#0a2540', color: '#fff', border: 'none', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.75rem' }}>Save</button>
                    <button type="button" onClick={() => setEditingArr(false)} style={{ padding: '0.2rem 0.5rem', background: '#f0f4f8', border: 'none', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                  </form>
                ) : (
                  <span
                    style={{ fontWeight: 700, color: '#0a2540', cursor: canEdit ? 'pointer' : 'default' }}
                    onClick={() => { if (canEdit) { setArrInput(String(customer.arrValue ?? 0)); setEditingArr(true); } }}
                    title={canEdit ? 'Click to edit ARR' : undefined}
                  >
                    {formatARR(customer.arrValue)}
                    {canEdit && <span style={{ marginLeft: '0.3rem', fontSize: '0.7rem', color: '#20A4A4' }}>✎</span>}
                  </span>
                )}
              </dd>
              <dt style={{ color: '#6C757D', fontWeight: 500 }}>Added</dt>
              <dd style={{ margin: 0, color: '#0a2540' }}>{new Date(customer.createdAt).toLocaleDateString()}</dd>
            </dl>
          </div>

          {/* Revenue Intelligence card */}
          {ri && (
            <div style={CARD}>
              <SectionHeader title="Revenue Intelligence" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {[
                  { label: 'ARR', value: formatARR(ri.arrValue), accent: '#20A4A4' },
                  { label: 'Open Pipeline', value: formatARR(ri.openDealValue), accent: '#2e7d32' },
                  { label: 'Total Pipeline', value: formatARR(ri.totalDealValue), accent: '#f4a261' },
                  { label: 'Feedback', value: ri.feedbackCount, accent: '#0a2540' },
                  { label: 'Deals', value: ri.dealCount, accent: '#0a2540' },
                  { label: 'Signals', value: ri.signalCount, accent: '#0a2540' },
                  { label: 'Themes', value: ri.influencedThemeCount, accent: '#6a1b9a' },
                  { label: 'Roadmap Items', value: ri.influencedRoadmapCount, accent: '#1565c0' },
                ].map((s) => (
                  <div key={s.label} style={{ background: '#f8f9fa', borderRadius: '0.5rem', padding: '0.6rem 0.75rem' }}>
                    <div style={{ fontSize: '0.7rem', color: '#6C757D', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>{s.label}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: s.accent }}>{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Feedback, Deals, Roadmap ───────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Feedback */}
          <div style={CARD}>
            <SectionHeader title="Linked Feedback" count={customer.feedbacks?.length} />
            {!customer.feedbacks || customer.feedbacks.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: '#adb5bd', fontStyle: 'italic' }}>No feedback linked to this customer yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {customer.feedbacks.map((fb: any) => {
                  const fbStatus = FEEDBACK_STATUS_COLORS[fb.status as FeedbackStatus] ?? { bg: '#f0f4f8', color: '#6C757D' };
                  return (
                    <div key={fb.id} style={{ padding: '0.75rem', background: '#f8f9fa', borderRadius: '0.5rem', border: '1px solid #e9ecef' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <Link href={`${r.inboxItem(fb.id)}`} style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0a2540', textDecoration: 'none', flex: 1 }}>
                          {fb.title}
                        </Link>
                        <span style={{ ...fbStatus, padding: '0.15rem 0.5rem', borderRadius: '1rem', fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{fb.status}</span>
                      </div>
                      {fb.themes && fb.themes.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                          {fb.themes.map((tf: any) => (
                            <Link key={tf.theme.id} href={r.themeItem(tf.theme.id)} style={{ fontSize: '0.7rem', background: '#f3e5f5', color: '#6a1b9a', padding: '0.1rem 0.4rem', borderRadius: '0.4rem', textDecoration: 'none', fontWeight: 500 }}>
                              {tf.theme.title}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Deals */}
          <div style={CARD}>
            <SectionHeader title="Deals" count={customer.deals?.length} />
            {!customer.deals || customer.deals.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: '#adb5bd', fontStyle: 'italic' }}>No deals linked to this customer yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {customer.deals.map((deal: any) => (
                  <div key={deal.id} style={{ padding: '0.75rem', background: '#f8f9fa', borderRadius: '0.5rem', border: '1px solid #e9ecef' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0a2540' }}>{deal.title}</span>
                      <span style={{ fontWeight: 700, color: '#2e7d32', fontSize: '0.9rem' }}>{formatARR(deal.annualValue)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', background: '#e3f2fd', color: '#1565c0', padding: '0.1rem 0.4rem', borderRadius: '0.4rem', fontWeight: 500 }}>{deal.stage.replace('_', ' ')}</span>
                      <span style={{ fontSize: '0.7rem', color: '#6C757D' }}>{deal.status}</span>
                      {deal.themeLinks?.map((tl: any) => (
                        <Link key={tl.theme.id} href={r.themeItem(tl.theme.id)} style={{ fontSize: '0.7rem', background: '#f3e5f5', color: '#6a1b9a', padding: '0.1rem 0.4rem', borderRadius: '0.4rem', textDecoration: 'none', fontWeight: 500 }}>
                          {tl.theme.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Influenced Roadmap Items */}
          {customer.influencedRoadmapItems && customer.influencedRoadmapItems.length > 0 && (
            <div style={CARD}>
              <SectionHeader title="Influenced Roadmap Items" count={customer.influencedRoadmapItems.length} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {customer.influencedRoadmapItems.map((item: any) => {
                  const rmStatus = ROADMAP_STATUS_COLORS[item.status as RoadmapStatus] ?? { bg: '#f0f4f8', color: '#6C757D' };
                  return (
                    <div key={item.id} style={{ padding: '0.75rem', background: '#f8f9fa', borderRadius: '0.5rem', border: '1px solid #e9ecef', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                      <Link href={r.roadmapItem(item.id)} style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0a2540', textDecoration: 'none', flex: 1 }}>
                        {item.title}
                      </Link>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        {item.targetQuarter && (
                          <span style={{ fontSize: '0.7rem', color: '#6C757D' }}>{item.targetQuarter} {item.targetYear}</span>
                        )}
                        <span style={{ ...rmStatus, padding: '0.15rem 0.5rem', borderRadius: '1rem', fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{item.status.replace('_', ' ')}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
