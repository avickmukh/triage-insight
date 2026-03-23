'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  usePrioritizationSettings,
  useUpdatePrioritizationSettings,
  useRecalculateAllThemes,
} from '@/hooks/use-ciq';
import { useCurrentMemberRole } from '@/hooks/use-workspace';
import { PrioritizationSettings, WorkspaceRole } from '@/lib/api-types';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 700,
  color: '#0a2540',
  marginBottom: '1rem',
  paddingBottom: '0.5rem',
  borderBottom: '1px solid #f0f4f8',
};

const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#6C757D',
  marginBottom: '0.375rem',
};

// ─── Weight groups ─────────────────────────────────────────────────────────────
const SIGNAL_WEIGHTS: Array<{ key: keyof PrioritizationSettings; label: string; description: string }> = [
  { key: 'requestFrequencyWeight', label: 'Request Frequency', description: 'How often this theme is requested across all feedback' },
  { key: 'customerCountWeight',    label: 'Customer Count',    description: 'Number of unique customers requesting this theme' },
  { key: 'arrValueWeight',         label: 'ARR Value',         description: 'Total ARR of customers linked to this theme' },
  { key: 'accountPriorityWeight',  label: 'Account Priority',  description: 'Strategic tier of accounts requesting this theme' },
  { key: 'dealValueWeight',        label: 'Deal Value',        description: 'Open deal pipeline value associated with this theme' },
  { key: 'strategicWeight',        label: 'Strategic Fit',     description: 'Manual strategic alignment score' },
  { key: 'voteWeight',             label: 'Portal Votes',      description: 'Public portal upvotes on linked feedback' },
  { key: 'sentimentWeight',        label: 'Sentiment',         description: 'Average sentiment score of linked feedback' },
  { key: 'recencyWeight',          label: 'Recency',           description: 'How recently feedback was submitted' },
];

const DEAL_STAGE_WEIGHTS: Array<{ key: keyof PrioritizationSettings; label: string }> = [
  { key: 'dealStageProspecting',  label: 'Prospecting' },
  { key: 'dealStageQualifying',   label: 'Qualifying' },
  { key: 'dealStageProposal',     label: 'Proposal' },
  { key: 'dealStageNegotiation',  label: 'Negotiation' },
  { key: 'dealStageClosedWon',    label: 'Closed Won' },
];

// ─── Weight slider component ───────────────────────────────────────────────────
function WeightSlider({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const pct = Math.round(value * 100);
  const color = pct >= 60 ? '#e63946' : pct >= 30 ? '#f4a261' : '#20A4A4';
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.375rem' }}>
        <label style={LABEL}>{label}</label>
        <span style={{ fontSize: '0.875rem', fontWeight: 700, color }}>{pct}%</span>
      </div>
      {description && (
        <p style={{ fontSize: '0.72rem', color: '#adb5bd', margin: '0 0 0.375rem', lineHeight: 1.4 }}>{description}</p>
      )}
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        style={{ width: '100%', accentColor: color, cursor: disabled ? 'not-allowed' : 'pointer' }}
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AiSettingsPage() {
  const params = useParams();
  const slug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';

  const { role } = useCurrentMemberRole();
  const isAdmin = role === WorkspaceRole.ADMIN;

  const { data: settings, isLoading, isError } = usePrioritizationSettings();
  const updateSettings = useUpdatePrioritizationSettings();
  const recalculateAll = useRecalculateAllThemes();

  const [draft, setDraft] = useState<Partial<PrioritizationSettings>>({});
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [rescoreMsg, setRescoreMsg] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Populate draft when settings load
  useEffect(() => {
    if (settings) {
      setDraft({ ...settings });
      setIsDirty(false);
    }
  }, [settings]);

  const handleChange = (key: keyof PrioritizationSettings, value: number) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    updateSettings.mutate(draft, {
      onSuccess: () => {
        setSaveMsg('Settings saved successfully.');
        setIsDirty(false);
        setTimeout(() => setSaveMsg(null), 4000);
      },
      onError: (err) => {
        setSaveMsg(`Error: ${err.message}`);
        setTimeout(() => setSaveMsg(null), 5000);
      },
    });
  };

  const handleRescoreAll = () => {
    recalculateAll.mutate(undefined, {
      onSuccess: (res) => {
        setRescoreMsg(`${res.enqueued} scoring jobs enqueued. Scores will update in a few seconds.`);
        setTimeout(() => setRescoreMsg(null), 8000);
      },
      onError: (err) => {
        setRescoreMsg(`Error: ${err.message}`);
        setTimeout(() => setRescoreMsg(null), 5000);
      },
    });
  };

  const getVal = (key: keyof PrioritizationSettings): number =>
    (draft[key] as number | undefined) ?? (settings?.[key] as number | undefined) ?? 0;

  if (!isAdmin) {
    return (
      <div style={{ ...CARD, background: '#fff5f5', border: '1px solid #f5c6cb', padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#e63946', fontWeight: 600, margin: 0 }}>Admin access required</p>
        <p style={{ color: '#6C757D', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
          Only workspace administrators can modify AI scoring settings.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0a2540', margin: 0 }}>
            AI Priority Settings
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#6C757D', margin: '0.25rem 0 0' }}>
            Configure the CIQ scoring weights that determine theme priority rankings
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleRescoreAll}
            disabled={recalculateAll.isPending}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
              border: '1px solid #b3d4f5', background: '#f0f7ff',
              fontSize: '0.875rem', cursor: recalculateAll.isPending ? 'not-allowed' : 'pointer',
              color: '#1a6fc4', fontWeight: 600, opacity: recalculateAll.isPending ? 0.6 : 1,
            }}
          >
            {recalculateAll.isPending ? 'Enqueueing…' : '↻ Rescore All Themes'}
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || updateSettings.isPending}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
              border: 'none', background: isDirty ? '#0a2540' : '#ced4da',
              fontSize: '0.875rem', cursor: (!isDirty || updateSettings.isPending) ? 'not-allowed' : 'pointer',
              color: '#fff', fontWeight: 600,
            }}
          >
            {updateSettings.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Banners */}
      {saveMsg && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '0.625rem',
          background: saveMsg.startsWith('Error') ? '#fff5f5' : '#e8f5e9',
          border: `1px solid ${saveMsg.startsWith('Error') ? '#f5c6cb' : '#a5d6a7'}`,
          color: saveMsg.startsWith('Error') ? '#e63946' : '#2e7d32',
          fontSize: '0.875rem',
        }}>
          {saveMsg}
        </div>
      )}
      {rescoreMsg && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '0.625rem',
          background: rescoreMsg.startsWith('Error') ? '#fff5f5' : '#e8f4fd',
          border: `1px solid ${rescoreMsg.startsWith('Error') ? '#f5c6cb' : '#b3d4f5'}`,
          color: rescoreMsg.startsWith('Error') ? '#e63946' : '#1a6fc4',
          fontSize: '0.875rem',
        }}>
          {rescoreMsg}
        </div>
      )}

      {isLoading && (
        <div style={{ ...CARD, padding: '2rem', textAlign: 'center', color: '#adb5bd' }}>
          Loading settings…
        </div>
      )}

      {isError && (
        <div style={{ ...CARD, background: '#fff5f5', border: '1px solid #f5c6cb', padding: '1.5rem', textAlign: 'center' }}>
          <p style={{ color: '#e63946', margin: 0 }}>Failed to load settings. Please refresh.</p>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {/* Signal weights */}
          <div style={CARD}>
            <h2 style={SECTION_TITLE}>Signal Weights</h2>
            <p style={{ fontSize: '0.8rem', color: '#6C757D', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
              These weights control how much each signal type contributes to the final CIQ priority score (0–100).
              Higher values give that signal more influence in the ranking.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(22rem, 1fr))', gap: '0 2rem' }}>
              {SIGNAL_WEIGHTS.map(({ key, label, description }) => (
                <WeightSlider
                  key={key}
                  label={label}
                  description={description}
                  value={getVal(key)}
                  onChange={(v) => handleChange(key, v)}
                  disabled={!isAdmin}
                />
              ))}
            </div>
          </div>

          {/* Deal stage multipliers */}
          <div style={CARD}>
            <h2 style={SECTION_TITLE}>Deal Stage Multipliers</h2>
            <p style={{ fontSize: '0.8rem', color: '#6C757D', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
              Multiply the deal value contribution based on the deal&apos;s current stage.
              Deals further along the pipeline have more influence on priority.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))', gap: '0 2rem' }}>
              {DEAL_STAGE_WEIGHTS.map(({ key, label }) => (
                <WeightSlider
                  key={key}
                  label={label}
                  value={getVal(key)}
                  onChange={(v) => handleChange(key, v)}
                  disabled={!isAdmin}
                />
              ))}
            </div>
          </div>

          {/* Formula reference */}
          <div
            style={{
              ...CARD,
              background: 'linear-gradient(135deg, #f0f7ff 0%, #e8f4fd 100%)',
              border: '1px solid #b3d4f5',
            }}
          >
            <h2 style={{ ...SECTION_TITLE, borderBottomColor: '#b3d4f5' }}>CIQ Formula Reference</h2>
            <p style={{ fontSize: '0.8rem', color: '#495057', margin: '0 0 0.75rem', lineHeight: 1.6 }}>
              The CIQ priority score is computed as a weighted sum of normalised signals:
            </p>
            <pre style={{
              background: '#fff', border: '1px solid #dce8f5', borderRadius: '0.5rem',
              padding: '0.875rem 1rem', fontSize: '0.78rem', color: '#0a2540',
              overflowX: 'auto', lineHeight: 1.7, margin: 0,
            }}>
{`CIQ Score =
  (requestFrequency × requestFrequencyWeight)
+ (customerCount    × customerCountWeight)
+ (arrValue         × arrValueWeight)
+ (accountPriority  × accountPriorityWeight)
+ (dealValue        × dealValueWeight × dealStageMultiplier)
+ (strategicFit     × strategicWeight)
+ (portalVotes      × voteWeight)
+ (sentiment        × sentimentWeight)
+ (recencyScore     × recencyWeight)

All inputs are normalised to [0, 100] before weighting.
Final score is clamped to [0, 100].`}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
