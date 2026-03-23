'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useCurrentMemberRole } from '@/hooks/use-workspace';
import { useSurveyList, useCreateSurvey } from '@/hooks/use-surveys';
import { Survey, SurveyStatus } from '@/lib/api-types';
import { appRoutes } from '@/lib/routes';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const STATUS_CONFIG: Record<SurveyStatus, { bg: string; color: string; label: string }> = {
  [SurveyStatus.DRAFT]:     { bg: '#fff8e1', color: '#b8860b', label: 'Draft' },
  [SurveyStatus.PUBLISHED]: { bg: '#e8f5e9', color: '#2e7d32', label: 'Published' },
  [SurveyStatus.CLOSED]:    { bg: '#f0f4f8', color: '#6C757D', label: 'Closed' },
};

const TABS = [
  { label: 'All',       value: undefined },
  { label: 'Draft',     value: SurveyStatus.DRAFT },
  { label: 'Published', value: SurveyStatus.PUBLISHED },
  { label: 'Closed',    value: SurveyStatus.CLOSED },
];

// ─── Skeleton ──────────────────────────────────────────────────────────────────
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

// ─── Create Survey Modal ───────────────────────────────────────────────────────
function CreateSurveyModal({ onClose }: { onClose: () => void }) {
  const { mutate: createSurvey, isPending, isError, error } = useCreateSurvey();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [convertToFeedback, setConvertToFeedback] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createSurvey(
      { title: title.trim(), description: description.trim() || undefined, convertToFeedback },
      { onSuccess: onClose },
    );
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(10,37,64,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ ...CARD, width: '100%', maxWidth: '30rem', padding: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0a2540', marginBottom: '0.375rem' }}>
          New Survey
        </h2>
        <p style={{ color: '#6C757D', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Create a survey to collect structured feedback from your customers.
        </p>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#0a2540', marginBottom: '0.375rem' }}>
              Title <span style={{ color: '#e63946' }}>*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q2 Customer Satisfaction Survey"
              required
              style={{
                width: '100%', padding: '0.625rem 0.875rem',
                border: '1px solid #dee2e6', borderRadius: '0.5rem',
                fontSize: '0.875rem', color: '#0a2540', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#0a2540', marginBottom: '0.375rem' }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — shown to respondents at the top of the survey"
              rows={3}
              style={{
                width: '100%', padding: '0.625rem 0.875rem',
                border: '1px solid #dee2e6', borderRadius: '0.5rem',
                fontSize: '0.875rem', color: '#0a2540', outline: 'none',
                resize: 'vertical', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.625rem' }}>
            <input
              type="checkbox"
              id="convertToFeedback"
              checked={convertToFeedback}
              onChange={(e) => setConvertToFeedback(e.target.checked)}
              style={{ marginTop: '2px', accentColor: '#20A4A4', width: '1rem', height: '1rem' }}
            />
            <label htmlFor="convertToFeedback" style={{ fontSize: '0.8125rem', color: '#495057', lineHeight: 1.5 }}>
              <strong>Convert text responses to Feedback</strong> — text answers will automatically be added to your Feedback Inbox for AI clustering and theme analysis.
            </label>
          </div>
          {isError && (
            <p style={{ color: '#e63946', fontSize: '0.8125rem', marginBottom: '1rem' }}>
              {(error as any)?.message ?? 'Failed to create survey.'}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
                border: '1px solid #dee2e6', background: '#fff',
                color: '#495057', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !title.trim()}
              style={{
                padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
                border: 'none', background: '#0a2540',
                color: '#fff', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 600,
                opacity: isPending || !title.trim() ? 0.6 : 1,
              }}
            >
              {isPending ? 'Creating…' : 'Create Survey'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Survey Card ───────────────────────────────────────────────────────────────
function SurveyCard({ survey, orgSlug }: { survey: Survey & { _count?: { questions: number; responses: number } }; orgSlug: string }) {
  const cfg = STATUS_CONFIG[survey.status as SurveyStatus] ?? STATUS_CONFIG[SurveyStatus.DRAFT];
  const r = appRoutes(orgSlug);
  const href = `${r.surveys}/${survey.id}`;

  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        style={{
          ...CARD,
          transition: 'box-shadow 0.15s, transform 0.15s',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
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
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#0a2540', margin: 0, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {survey.title}
            </h3>
            {survey.description && (
              <p style={{ fontSize: '0.8125rem', color: '#6C757D', margin: '0.25rem 0 0', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {survey.description}
              </p>
            )}
          </div>
          <span style={{ ...cfg, padding: '0.2rem 0.625rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {cfg.label}
          </span>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '1.5rem', borderTop: '1px solid #f0f4f8', paddingTop: '0.75rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0a2540' }}>{survey._count?.questions ?? 0}</div>
            <div style={{ fontSize: '0.7rem', color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Questions</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#20A4A4' }}>{survey._count?.responses ?? 0}</div>
            <div style={{ fontSize: '0.7rem', color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Responses</div>
          </div>
          {survey.convertToFeedback && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginLeft: 'auto' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#20A4A4', display: 'inline-block' }} />
              <span style={{ fontSize: '0.75rem', color: '#20A4A4', fontWeight: 500 }}>AI-ready</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: '#adb5bd' }}>
            Created {new Date(survey.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <span style={{ fontSize: '0.8125rem', color: '#20A4A4', fontWeight: 500 }}>View →</span>
        </div>
      </div>
    </Link>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function SurveysPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { role } = useCurrentMemberRole();
  const canEdit = role === 'ADMIN' || role === 'EDITOR';

  const [activeTab, setActiveTab] = useState<SurveyStatus | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useSurveyList(orgSlug, { status: activeTab, search: search || undefined });
  const surveys: (Survey & { _count?: { questions: number; responses: number } })[] = data?.data ?? [];

  const r = appRoutes(orgSlug);

  return (
    <>
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0a2540', margin: 0, letterSpacing: '-0.02em' }}>
            Surveys
          </h1>
          <p style={{ color: '#6C757D', fontSize: '0.9rem', margin: '0.25rem 0 0' }}>
            Collect structured feedback from your customers and convert responses into product intelligence.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowCreate(true)}
            style={{
              padding: '0.5625rem 1.25rem', borderRadius: '0.5rem',
              border: 'none', background: '#0a2540',
              color: '#fff', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 600,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            + New Survey
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Status tabs */}
        <div style={{ display: 'flex', gap: '0.375rem', background: '#f0f4f8', borderRadius: '0.625rem', padding: '0.25rem' }}>
          {TABS.map((tab) => {
            const active = activeTab === tab.value;
            return (
              <button
                key={String(tab.value)}
                onClick={() => setActiveTab(tab.value as SurveyStatus | undefined)}
                style={{
                  padding: '0.375rem 0.875rem', borderRadius: '0.4rem',
                  border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600,
                  background: active ? '#fff' : 'transparent',
                  color: active ? '#0a2540' : '#6C757D',
                  boxShadow: active ? '0 1px 3px rgba(10,37,64,0.1)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search surveys…"
          style={{
            padding: '0.5rem 0.875rem', borderRadius: '0.5rem',
            border: '1px solid #dee2e6', fontSize: '0.875rem',
            color: '#0a2540', outline: 'none', minWidth: '200px',
          }}
        />
      </div>

      {/* AI Intelligence Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #e8f5e9 0%, #e3f2fd 100%)',
        border: '1px solid #c8e6c9',
        borderRadius: '0.75rem',
        padding: '0.875rem 1.25rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
      }}>
        <span style={{ fontSize: '1.25rem' }}>🧠</span>
        <div>
          <strong style={{ fontSize: '0.875rem', color: '#1b5e20' }}>Intelligence-Ready Surveys</strong>
          <span style={{ fontSize: '0.8125rem', color: '#2e7d32', marginLeft: '0.5rem' }}>
            Text responses are automatically converted to Feedback items and fed into your AI clustering pipeline — no manual work needed.
          </span>
        </div>
      </div>

      {/* Survey Grid */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ ...CARD }}>
              <Skeleton style={{ height: '1.25rem', width: '70%', marginBottom: '0.5rem' }} />
              <Skeleton style={{ height: '0.875rem', width: '90%', marginBottom: '1rem' }} />
              <Skeleton style={{ height: '0.75rem', width: '40%' }} />
            </div>
          ))}
        </div>
      ) : surveys.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', marginBottom: '0.5rem' }}>
            {search || activeTab ? 'No surveys match your filters' : 'No surveys yet'}
          </h3>
          <p style={{ color: '#6C757D', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            {search || activeTab
              ? 'Try adjusting your search or filter.'
              : 'Create your first survey to start collecting structured feedback from customers.'}
          </p>
          {canEdit && !search && !activeTab && (
            <button
              onClick={() => setShowCreate(true)}
              style={{
                padding: '0.625rem 1.5rem', borderRadius: '0.5rem',
                border: 'none', background: '#0a2540',
                color: '#fff', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 600,
              }}
            >
              + New Survey
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {surveys.map((survey) => (
            <SurveyCard key={survey.id} survey={survey} orgSlug={orgSlug} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '2rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#6C757D' }}>
            Page {data.page} of {data.totalPages} · {data.total} surveys
          </span>
        </div>
      )}

      {showCreate && <CreateSurveyModal onClose={() => setShowCreate(false)} />}
    </>
  );
}
