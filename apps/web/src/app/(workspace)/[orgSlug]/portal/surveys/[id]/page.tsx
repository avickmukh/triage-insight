'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { usePublicSurveyDetail, useSubmitSurveyResponse } from '@/hooks/use-surveys';
import { SurveyQuestionType } from '@/lib/api-types';

// ─── Question renderer ─────────────────────────────────────────────────────────
function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: any;
  value: any;
  onChange: (v: any) => void;
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.625rem 0.875rem',
    border: '1.5px solid #dee2e6',
    borderRadius: '0.5rem',
    fontSize: '0.9375rem',
    color: '#0a2540',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  switch (question.type as SurveyQuestionType) {
    case SurveyQuestionType.SHORT_TEXT:
      return (
        <input
          type="text"
          value={value?.textValue ?? ''}
          onChange={(e) => onChange({ textValue: e.target.value })}
          placeholder={question.placeholder ?? 'Your answer…'}
          style={inputStyle}
          onFocus={(e) => (e.target.style.borderColor = '#20A4A4')}
          onBlur={(e) => (e.target.style.borderColor = '#dee2e6')}
        />
      );

    case SurveyQuestionType.LONG_TEXT:
      return (
        <textarea
          value={value?.textValue ?? ''}
          onChange={(e) => onChange({ textValue: e.target.value })}
          placeholder={question.placeholder ?? 'Share your thoughts…'}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' }}
          onFocus={(e) => (e.target.style.borderColor = '#20A4A4')}
          onBlur={(e) => (e.target.style.borderColor = '#dee2e6')}
        />
      );

    case SurveyQuestionType.SINGLE_CHOICE:
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {(question.options as string[] ?? []).map((opt: string) => {
            const selected = value?.choiceValues?.[0] === opt;
            return (
              <label
                key={opt}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.625rem 0.875rem',
                  border: `1.5px solid ${selected ? '#20A4A4' : '#dee2e6'}`,
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  background: selected ? '#e8f7f7' : '#fff',
                  transition: 'all 0.15s',
                }}
              >
                <input
                  type="radio"
                  checked={selected}
                  onChange={() => onChange({ choiceValues: [opt] })}
                  style={{ accentColor: '#20A4A4', width: '1rem', height: '1rem' }}
                />
                <span style={{ fontSize: '0.9375rem', color: '#0a2540' }}>{opt}</span>
              </label>
            );
          })}
        </div>
      );

    case SurveyQuestionType.MULTIPLE_CHOICE:
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {(question.options as string[] ?? []).map((opt: string) => {
            const selected = (value?.choiceValues ?? []).includes(opt);
            return (
              <label
                key={opt}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.625rem 0.875rem',
                  border: `1.5px solid ${selected ? '#20A4A4' : '#dee2e6'}`,
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  background: selected ? '#e8f7f7' : '#fff',
                  transition: 'all 0.15s',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => {
                    const current: string[] = value?.choiceValues ?? [];
                    const next = selected ? current.filter((v) => v !== opt) : [...current, opt];
                    onChange({ choiceValues: next });
                  }}
                  style={{ accentColor: '#20A4A4', width: '1rem', height: '1rem' }}
                />
                <span style={{ fontSize: '0.9375rem', color: '#0a2540' }}>{opt}</span>
              </label>
            );
          })}
        </div>
      );

    case SurveyQuestionType.RATING: {
      const min = question.ratingMin ?? 1;
      const max = question.ratingMax ?? 5;
      const steps = Array.from({ length: max - min + 1 }, (_, i) => i + min);
      const selected = value?.numericValue;
      return (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {steps.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ numericValue: n })}
              style={{
                width: '2.75rem', height: '2.75rem',
                borderRadius: '0.5rem',
                border: `1.5px solid ${selected === n ? '#20A4A4' : '#dee2e6'}`,
                background: selected === n ? '#20A4A4' : '#fff',
                color: selected === n ? '#fff' : '#0a2540',
                fontSize: '0.9375rem', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {n}
            </button>
          ))}
        </div>
      );
    }

    case SurveyQuestionType.NPS: {
      const steps = Array.from({ length: 11 }, (_, i) => i);
      const selected = value?.numericValue;
      return (
        <div>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            {steps.map((n) => {
              const color = n >= 9 ? '#2e7d32' : n >= 7 ? '#b8860b' : '#e63946';
              const isSelected = selected === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange({ numericValue: n })}
                  style={{
                    width: '2.75rem', height: '2.75rem',
                    borderRadius: '0.5rem',
                    border: `1.5px solid ${isSelected ? color : '#dee2e6'}`,
                    background: isSelected ? color : '#fff',
                    color: isSelected ? '#fff' : '#0a2540',
                    fontSize: '0.875rem', fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6C757D' }}>
            <span>0 — Not at all likely</span>
            <span>10 — Extremely likely</span>
          </div>
        </div>
      );
    }

    default:
      return <input type="text" value={value?.textValue ?? ''} onChange={(e) => onChange({ textValue: e.target.value })} style={inputStyle} />;
  }
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function PortalSurveyPage() {
  const { orgSlug, id: surveyId } = useParams<{ orgSlug: string; id: string }>();
  const { data: survey, isLoading, isError } = usePublicSurveyDetail(orgSlug, surveyId);
  const { mutate: submitResponse, isPending: submitting } = useSubmitSurveyResponse(orgSlug, surveyId);

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [respondentEmail, setRespondentEmail] = useState('');
  const [respondentName, setRespondentName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<any>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const handleAnswerChange = (questionId: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setErrors((prev) => { const next = { ...prev }; delete next[questionId]; return next; });
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    for (const q of survey?.questions ?? []) {
      if (!q.required) continue;
      const ans = answers[q.id];
      const hasValue =
        (ans?.textValue && ans.textValue.trim()) ||
        (ans?.numericValue != null) ||
        (ans?.choiceValues && ans.choiceValues.length > 0);
      if (!hasValue) newErrors[q.id] = 'This question is required.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setGlobalError(null);

    const payload = {
      respondentEmail: respondentEmail.trim() || undefined,
      respondentName: respondentName.trim() || undefined,
      answers: Object.entries(answers).map(([questionId, val]) => ({
        questionId,
        textValue: val?.textValue ?? undefined,
        numericValue: val?.numericValue ?? undefined,
        choiceValues: val?.choiceValues ?? undefined,
      })),
    };

    submitResponse(payload, {
      onSuccess: (result) => {
        setSubmitResult(result);
        setSubmitted(true);
      },
      onError: (err: any) => {
        setGlobalError(err?.message ?? 'Failed to submit. Please try again.');
      },
    });
  };

  if (isLoading) {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center', padding: '4rem 1rem', color: '#6C757D' }}>
        Loading survey…
      </div>
    );
  }

  if (isError || !survey) {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center', padding: '4rem 1rem' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ color: '#0a2540', marginBottom: '0.5rem' }}>Survey not found</h2>
        <p style={{ color: '#6C757D' }}>This survey may have been closed or does not exist.</p>
        <Link href={`/${orgSlug}/portal/surveys`} style={{ color: '#20A4A4', fontWeight: 600 }}>← Back to surveys</Link>
      </div>
    );
  }

  // ── Completion state ────────────────────────────────────────────────────────
  if (submitted) {
    const redirectUrl = submitResult?.redirectUrl;
    if (redirectUrl) {
      if (typeof window !== 'undefined') window.location.href = redirectUrl;
    }
    return (
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{
          background: '#fff', border: '1px solid #e9ecef', borderRadius: '1rem',
          padding: '3rem 2rem', textAlign: 'center',
          boxShadow: '0 2px 12px rgba(10,37,64,0.08)',
        }}>
          <div style={{ width: '4rem', height: '4rem', borderRadius: '50%', background: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '1.75rem' }}>
            ✅
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0a2540', marginBottom: '0.75rem' }}>
            Thank you!
          </h2>
          <p style={{ color: '#495057', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            {submitResult?.thankYouMessage ?? 'Your response has been recorded. We appreciate your feedback!'}
          </p>
          {survey.convertToFeedback && (
            <p style={{ color: '#6C757D', fontSize: '0.8125rem', background: '#f8f9fa', borderRadius: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1.5rem' }}>
              Your text responses have been added to the product team's feedback inbox for review.
            </p>
          )}
          <Link
            href={`/${orgSlug}/portal/surveys`}
            style={{ color: '#20A4A4', fontWeight: 600, fontSize: '0.9375rem', textDecoration: 'none' }}
          >
            ← Back to surveys
          </Link>
        </div>
      </div>
    );
  }

  // ── Survey form ─────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Survey header */}
      <div style={{ marginBottom: '2rem' }}>
        <Link href={`/${orgSlug}/portal/surveys`} style={{ fontSize: '0.8125rem', color: '#20A4A4', fontWeight: 500, textDecoration: 'none', display: 'inline-block', marginBottom: '1rem' }}>
          ← All surveys
        </Link>
        <h1 style={{ fontSize: '1.625rem', fontWeight: 800, color: '#0a2540', margin: '0 0 0.5rem' }}>
          {survey.title}
        </h1>
        {survey.description && (
          <p style={{ color: '#495057', fontSize: '0.9375rem', lineHeight: 1.6, margin: 0 }}>
            {survey.description}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        {/* Respondent info (optional) */}
        <div style={{
          background: '#fff', border: '1px solid #e9ecef', borderRadius: '0.875rem',
          padding: '1.5rem', marginBottom: '1.25rem',
          boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
        }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0a2540', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Your Information (optional)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#495057', marginBottom: '0.375rem' }}>Name</label>
              <input
                type="text"
                value={respondentName}
                onChange={(e) => setRespondentName(e.target.value)}
                placeholder="Your name"
                style={{ width: '100%', padding: '0.5625rem 0.75rem', border: '1.5px solid #dee2e6', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#0a2540', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#495057', marginBottom: '0.375rem' }}>Email</label>
              <input
                type="email"
                value={respondentEmail}
                onChange={(e) => setRespondentEmail(e.target.value)}
                placeholder="your@email.com"
                style={{ width: '100%', padding: '0.5625rem 0.75rem', border: '1.5px solid #dee2e6', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#0a2540', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        </div>

        {/* Questions */}
        {survey.questions?.map((q: any, idx: number) => (
          <div
            key={q.id}
            style={{
              background: '#fff', border: `1.5px solid ${errors[q.id] ? '#e63946' : '#e9ecef'}`,
              borderRadius: '0.875rem', padding: '1.5rem', marginBottom: '1.25rem',
              boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
              <span style={{
                width: '1.75rem', height: '1.75rem', borderRadius: '50%',
                background: '#0a2540', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
              }}>
                {idx + 1}
              </span>
              <div>
                <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#0a2540', margin: 0, lineHeight: 1.4 }}>
                  {q.label}
                  {q.required && <span style={{ color: '#e63946', marginLeft: '0.25rem' }}>*</span>}
                </p>
              </div>
            </div>

            <QuestionInput
              question={q}
              value={answers[q.id]}
              onChange={(v) => handleAnswerChange(q.id, v)}
            />

            {errors[q.id] && (
              <p style={{ color: '#e63946', fontSize: '0.8125rem', marginTop: '0.5rem', margin: '0.5rem 0 0' }}>
                {errors[q.id]}
              </p>
            )}
          </div>
        ))}

        {globalError && (
          <div style={{ background: '#fdecea', border: '1px solid #f5c6cb', borderRadius: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1rem', color: '#c62828', fontSize: '0.875rem' }}>
            {globalError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%', padding: '0.875rem', borderRadius: '0.625rem',
            border: 'none', background: '#0a2540',
            color: '#fff', fontSize: '1rem', cursor: 'pointer', fontWeight: 700,
            opacity: submitting ? 0.7 : 1, transition: 'opacity 0.15s',
          }}
        >
          {submitting ? 'Submitting…' : 'Submit Response'}
        </button>

        <p style={{ textAlign: 'center', color: '#adb5bd', fontSize: '0.75rem', marginTop: '1rem' }}>
          Powered by <a href="/" style={{ color: '#20A4A4', fontWeight: 600, textDecoration: 'none' }}>TriageInsight</a>
        </p>
      </form>
    </div>
  );
}
