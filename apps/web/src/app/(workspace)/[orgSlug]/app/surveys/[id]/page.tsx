'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useCurrentMemberRole, useWorkspace } from '@/hooks/use-workspace';
import {
  useSurveyDetail,
  usePublishSurvey,
  useUnpublishSurvey,
  useCloseSurvey,
  useDeleteSurvey,
  useAddQuestion,
  useDeleteQuestion,
  useSurveyResponses,
  useSurveyIntelligence,
} from '@/hooks/use-surveys';
import { SurveyStatus, SurveyQuestionType, SurveyType } from '@/lib/api-types';
import { appRoutes, publicRoutes } from '@/lib/routes';

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

const QUESTION_TYPE_LABELS: Record<SurveyQuestionType, string> = {
  [SurveyQuestionType.SHORT_TEXT]:      'Short Text',
  [SurveyQuestionType.LONG_TEXT]:       'Long Text',
  [SurveyQuestionType.SINGLE_CHOICE]:   'Single Choice',
  [SurveyQuestionType.MULTIPLE_CHOICE]: 'Multiple Choice',
  [SurveyQuestionType.RATING]:          'Rating Scale',
  [SurveyQuestionType.NPS]:             'NPS (0–10)',
};

// ─── Safe number helpers ───────────────────────────────────────────────────────
const safeRound = (v: number | null | undefined) =>
  v != null ? Math.round(v) : '—';
const safeFixed = (v: number | null | undefined, d = 2) =>
  v != null ? (v as number).toFixed(d) : '—';
const safeArrK = (v: number | null | undefined) =>
  v != null ? `$${(v / 1000).toFixed(0)}k` : '—';

// ─── Add Question Modal ────────────────────────────────────────────────────────
function AddQuestionModal({ surveyId, workspaceId, onClose }: { surveyId: string; workspaceId: string; onClose: () => void }) {
  const { mutate: addQuestion, isPending } = useAddQuestion(workspaceId, surveyId);
  const [type, setType] = useState<SurveyQuestionType>(SurveyQuestionType.SHORT_TEXT);
  const [label, setLabel] = useState('');
  const [placeholder, setPlaceholder] = useState('');
  const [required, setRequired] = useState(false);
  const [optionsText, setOptionsText] = useState('');

  const showOptions = type === SurveyQuestionType.SINGLE_CHOICE || type === SurveyQuestionType.MULTIPLE_CHOICE;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    const options = showOptions ? optionsText.split('\n').map((o) => o.trim()).filter(Boolean) : undefined;
    addQuestion(
      { type, label: label.trim(), placeholder: placeholder.trim() || undefined, required, options },
      { onSuccess: onClose },
    );
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(10,37,64,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ ...CARD, width: '100%', maxWidth: '32rem', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0a2540', marginBottom: '1.5rem' }}>Add Question</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#0a2540', marginBottom: '0.375rem' }}>Question Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as SurveyQuestionType)}
              style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1px solid #dee2e6', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#0a2540', boxSizing: 'border-box' }}
            >
              {Object.entries(QUESTION_TYPE_LABELS).map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#0a2540', marginBottom: '0.375rem' }}>Question Label <span style={{ color: '#e63946' }}>*</span></label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. How satisfied are you with our product?"
              required
              style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1px solid #dee2e6', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#0a2540', boxSizing: 'border-box' }}
            />
          </div>
          {(type === SurveyQuestionType.SHORT_TEXT || type === SurveyQuestionType.LONG_TEXT) && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#0a2540', marginBottom: '0.375rem' }}>Placeholder (optional)</label>
              <input
                value={placeholder}
                onChange={(e) => setPlaceholder(e.target.value)}
                placeholder="e.g. Share your thoughts…"
                style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1px solid #dee2e6', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#0a2540', boxSizing: 'border-box' }}
              />
            </div>
          )}
          {showOptions && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#0a2540', marginBottom: '0.375rem' }}>Options (one per line) <span style={{ color: '#e63946' }}>*</span></label>
              <textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder={'Option A\nOption B\nOption C'}
                rows={4}
                style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1px solid #dee2e6', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#0a2540', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
          )}
          <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <input
              type="checkbox"
              id="required"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              style={{ accentColor: '#20A4A4', width: '1rem', height: '1rem' }}
            />
            <label htmlFor="required" style={{ fontSize: '0.8125rem', color: '#495057' }}>Required question</label>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #dee2e6', background: '#fff', color: '#495057', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
            <button type="submit" disabled={isPending || !label.trim()} style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: '#0a2540', color: '#fff', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 600, opacity: isPending || !label.trim() ? 0.6 : 1 }}>
              {isPending ? 'Adding…' : 'Add Question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function SurveyDetailPage() {
  const { orgSlug, id: surveyId } = useParams<{ orgSlug: string; id: string }>();
  const { role } = useCurrentMemberRole();
  const canEdit = role === 'ADMIN' || role === 'EDITOR';

  const { data: survey, isLoading } = useSurveyDetail('', surveyId);
  const { data: responsesData } = useSurveyResponses('', surveyId);
  const { mutate: publish, isPending: publishing } = usePublishSurvey('', surveyId);
  const { mutate: unpublish, isPending: unpublishing } = useUnpublishSurvey('', surveyId);
  const { mutate: close, isPending: closing } = useCloseSurvey('', surveyId);
  const { mutate: deleteSurvey } = useDeleteSurvey('', surveyId);
  const { mutate: deleteQuestion } = useDeleteQuestion('', surveyId);

  const [activeTab, setActiveTab] = useState<'questions' | 'responses' | 'intelligence'>('questions');

  // Intelligence
  const { data: intelligence, isLoading: loadingIntel } = useSurveyIntelligence('', surveyId);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const r = appRoutes(orgSlug);

  if (isLoading || !survey) {
    return (
      <div style={{ ...CARD, padding: '3rem', textAlign: 'center', color: '#6C757D' }}>
        Loading survey…
      </div>
    );
  }

  const cfg = STATUS_CONFIG[survey.status as SurveyStatus] ?? STATUS_CONFIG[SurveyStatus.DRAFT];

  const TYPE_LABELS: Record<SurveyType, string> = {
    [SurveyType.NPS]:                'NPS',
    [SurveyType.CSAT]:               'CSAT',
    [SurveyType.FEATURE_VALIDATION]: 'Feature Validation',
    [SurveyType.ROADMAP_VALIDATION]: 'Roadmap Validation',
    [SurveyType.CHURN_SIGNAL]:       'Churn Signal',
    [SurveyType.OPEN_INSIGHT]:       'Open Insight',
    [SurveyType.CUSTOM]:             'Custom',
  };
  // Correct public URL: /:orgSlug/portal/surveys/:id
  const pub = publicRoutes(orgSlug);
  const portalUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}${pub.portalSurveyItem(surveyId)}`;

  return (
    <>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', fontSize: '0.8125rem', color: '#6C757D' }}>
        <Link href={r.surveys} style={{ color: '#20A4A4', textDecoration: 'none', fontWeight: 500 }}>Surveys</Link>
        <span>/</span>
        <span style={{ color: '#0a2540', fontWeight: 600 }}>{survey.title}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0a2540', margin: 0 }}>{survey.title}</h1>
            <span style={{ ...cfg, padding: '0.2rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>{cfg.label}</span>
            {survey.surveyType && (
              <span style={{ background: '#e3f2fd', color: '#1565c0', padding: '0.2rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>
                {TYPE_LABELS[survey.surveyType as SurveyType] ?? survey.surveyType}
              </span>
            )}
          </div>
          {survey.description && (
            <p style={{ color: '#6C757D', fontSize: '0.875rem', margin: 0 }}>{survey.description}</p>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap', alignItems: 'center' }}>


          {canEdit && survey.status === SurveyStatus.DRAFT && (
            <button
              onClick={() => publish(undefined)}
              disabled={publishing}
              style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#2e7d32', color: '#fff', fontSize: '0.8125rem', cursor: publishing ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: publishing ? 0.7 : 1 }}
            >
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
          )}
          {canEdit && survey.status === SurveyStatus.PUBLISHED && (
            <>
              <button
                onClick={() => unpublish(undefined)}
                disabled={unpublishing}
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #dee2e6', background: '#fff', color: '#495057', fontSize: '0.8125rem', cursor: unpublishing ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: unpublishing ? 0.7 : 1 }}
              >
                {unpublishing ? 'Unpublishing…' : 'Unpublish'}
              </button>
              <button
                onClick={() => close(undefined)}
                disabled={closing}
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #dee2e6', background: '#fff', color: '#b8860b', fontSize: '0.8125rem', cursor: closing ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: closing ? 0.7 : 1 }}
              >
                {closing ? 'Closing…' : 'Close Survey'}
              </button>
            </>
          )}
          {canEdit && (
            <button
              onClick={() => {
                if (confirm('Delete this survey? This cannot be undone.')) {
                  deleteSurvey(undefined, { onSuccess: () => { window.location.href = `/${orgSlug}/app/surveys`; } });
                }
              }}
              style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #ffcdd2', background: '#fff5f5', color: '#c62828', fontSize: '0.8125rem', cursor: 'pointer', fontWeight: 500 }}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.875rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Questions', value: survey.questions?.length ?? 0, color: '#0a2540' },
          { label: 'Responses', value: survey._count?.responses ?? responsesData?.total ?? 0, color: '#20A4A4' },
          { label: 'AI-Ready', value: survey.convertToFeedback ? 'Yes' : 'No', color: survey.convertToFeedback ? '#2e7d32' : '#6C757D' },
        ].map((s) => (
          <div key={s.label} style={{ ...CARD, padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.7rem', color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.25rem' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Public URL */}
      {survey.status === SurveyStatus.PUBLISHED && (
        <div style={{ ...CARD, marginBottom: '1.5rem', background: '#e8f7f7', border: '1px solid #20A4A433' }}>
          <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#20A4A4', marginBottom: '0.375rem' }}>Public Survey URL</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <code style={{ fontSize: '0.8125rem', color: '#0a2540', background: '#fff', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #dee2e6', flex: 1, wordBreak: 'break-all' }}>
              {portalUrl}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(portalUrl)}
              style={{ padding: '0.375rem 0.875rem', borderRadius: '0.375rem', border: '1px solid #20A4A4', background: '#fff', color: '#20A4A4', fontSize: '0.8125rem', cursor: 'pointer', fontWeight: 500, flexShrink: 0 }}
            >
              Copy
            </button>
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: '0.375rem 0.875rem', borderRadius: '0.375rem', border: 'none', background: '#20A4A4', color: '#fff', fontSize: '0.8125rem', textDecoration: 'none', fontWeight: 500, flexShrink: 0 }}
            >
              Open ↗
            </a>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '2px solid #e9ecef' }}>
        {(['questions', 'responses', 'intelligence'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.625rem 1.25rem',
              border: 'none',
              background: 'none',
              fontSize: '0.875rem',
              fontWeight: activeTab === tab ? 700 : 500,
              color: activeTab === tab ? '#20A4A4' : '#6C757D',
              borderBottom: activeTab === tab ? '2px solid #20A4A4' : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: '-2px',
              textTransform: 'capitalize',
            }}
          >
            {tab === 'responses' && responsesData ? `Responses (${responsesData.total})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Questions tab */}
      {activeTab === 'questions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAddQuestion(true)}
                style={{ padding: '0.5rem 1.125rem', borderRadius: '0.5rem', border: 'none', background: '#0a2540', color: '#fff', fontSize: '0.8125rem', cursor: 'pointer', fontWeight: 600 }}
              >
                + Add Question
              </button>
            </div>
          )}
          {!survey.questions?.length ? (
            <div style={{ ...CARD, textAlign: 'center', padding: '2.5rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📝</div>
              <p style={{ color: '#6C757D', fontSize: '0.875rem' }}>No questions yet. Add your first question to get started.</p>
            </div>
          ) : (
            survey.questions.map((q, i) => (
              <div key={q.id} style={{ ...CARD, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6C757D', minWidth: '1.5rem' }}>Q{i + 1}</span>
                    <span style={{ background: '#e0f7fa', color: '#00838f', padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600 }}>
                      {QUESTION_TYPE_LABELS[q.type as SurveyQuestionType] ?? q.type}
                    </span>
                    {q.required && (
                      <span style={{ background: '#fce4ec', color: '#c62828', padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600 }}>Required</span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#0a2540', margin: '0 0 0.25rem' }}>{q.label}</p>
                  {q.placeholder && (
                    <p style={{ fontSize: '0.8125rem', color: '#6C757D', margin: 0, fontStyle: 'italic' }}>Placeholder: {q.placeholder}</p>
                  )}
                  {q.options && q.options.length > 0 && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                      {q.options.map((opt: string) => (
                        <span key={opt} style={{ background: '#f0f4f8', color: '#495057', padding: '0.2rem 0.625rem', borderRadius: '999px', fontSize: '0.75rem' }}>{opt}</span>
                      ))}
                    </div>
                  )}
                </div>
                {canEdit && (
                  <button
                    onClick={() => {
                      if (confirm('Delete this question?')) deleteQuestion(q.id);
                    }}
                    style={{ padding: '0.375rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #ffcdd2', background: '#fff5f5', color: '#c62828', fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0 }}
                  >
                    Delete
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Responses tab */}
      {activeTab === 'responses' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {!responsesData?.data?.length ? (
            <div style={{ ...CARD, textAlign: 'center', padding: '2.5rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📊</div>
              <p style={{ color: '#6C757D', fontSize: '0.875rem' }}>No responses yet. Share the survey link to start collecting responses.</p>
            </div>
          ) : (
            responsesData.data.map((resp: any) => (
              <div key={resp.id} style={{ ...CARD }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0a2540', margin: 0 }}>
                      {resp.respondentEmail ?? resp.respondentName ?? 'Anonymous'}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: '#6C757D', margin: 0 }}>
                      {new Date(resp.submittedAt ?? resp.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {resp.feedbackId && (
                    <Link href={`/${orgSlug}/app/inbox/${resp.feedbackId}`} style={{ fontSize: '0.8125rem', color: '#20A4A4', fontWeight: 500, textDecoration: 'none' }}>
                      View generated Feedback →
                    </Link>
                  )}
                </div>
                {resp.answers?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {resp.answers.map((ans: any, ai: number) => (
                      <div key={ai} style={{ background: '#f8f9fa', borderRadius: '0.5rem', padding: '0.625rem 0.875rem' }}>
                        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6C757D', margin: '0 0 0.2rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {ans.questionLabel ?? `Q${ai + 1}`}
                        </p>
                        <p style={{ fontSize: '0.875rem', color: '#0a2540', margin: 0 }}>
                          {Array.isArray(ans.value) ? ans.value.join(', ') : String(ans.value ?? '—')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Intelligence tab */}
      {activeTab === 'intelligence' && (
        <div>
          {loadingIntel ? (
            <div style={{ ...CARD, padding: '2rem', textAlign: 'center', color: '#6C757D' }}>Loading intelligence…</div>
          ) : !intelligence ? (
            <div style={{ ...CARD, textAlign: 'center', padding: '2.5rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🧠</div>
              <p style={{ color: '#6C757D', fontSize: '0.875rem' }}>No intelligence data yet. Intelligence is generated automatically after each response is submitted.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                {[
                  { label: 'Total Responses', value: intelligence.totalResponses, color: '#0a2540' },
                  { label: 'Processed', value: intelligence.processedCount, color: '#20A4A4' },
                  {
                    label: 'Avg Sentiment',
                    value: intelligence.avgSentiment != null
                      ? `${intelligence.avgSentiment > 0 ? '+' : ''}${intelligence.avgSentiment.toFixed(2)}`
                      : '—',
                    color: intelligence.avgSentiment == null ? '#6C757D'
                      : intelligence.avgSentiment > 0.1 ? '#2e7d32'
                      : intelligence.avgSentiment < -0.1 ? '#e63946'
                      : '#b8860b',
                  },
                  {
                    label: 'NPS Score',
                    value: intelligence.npsScore != null ? `${intelligence.npsScore > 0 ? '+' : ''}${intelligence.npsScore}` : '—',
                    color: intelligence.npsScore == null ? '#6C757D'
                      : intelligence.npsScore >= 30 ? '#2e7d32'
                      : intelligence.npsScore >= 0 ? '#b8860b'
                      : '#e63946',
                  },
                  {
                    label: 'Avg Rating',
                    value: intelligence.avgRating != null ? `${intelligence.avgRating.toFixed(1)}/5` : '—',
                    color: intelligence.avgRating == null ? '#6C757D' : '#0a2540',
                  },
                  { label: 'Linked Themes', value: intelligence.linkedThemeIds?.length ?? 0, color: '#7c3aed' },
                ].map((kpi) => (
                  <div key={kpi.label} style={{ ...CARD, padding: '1rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.375rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                    <div style={{ fontSize: '0.7rem', color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.25rem' }}>{kpi.label}</div>
                  </div>
                ))}
              </div>

              {/* Insight Score + Sentiment Distribution */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {/* Insight Score */}
                {intelligence.insightScore != null && (
                  <div style={{ ...CARD }}>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0a2540', marginBottom: '0.75rem' }}>🧠 AI Insight Score</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ fontSize: '2.5rem', fontWeight: 800, color: intelligence.insightScore >= 70 ? '#2e7d32' : intelligence.insightScore >= 40 ? '#b8860b' : '#e63946' }}>
                        {Math.round(intelligence.insightScore)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ height: '0.5rem', background: '#f0f4f8', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${intelligence.insightScore}%`, background: intelligence.insightScore >= 70 ? '#2e7d32' : intelligence.insightScore >= 40 ? '#b8860b' : '#e63946', borderRadius: '999px', transition: 'width 0.5s' }} />
                        </div>
                        <p style={{ fontSize: '0.75rem', color: '#6C757D', margin: '0.375rem 0 0' }}>Quality of extracted intelligence from responses</p>
                      </div>
                    </div>
                  </div>
                )}
                {/* Sentiment Distribution */}
                {intelligence.sentimentDistribution && (
                  <div style={{ ...CARD }}>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0a2540', marginBottom: '0.75rem' }}>😊 Sentiment Distribution</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {[
                        { label: 'Positive', value: intelligence.sentimentDistribution.positive, color: '#2e7d32', bg: '#e8f5e9' },
                        { label: 'Neutral',  value: intelligence.sentimentDistribution.neutral,  color: '#b8860b', bg: '#fff8e1' },
                        { label: 'Negative', value: intelligence.sentimentDistribution.negative, color: '#c62828', bg: '#fce4ec' },
                      ].map((row) => (
                        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: row.color, width: '4.5rem', flexShrink: 0 }}>{row.label}</span>
                          <div style={{ flex: 1, height: '0.5rem', background: '#f0f4f8', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${row.value}%`, background: row.color, borderRadius: '999px', transition: 'width 0.5s' }} />
                          </div>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: row.color, width: '2.5rem', textAlign: 'right' }}>{row.value}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Top Feature Requests + Pain Points */}
              {((intelligence.topFeatureRequests ?? []).length > 0 || (intelligence.topPainPoints ?? []).length > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {(intelligence.topFeatureRequests ?? []).length > 0 && (
                    <div style={{ ...CARD }}>
                      <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0a2540', marginBottom: '0.75rem' }}>🔬 Top Feature Requests</h3>
                      <ul style={{ margin: 0, padding: '0 0 0 1.125rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        {(intelligence.topFeatureRequests ?? []).map((req: string, i: number) => (
                          <li key={i} style={{ fontSize: '0.8125rem', color: '#495057', lineHeight: 1.5 }}>{req}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(intelligence.topPainPoints ?? []).length > 0 && (
                    <div style={{ ...CARD }}>
                      <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0a2540', marginBottom: '0.75rem' }}>⚠️ Top Pain Points</h3>
                      <ul style={{ margin: 0, padding: '0 0 0 1.125rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        {(intelligence.topPainPoints ?? []).map((pt: string, i: number) => (
                          <li key={i} style={{ fontSize: '0.8125rem', color: '#495057', lineHeight: 1.5 }}>{pt}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Key Topics */}
              {intelligence.keyTopics?.length > 0 && (
                <div style={{ ...CARD }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0a2540', marginBottom: '0.875rem' }}>Key Topics</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {intelligence.keyTopics.map((topic: string) => (
                      <span key={topic} style={{ background: '#e0f7fa', color: '#00838f', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.8125rem', fontWeight: 500 }}>
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Linked Global Themes — titled links to the shared theme system */}
              <div style={{ ...CARD }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>Linked Global Themes</h3>
                  <span style={{ fontSize: '0.72rem', color: '#6C757D', background: '#f0f4f8', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>from unified AI engine</span>
                </div>
                {(intelligence.linkedThemes?.length ?? intelligence.linkedThemeIds?.length ?? 0) === 0 ? (
                  <p style={{ fontSize: '0.875rem', color: '#6C757D', margin: 0 }}>
                    No global themes linked yet. Themes are linked automatically when survey text responses are converted to feedback signals and clustered by the AI engine.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {(intelligence.linkedThemes ?? intelligence.linkedThemeIds.map((id: string) => ({ id, title: null }))).map(
                      (theme: { id: string; title: string | null }) => (
                        <a
                          key={theme.id}
                          href={`/${orgSlug}/app/themes/${theme.id}`}
                          style={{ background: '#ede9fe', color: '#7c3aed', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.8125rem', fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                          {theme.title ?? 'Theme'} ↗
                        </a>
                      )
                    )}
                  </div>
                )}
              </div>

              {/* Question Breakdowns — structured evidence analytics (NPS / Rating / Choice) */}
              {(intelligence.questionBreakdowns?.length ?? 0) > 0 && (
                <div style={{ ...CARD }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0a2540', marginBottom: '0.25rem' }}>Structured Question Analytics</h3>
                  <p style={{ fontSize: '0.78rem', color: '#6C757D', margin: '0 0 1rem' }}>Aggregated responses for rating, NPS, and choice questions. These are stored as structured evidence — not text themes.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {intelligence.questionBreakdowns!.map((qb) => {
                      const total = qb.responseCount;
                      const entries = Object.entries(qb.distribution);
                      const maxCount = Math.max(...entries.map(([, v]) => v), 1);
                      const isNps = qb.type === SurveyQuestionType.NPS;
                      const isRating = qb.type === SurveyQuestionType.RATING;
                      return (
                        <div key={qb.questionId}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0a2540', flex: 1 }}>{qb.label}</span>
                            <span style={{ fontSize: '0.7rem', background: '#f0f4f8', color: '#6C757D', padding: '0.1rem 0.4rem', borderRadius: '999px' }}>
                              {isNps ? 'NPS' : isRating ? 'Rating' : 'Choice'}
                            </span>
                            {qb.avg != null && (
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#20A4A4' }}>avg {qb.avg.toFixed(1)}</span>
                            )}
                            <span style={{ fontSize: '0.7rem', color: '#adb5bd' }}>{total} responses</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            {entries.map(([label, count]) => {
                              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                              const barColor = isNps
                                ? label.startsWith('Promoter') ? '#2e7d32'
                                  : label.startsWith('Detractor') ? '#c62828' : '#b8860b'
                                : '#20A4A4';
                              return (
                                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span style={{ fontSize: '0.75rem', color: '#495057', width: '9rem', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                                  <div style={{ flex: 1, background: '#f0f4f8', borderRadius: '999px', height: '0.5rem', overflow: 'hidden' }}>
                                    <div style={{ width: `${(count / maxCount) * 100}%`, background: barColor, height: '100%', borderRadius: '999px', transition: 'width 0.3s' }} />
                                  </div>
                                  <span style={{ fontSize: '0.72rem', color: '#6C757D', width: '2.5rem', textAlign: 'right', flexShrink: 0 }}>{pct}%</span>
                                  <span style={{ fontSize: '0.7rem', color: '#adb5bd', width: '1.5rem', textAlign: 'right', flexShrink: 0 }}>{count}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Revenue-Weighted Intelligence Card — all fields safely guarded */}
              {intelligence.revenueWeighted && (
                <div style={{ ...CARD, border: '1px solid #ffe0b2', background: 'linear-gradient(135deg, #fff8f0 0%, #fff3e0 100%)' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#e65100', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>💰</span> Revenue-Weighted Intelligence
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                    {[
                      { label: 'Revenue Score',   value: safeRound(intelligence.revenueWeighted.revenueWeightedScore), color: '#e65100' },
                      { label: 'Validation Score', value: intelligence.revenueWeighted.validationScore != null ? `${safeRound(intelligence.revenueWeighted.validationScore)}%` : '—', color: '#6a1b9a' },
                      { label: 'Respondent ARR',  value: safeArrK(intelligence.revenueWeighted.totalRespondentArr), color: '#1565c0' },
                      { label: 'Avg CIQ Weight',  value: safeFixed(intelligence.revenueWeighted.avgCiqWeight, 2), color: '#20A4A4' },
                      { label: 'Enterprise Val.', value: intelligence.revenueWeighted.enterpriseValidation != null ? `${safeRound(intelligence.revenueWeighted.enterpriseValidation)}%` : '—', color: '#2e7d32' },
                      { label: 'SMB Val.',         value: intelligence.revenueWeighted.smbValidation != null ? `${safeRound(intelligence.revenueWeighted.smbValidation)}%` : '—', color: '#0a2540' },
                    ].map((kpi) => (
                      <div key={kpi.label} style={{ background: '#fff', border: '1px solid #ffe0b2', borderRadius: '0.625rem', padding: '0.75rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                        <div style={{ fontSize: '0.65rem', color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '0.2rem' }}>{kpi.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Response Clusters */}
                  {(intelligence.revenueWeighted.clusters?.length ?? 0) > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0a2540', marginBottom: '0.5rem' }}>Response Clusters</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {intelligence.revenueWeighted.clusters.map((cluster) => (
                          <div key={cluster.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.875rem', background: '#fff', border: '1px solid #ffe0b2', borderRadius: '0.5rem' }}>
                            <span style={{
                              padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700,
                              background: cluster.label === 'Promoter' ? '#e8f5e9' : cluster.label === 'Detractor' ? '#fce4ec' : '#fff8e1',
                              color: cluster.label === 'Promoter' ? '#2e7d32' : cluster.label === 'Detractor' ? '#c62828' : '#b8860b',
                            }}>{cluster.label}</span>
                            <span style={{ fontSize: '0.8125rem', color: '#0a2540', fontWeight: 600 }}>{cluster.count} respondents</span>
                            <span style={{ fontSize: '0.8125rem', color: '#6C757D' }}>{safeArrK(cluster.totalArr)}</span>
                            <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                              {cluster.topTopics.slice(0, 3).map((t) => (
                                <span key={t} style={{ background: '#f0f4f8', color: '#495057', padding: '0.1rem 0.375rem', borderRadius: '999px', fontSize: '0.7rem' }}>{t}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Top Features by ARR */}
                  {(intelligence.revenueWeighted.topFeaturesByArr?.length ?? 0) > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0a2540', marginBottom: '0.5rem' }}>🔬 Top Features by ARR Demand</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        {intelligence.revenueWeighted.topFeaturesByArr.slice(0, 5).map((f, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                            <span style={{ fontSize: '0.75rem', color: '#adb5bd', width: '1rem', flexShrink: 0 }}>#{i + 1}</span>
                            <span style={{ flex: 1, fontSize: '0.8125rem', color: '#0a2540' }}>{f.feature}</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1565c0' }}>{safeArrK(f.arr)}</span>
                            <span style={{ fontSize: '0.7rem', color: '#6C757D' }}>{f.count} votes</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Churn Signal Panel */}
              {intelligence.revenueWeighted && (intelligence.revenueWeighted.churnSignals?.length ?? 0) > 0 && (
                <div style={{ ...CARD, border: '1px solid #ffcdd2', background: 'linear-gradient(135deg, #fff5f5 0%, #fce4ec 100%)' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#c62828', marginBottom: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>🚨</span> Churn Risk Signals ({intelligence.revenueWeighted.churnSignals.length} customers)
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {intelligence.revenueWeighted.churnSignals.map((signal) => (
                      <div key={signal.customerId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.875rem', background: '#fff', border: '1px solid #ffcdd2', borderRadius: '0.5rem' }}>
                        <span style={{
                          padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700,
                          background: signal.riskLevel === 'HIGH' ? '#fce4ec' : signal.riskLevel === 'MEDIUM' ? '#fff8e1' : '#f0f4f8',
                          color: signal.riskLevel === 'HIGH' ? '#c62828' : signal.riskLevel === 'MEDIUM' ? '#b8860b' : '#6C757D',
                        }}>{signal.riskLevel}</span>
                        <span style={{ flex: 1, fontSize: '0.8125rem', fontWeight: 600, color: '#0a2540' }}>{signal.customerName}</span>
                        <span style={{ fontSize: '0.75rem', color: '#6C757D' }}>{safeArrK(signal.arr)}</span>
                        {signal.npsScore != null && (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: signal.npsScore <= 3 ? '#c62828' : '#b8860b' }}>NPS: {signal.npsScore}</span>
                        )}
                        {signal.sentiment != null && (
                          <span style={{ fontSize: '0.75rem', color: signal.sentiment < -0.5 ? '#c62828' : '#b8860b' }}>
                            Sentiment: {(signal.sentiment as number).toFixed(2)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* How survey data feeds the unified system */}
              <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', border: '1px solid #a7f3d0', borderRadius: '0.75rem', padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.625rem' }}>
                  <span style={{ fontSize: '1rem' }}>🔗</span>
                  <strong style={{ fontSize: '0.8125rem', color: '#065f46' }}>How this survey feeds the unified intelligence system</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.625rem', marginBottom: '0.75rem' }}>
                  {[
                    { icon: '📝', label: 'Text responses', desc: 'Converted to Feedback signals, processed by AI, and clustered into global themes' },
                    { icon: '📊', label: 'Rating & NPS answers', desc: 'Stored as structured evidence and contribute to CIQ scoring via surveySignal component' },
                    { icon: '🎯', label: 'Linked themes', desc: 'Survey evidence strengthens the same global themes used by feedback, support, and voice' },
                    { icon: '🗺️', label: 'Roadmap impact', desc: 'Themes with survey evidence appear in the priority ranking and roadmap with survey contribution visible' },
                  ].map((item) => (
                    <div key={item.label} style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #a7f3d0', borderRadius: '0.5rem', padding: '0.625rem 0.75rem' }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#065f46', marginBottom: '0.2rem' }}>{item.icon} {item.label}</div>
                      <div style={{ fontSize: '0.75rem', color: '#047857', lineHeight: 1.4 }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '0.78rem', color: '#065f46', margin: 0 }}>
                  There is a single roadmap and a single priority model. Survey signals do not create a separate score — they strengthen the same global themes as feedback, support, and voice.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {showAddQuestion && (
        <AddQuestionModal surveyId={surveyId} workspaceId="" onClose={() => setShowAddQuestion(false)} />
      )}


    </>
  );
}
