'use client';
/**
 * Prioritization Settings — /:orgSlug/app/prioritization/settings
 *
 * Allows ADMIN to configure the 4-dimension weights and other scoring parameters.
 * Also provides the strategic override control for individual themes.
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { usePrioritizationSettings, useUpdatePrioritizationSettings, useRecompute } from '@/hooks/use-prioritization';
import { useWorkspace } from '@/hooks/use-workspace';
import { appRoutes } from '@/lib/routes';

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

function WeightSlider({ label, description, value, onChange }: {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
        <div>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0a2540' }}>{label}</span>
          <span style={{ fontSize: '0.75rem', color: '#6C757D', marginLeft: '0.5rem' }}>{description}</span>
        </div>
        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#20A4A4', minWidth: 40, textAlign: 'right' }}>
          {(value * 100).toFixed(0)}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(parseInt(e.target.value) / 100)}
        style={{ width: '100%', accentColor: '#20A4A4' }}
      />
    </div>
  );
}

export default function PrioritizationSettingsPage() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const routes = appRoutes(orgSlug);
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';

  const { data: settings, isLoading } = usePrioritizationSettings(workspaceId);
  const updateSettings = useUpdatePrioritizationSettings(workspaceId);
  const recompute = useRecompute(workspaceId);

  const [demandWeight, setDemandWeight] = useState(0.35);
  const [revenueWeight, setRevenueWeight] = useState(0.30);
  const [strategicWeight, setStrategicWeight] = useState(0.20);
  const [urgencyWeight, setUrgencyWeight] = useState(0.15);

  useEffect(() => {
    if (settings) {
      setDemandWeight((settings as any).demandStrengthWeight ?? 0.35);
      setRevenueWeight((settings as any).revenueImpactWeight ?? 0.30);
      setStrategicWeight((settings as any).strategicImportanceWeight ?? 0.20);
      setUrgencyWeight((settings as any).urgencySignalWeight ?? 0.15);
    }
  }, [settings]);

  const totalWeight = demandWeight + revenueWeight + strategicWeight + urgencyWeight;
  const isBalanced = Math.abs(totalWeight - 1.0) < 0.01;

  const handleSave = () => {
    updateSettings.mutate({
      demandStrengthWeight: demandWeight,
      revenueImpactWeight: revenueWeight,
      strategicImportanceWeight: strategicWeight,
      urgencySignalWeight: urgencyWeight,
    } as any);
  };

  const handleSaveAndRecompute = async () => {
    await updateSettings.mutateAsync({
      demandStrengthWeight: demandWeight,
      revenueImpactWeight: revenueWeight,
      strategicImportanceWeight: strategicWeight,
      urgencySignalWeight: urgencyWeight,
    } as any);
    recompute.mutate();
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <Link href={routes.prioritization} style={{ color: '#6C757D', textDecoration: 'none', fontSize: '0.875rem' }}>Prioritization</Link>
          <span style={{ color: '#6C757D' }}>›</span>
          <span style={{ fontSize: '0.875rem', color: '#0a2540', fontWeight: 500 }}>Settings</span>
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>Prioritization Settings</h1>
        <p style={{ color: '#6C757D', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
          Configure the 4-dimension scoring weights that drive all priority rankings
        </p>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6C757D' }}>Loading settings…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* ── Weight Configuration ── */}
          <div style={CARD}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: '0 0 0.25rem' }}>Scoring Dimension Weights</h2>
            <p style={{ color: '#6C757D', fontSize: '0.875rem', margin: '0 0 1.5rem' }}>
              Adjust how each dimension contributes to the final priority score. Weights should sum to 100%.
            </p>

            {/* Weight balance indicator */}
            <div style={{ padding: '0.625rem 1rem', borderRadius: '0.5rem', marginBottom: '1.5rem', background: isBalanced ? '#e8f5e9' : '#fff3cd', border: `1px solid ${isBalanced ? '#a5d6a7' : '#ffe082'}` }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: isBalanced ? '#2e7d32' : '#b8860b' }}>
                {isBalanced ? '✓ Weights are balanced (100%)' : `⚠ Weights sum to ${(totalWeight * 100).toFixed(0)}% — should be 100%`}
              </span>
            </div>

            <WeightSlider
              label="Demand Strength"
              description="Vote count, velocity, unique customers"
              value={demandWeight}
              onChange={setDemandWeight}
            />
            <WeightSlider
              label="Revenue Impact"
              description="ARR influence, deal value, account priority"
              value={revenueWeight}
              onChange={setRevenueWeight}
            />
            <WeightSlider
              label="Strategic Importance"
              description="Theme alignment, roadmap fit, strategic tags"
              value={strategicWeight}
              onChange={setStrategicWeight}
            />
            <WeightSlider
              label="Urgency Signal"
              description="Sentiment urgency, complaint rate, support spikes"
              value={urgencyWeight}
              onChange={setUrgencyWeight}
            />

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={handleSave}
                disabled={updateSettings.isPending || !isBalanced}
                style={{ padding: '0.625rem 1.25rem', background: '#f0f4f8', color: '#0a2540', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, opacity: (updateSettings.isPending || !isBalanced) ? 0.6 : 1 }}>
                {updateSettings.isPending ? 'Saving…' : 'Save Settings'}
              </button>
              <button
                onClick={handleSaveAndRecompute}
                disabled={updateSettings.isPending || recompute.isPending || !isBalanced}
                style={{ padding: '0.625rem 1.25rem', background: '#20A4A4', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, opacity: (updateSettings.isPending || recompute.isPending || !isBalanced) ? 0.6 : 1 }}>
                {(updateSettings.isPending || recompute.isPending) ? 'Processing…' : 'Save & Recompute All'}
              </button>
            </div>
          </div>

          {/* ── Scoring Explanation ── */}
          <div style={CARD}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: '0 0 1rem' }}>How Scores Are Computed</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {[
                { title: 'Demand Strength', color: '#1a73e8', factors: ['Vote count (log-normalised)', 'Vote velocity (7-day)', 'Unique customer count', 'Duplicate cluster size'] },
                { title: 'Revenue Impact', color: '#20A4A4', factors: ['Customer ARR sum', 'Deal influence value', 'Account priority tier', 'MRR contribution'] },
                { title: 'Strategic Importance', color: '#b8860b', factors: ['Theme alignment score', 'Roadmap item linkage', 'Manual strategic tag', 'CIQ theme score'] },
                { title: 'Urgency Signal', color: '#c62828', factors: ['Sentiment negativity', 'Complaint rate', 'Support spike count', 'Voice urgency signals'] },
              ].map(dim => (
                <div key={dim.title} style={{ padding: '1rem', background: '#f8f9fa', borderRadius: '0.625rem', borderLeft: `3px solid ${dim.color}` }}>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', fontWeight: 700, color: dim.color }}>{dim.title}</p>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                    {dim.factors.map(f => (
                      <li key={f} style={{ fontSize: '0.75rem', color: '#6C757D', marginBottom: '0.125rem' }}>{f}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* ── Manual Override Guide ── */}
          <div style={CARD}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: '0 0 0.5rem' }}>Manual Override</h2>
            <p style={{ color: '#6C757D', fontSize: '0.875rem', margin: '0 0 1rem' }}>
              You can set a manual override score (0–100) on individual themes from the Theme Ranking page. Override scores replace the computed score and are marked with a purple badge. You can also assign strategic tags (strategic, core, nice-to-have, deprioritised) to influence roadmap recommendations.
            </p>
            <Link href={routes.prioritization}
              style={{ display: 'inline-block', padding: '0.5rem 1rem', background: '#e8f7f7', color: '#20A4A4', borderRadius: '0.5rem', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600 }}>
              Go to Theme Ranking →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
