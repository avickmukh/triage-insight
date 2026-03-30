'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useCurrentMemberRole } from '@/hooks/use-workspace';
import { useSurveyList, useCreateSurvey } from '@/hooks/use-surveys';
import { Survey, SurveyStatus, SurveyType } from '@/lib/api-types';
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

const TYPE_CONFIG: Record<SurveyType, { bg: string; color: string; label: string; icon: string }> = {
  [SurveyType.NPS]:                { bg: '#e3f2fd', color: '#1565c0', label: 'NPS',               icon: '📊' },
  [SurveyType.CSAT]:               { bg: '#fce4ec', color: '#c62828', label: 'CSAT',              icon: '⭐' },
  [SurveyType.FEATURE_VALIDATION]: { bg: '#f3e5f5', color: '#6a1b9a', label: 'Feature Val.',      icon: '🔬' },
  [SurveyType.ROADMAP_VALIDATION]: { bg: '#e8eaf6', color: '#283593', label: 'Roadmap Val.',      icon: '🗺️' },
  [SurveyType.CHURN_SIGNAL]:       { bg: '#fff3e0', color: '#e65100', label: 'Churn Signal',      icon: '🚨' },
  [SurveyType.OPEN_INSIGHT]:       { bg: '#e8f5e9', color: '#1b5e20', label: 'Open Insight',      icon: '💡' },
  [SurveyType.CUSTOM]:             { bg: '#f0f4f8', color: '#495057', label: 'Custom',            icon: '⚙️' },
};

const TYPE_TABS = [
  { label: 'All Types',          value: undefined },
  { label: 'NPS',                value: SurveyType.NPS },
  { label: 'CSAT',               value: SurveyType.CSAT },
  { label: 'Feature Validation', value: SurveyType.FEATURE_VALIDATION },
  { label: 'Roadmap Validation', value: SurveyType.ROADMAP_VALIDATION },
  { label: 'Churn Signal',       value: SurveyType.CHURN_SIGNAL },
  { label: 'Open Insight',       value: SurveyType.OPEN_INSIGHT },
];

const STATUS_TABS = [
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

// ─── Insight Score Pill ────────────────────────────────────────────────────────
function InsightScorePill({ score }: { score: number }) {
  const pct = Math.round(score);
  const color = pct >= 70 ? '#2e7d32' : pct >= 40 ? '#b8860b' : '#c62828';
  const bg    = pct >= 70 ? '#e8f5e9' : pct >= 40 ? '#fff8e1' : '#fce4ec';
  return (
    <span
      title="AI Insight Score — quality of extracted intelligence from responses"
      style={{
        background: bg, color, padding: '0.2rem 0.5rem',
        borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700,
        display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
      }}
    >
      <span style={{ fontSize: '0.65rem' }}>🧠</span> {pct}
    </span>
  );
}

// ─── Create Survey Modal ───────────────────────────────────────────────────────
function CreateSurveyModal({ onClose }: { onClose: () => void }) {
  const { mutate: createSurvey, isPending, isError, error } = useCreateSurvey();
  const [title, setTitle]                         = useState('');
  const [description, setDescription]             = useState('');
  const [surveyType, setSurveyType]               = useState<SurveyType>(SurveyType.CUSTOM);
  const [convertToFeedback, setConvertToFeedback] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createSurvey(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        surveyType,
        convertToFeedback,
      },
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
      <div style={{ ...CARD, width: '100%', maxWidth: '32rem', padding: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0a2540', marginBottom: '0.375rem' }}>
          New Survey
        </h2>
        <p style={{ color: '#6C757D', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Create a survey to collect structured feedback from your customers.
        </p>
        <form onSubmit={handleSubmit}>
          {/* Survey Type */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#0a2540', marginBottom: '0.5rem' }}>
              Survey Type
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
                const selected = surveyType === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSurveyType(key as SurveyType)}
                    style={{
                      padding: '0.5rem 0.375rem',
                      borderRadius: '0.5rem',
                      border: selected ? `2px solid ${cfg.color}` : '1px solid #dee2e6',
                      background: selected ? cfg.bg : '#fff',
                      color: selected ? cfg.color : '#495057',
                      fontSize: '0.75rem',
                      fontWeight: selected ? 700 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.2rem',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span>{cfg.icon}</span>
                    <span>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
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

          {/* Description */}
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

          {/* Convert to Feedback */}
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
function SurveyCard({ survey, orgSlug }: { survey: Survey; orgSlug: string }) {
  const statusCfg = STATUS_CONFIG[survey.status as SurveyStatus] ?? STATUS_CONFIG[SurveyStatus.DRAFT];
  const typeCfg   = TYPE_CONFIG[survey.surveyType as SurveyType]  ?? TYPE_CONFIG[SurveyType.CUSTOM];
  const r         = appRoutes(orgSlug);
  const href      = `${r.surveys}/${survey.id}`;

  // Derive insight score from _count if available (placeholder until intelligence endpoint wired)
  const responseCount  = survey._count?.responses ?? 0;
  const insightScore   = survey.insightScore ?? (responseCount > 0 ? Math.min(100, Math.round(responseCount * 4.5)) : null);
  const revenueScore   = survey.revenueWeightedScore;
  const validationScore = survey.validationScore;

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
            {/* Type badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.375rem' }}>
              <span style={{ fontSize: '0.8rem' }}>{typeCfg.icon}</span>
              <span style={{
                background: typeCfg.bg, color: typeCfg.color,
                padding: '0.15rem 0.5rem', borderRadius: '999px',
                fontSize: '0.7rem', fontWeight: 700,
              }}>
                {typeCfg.label}
              </span>
            </div>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#0a2540', margin: 0, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {survey.title}
            </h3>
            {survey.description && (
              <p style={{ fontSize: '0.8125rem', color: '#6C757D', margin: '0.25rem 0 0', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {survey.description}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.375rem', flexShrink: 0 }}>
            <span style={{ ...statusCfg, padding: '0.2rem 0.625rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>
              {statusCfg.label}
            </span>
            {insightScore !== null && <InsightScorePill score={insightScore} />}
            {revenueScore != null && (
              <span
                title="Revenue-Weighted Score — validation weighted by respondent ARR"
                style={{ background: '#fff3e0', color: '#e65100', padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
              >
                <span style={{ fontSize: '0.65rem' }}>💰</span> {Math.round(revenueScore)}
              </span>
            )}
            {validationScore != null && (
              <span
                title="Validation Score — feature/roadmap validation confidence"
                style={{ background: '#f3e5f5', color: '#6a1b9a', padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
              >
                <span style={{ fontSize: '0.65rem' }}>✓</span> {Math.round(validationScore)}%
              </span>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '1.5rem', borderTop: '1px solid #f0f4f8', paddingTop: '0.75rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0a2540' }}>{survey._count?.questions ?? 0}</div>
            <div style={{ fontSize: '0.7rem', color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Questions</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#20A4A4' }}>{responseCount}</div>
            <div style={{ fontSize: '0.7rem', color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Responses</div>
          </div>
          {survey.expiresAt && new Date(survey.expiresAt) > new Date() && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginLeft: 'auto' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e63946', display: 'inline-block' }} />
              <span style={{ fontSize: '0.75rem', color: '#e63946', fontWeight: 500 }}>
                Expires {new Date(survey.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          )}
          {survey.convertToFeedback && !survey.expiresAt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginLeft: 'auto' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#20A4A4', display: 'inline-block' }} />
              <span style={{ fontSize: '0.75rem', color: '#20A4A4', fontWeight: 500 }}>AI-ready</span>
            </div>
          )}
        </div>

        {/* AI insight summary line — shown when the survey has responses and any intelligence signal */}
        {responseCount > 0 && (insightScore !== null || revenueScore != null || validationScore != null) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', borderTop: '1px solid #f0f4f8', paddingTop: '0.625rem' }}>
            {insightScore !== null && (
              <span style={{ fontSize: '0.72rem', background: '#e0f7fa', color: '#00838f', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 500 }}>
                🧠 Insight {Math.round(insightScore)}
              </span>
            )}
            {(survey.linkedThemeIds?.length ?? 0) > 0 && (
              <span style={{ fontSize: '0.72rem', background: '#ede9fe', color: '#7c3aed', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 500 }}>
                {survey.linkedThemeIds.length} theme{survey.linkedThemeIds.length !== 1 ? 's' : ''} linked
              </span>
            )}
            {survey.convertToFeedback && (
              <span style={{ fontSize: '0.72rem', background: '#ede9fe', color: '#7c3aed', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 500 }}>
                → feeds global themes
              </span>
            )}
          </div>
        )}

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

  const [activeStatus, setActiveStatus] = useState<SurveyStatus | undefined>(undefined);
  const [activeType,   setActiveType]   = useState<SurveyType   | undefined>(undefined);
  const [search,       setSearch]       = useState('');
  const [showCreate,   setShowCreate]   = useState(false);

  const { data, isLoading } = useSurveyList(orgSlug, {
    status:     activeStatus,
    surveyType: activeType,
    search:     search || undefined,
  });
  const surveys: Survey[] = data?.data ?? [];
  const r = appRoutes(orgSlug);

  return (
    <>
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
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
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Status tabs */}
        <div style={{ display: 'flex', gap: '0.375rem', background: '#f0f4f8', borderRadius: '0.625rem', padding: '0.25rem' }}>
          {STATUS_TABS.map((tab) => {
            const active = activeStatus === tab.value;
            return (
              <button
                key={String(tab.value ?? 'all-status')}
                onClick={() => setActiveStatus(tab.value as SurveyStatus | undefined)}
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

        {/* Type filter */}
        <select
          value={activeType ?? ''}
          onChange={(e) => setActiveType((e.target.value as SurveyType) || undefined)}
          style={{
            padding: '0.4375rem 0.875rem', borderRadius: '0.5rem',
            border: '1px solid #dee2e6', fontSize: '0.8125rem',
            color: '#0a2540', outline: 'none', background: '#fff', cursor: 'pointer',
          }}
        >
          {TYPE_TABS.map((t) => (
            <option key={String(t.value ?? 'all-type')} value={t.value ?? ''}>
              {t.label}
            </option>
          ))}
        </select>

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
            {search || activeStatus || activeType ? 'No surveys match your filters' : 'No surveys yet'}
          </h3>
          <p style={{ color: '#6C757D', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            {search || activeStatus || activeType
              ? 'Try adjusting your search or filter.'
              : 'Create your first survey to start collecting structured feedback from customers.'}
          </p>
          {canEdit && !search && !activeStatus && !activeType && (
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
