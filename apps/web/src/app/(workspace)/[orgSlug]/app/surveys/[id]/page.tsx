'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useCurrentMemberRole } from '@/hooks/use-workspace';
import {
  useSurveyDetail,
  usePublishSurvey,
  useUnpublishSurvey,
  useCloseSurvey,
  useDeleteSurvey,
  useAddQuestion,
  useDeleteQuestion,
  useSurveyResponses,
} from '@/hooks/use-surveys';
import { SurveyStatus, SurveyQuestionType } from '@/lib/api-types';
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

const QUESTION_TYPE_LABELS: Record<SurveyQuestionType, string> = {
  [SurveyQuestionType.SHORT_TEXT]:      'Short Text',
  [SurveyQuestionType.LONG_TEXT]:       'Long Text',
  [SurveyQuestionType.SINGLE_CHOICE]:   'Single Choice',
  [SurveyQuestionType.MULTIPLE_CHOICE]: 'Multiple Choice',
  [SurveyQuestionType.RATING]:          'Rating Scale',
  [SurveyQuestionType.NPS]:             'NPS (0–10)',
};

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

  const [activeTab, setActiveTab] = useState<'questions' | 'responses'>('questions');
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
  const portalUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/${orgSlug}/surveys/${surveyId}`;

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0a2540', margin: 0 }}>{survey.title}</h1>
            <span style={{ ...cfg, padding: '0.2rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>{cfg.label}</span>
          </div>
          {survey.description && (
            <p style={{ color: '#6C757D', fontSize: '0.9rem', margin: 0 }}>{survey.description}</p>
          )}
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
            {survey.status === SurveyStatus.DRAFT && (
              <button
                onClick={() => publish()}
                disabled={publishing}
                style={{ padding: '0.5rem 1.125rem', borderRadius: '0.5rem', border: 'none', background: '#2e7d32', color: '#fff', fontSize: '0.8125rem', cursor: 'pointer', fontWeight: 600, opacity: publishing ? 0.6 : 1 }}
              >
                {publishing ? 'Publishing…' : '▶ Publish'}
              </button>
            )}
            {survey.status === SurveyStatus.PUBLISHED && (
              <>
                <button
                  onClick={() => unpublish()}
                  disabled={unpublishing}
                  style={{ padding: '0.5rem 1.125rem', borderRadius: '0.5rem', border: '1px solid #dee2e6', background: '#fff', color: '#495057', fontSize: '0.8125rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  Unpublish
                </button>
                <button
                  onClick={() => close()}
                  disabled={closing}
                  style={{ padding: '0.5rem 1.125rem', borderRadius: '0.5rem', border: '1px solid #dee2e6', background: '#fff', color: '#e63946', fontSize: '0.8125rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  Close Survey
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Portal link banner */}
      {survey.status === SurveyStatus.PUBLISHED && (
        <div style={{ background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: '0.75rem', padding: '0.875rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span>🌐</span>
            <div>
              <strong style={{ fontSize: '0.875rem', color: '#0d47a1' }}>Survey is live on your public portal</strong>
              <p style={{ margin: '0.125rem 0 0', fontSize: '0.8rem', color: '#1565c0', fontFamily: 'monospace' }}>{portalUrl}</p>
            </div>
          </div>
          <a href={portalUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8125rem', color: '#1565c0', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            View live ↗
          </a>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Questions', value: survey.questions?.length ?? 0, color: '#0a2540' },
          { label: 'Responses', value: survey._count?.responses ?? responsesData?.total ?? 0, color: '#20A4A4' },
          { label: 'AI-Ready', value: survey.convertToFeedback ? 'Yes' : 'No', color: survey.convertToFeedback ? '#2e7d32' : '#6C757D' },
          { label: 'Status', value: cfg.label, color: cfg.color },
        ].map((stat) => (
          <div key={stat.label} style={{ ...CARD, padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '0.7rem', color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.25rem' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid #e9ecef', marginBottom: '1.5rem' }}>
        {(['questions', 'responses'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.625rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '0.875rem', fontWeight: 600,
              color: activeTab === tab ? '#0a2540' : '#6C757D',
              borderBottom: activeTab === tab ? '2px solid #0a2540' : '2px solid transparent',
              marginBottom: '-2px', transition: 'all 0.15s',
              textTransform: 'capitalize',
            }}
          >
            {tab} {tab === 'responses' && responsesData ? `(${responsesData.total})` : ''}
          </button>
        ))}
      </div>

      {/* Questions tab */}
      {activeTab === 'questions' && (
        <div>
          {canEdit && survey.status !== SurveyStatus.CLOSED && (
            <div style={{ marginBottom: '1rem' }}>
              <button
                onClick={() => setShowAddQuestion(true)}
                style={{ padding: '0.5rem 1.125rem', borderRadius: '0.5rem', border: '1px dashed #20A4A4', background: 'transparent', color: '#20A4A4', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 600 }}
              >
                + Add Question
              </button>
            </div>
          )}

          {!survey.questions?.length ? (
            <div style={{ ...CARD, textAlign: 'center', padding: '2.5rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>❓</div>
              <p style={{ color: '#6C757D', fontSize: '0.875rem' }}>No questions yet. Add your first question to get started.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {survey.questions.map((q: any, idx: number) => (
                <div key={q.id} style={{ ...CARD, display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', background: '#f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8125rem', fontWeight: 700, color: '#0a2540', flexShrink: 0 }}>
                    {idx + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0a2540' }}>{q.label}</span>
                      {q.required && <span style={{ fontSize: '0.7rem', color: '#e63946', fontWeight: 600 }}>Required</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', background: '#f0f4f8', color: '#495057', padding: '0.15rem 0.5rem', borderRadius: '0.3rem', fontWeight: 500 }}>
                        {QUESTION_TYPE_LABELS[q.type as SurveyQuestionType]}
                      </span>
                      {q.placeholder && (
                        <span style={{ fontSize: '0.75rem', color: '#adb5bd' }}>Placeholder: "{q.placeholder}"</span>
                      )}
                      {q.options && Array.isArray(q.options) && (
                        <span style={{ fontSize: '0.75rem', color: '#6C757D' }}>{q.options.length} options</span>
                      )}
                    </div>
                  </div>
                  {canEdit && survey.status !== SurveyStatus.CLOSED && (
                    <button
                      onClick={() => { if (confirm('Delete this question?')) deleteQuestion(q.id); }}
                      style={{ background: 'none', border: 'none', color: '#adb5bd', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem', flexShrink: 0 }}
                      title="Delete question"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Responses tab */}
      {activeTab === 'responses' && (
        <div>
          {!responsesData?.data?.length ? (
            <div style={{ ...CARD, textAlign: 'center', padding: '2.5rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📬</div>
              <p style={{ color: '#6C757D', fontSize: '0.875rem' }}>No responses yet. Share the survey link to start collecting responses.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {responsesData.data.map((resp: any) => (
                <div key={resp.id} style={{ ...CARD }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0a2540' }}>
                        {resp.respondentName ?? resp.respondentEmail ?? resp.portalUser?.email ?? 'Anonymous'}
                      </span>
                      {resp.respondentEmail && (
                        <span style={{ fontSize: '0.75rem', color: '#6C757D', marginLeft: '0.5rem' }}>{resp.respondentEmail}</span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#adb5bd' }}>
                      {new Date(resp.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {resp.answers?.map((ans: any) => (
                      <div key={ans.id} style={{ background: '#f8f9fa', borderRadius: '0.5rem', padding: '0.625rem 0.875rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6C757D', marginBottom: '0.25rem' }}>
                          Q{ans.question?.order}: {ans.question?.label}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#0a2540' }}>
                          {ans.textValue ?? (ans.numericValue != null ? String(ans.numericValue) : null) ?? (ans.choiceValues ? (ans.choiceValues as string[]).join(', ') : '—')}
                        </div>
                      </div>
                    ))}
                  </div>
                  {resp.feedbackId && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f0f4f8' }}>
                      <Link href={`/${orgSlug}/app/inbox/${resp.feedbackId}`} style={{ fontSize: '0.8125rem', color: '#20A4A4', fontWeight: 500, textDecoration: 'none' }}>
                        View generated Feedback →
                      </Link>
                    </div>
                  )}
                </div>
              ))}
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
