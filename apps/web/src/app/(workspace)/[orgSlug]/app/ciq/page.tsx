'use client';
/**
 * CIQ Dashboard — /:orgSlug/app/ciq
 *
 * Comprehensive Customer Intelligence Quotient dashboard exposing all four
 * CIQ scoring outputs in a single view:
 *
 *   1. Strategic Signal Summary (KPI row)
 *   2. Top Themes by CIQ Score — with source mix bars + Promote to Roadmap CTA
 *   3. Top Feature Requests by CIQ Score — with signal breakdown
 *   4. Top Customers by CIQ Influence Score
 *   5. Roadmap Recommendations from strategic signals
 *   6. Signal Feed
 *
 * Includes:
 *   - Source mix bars (voice / survey / support) per theme
 *   - Promote to Roadmap modal wired to each theme row
 *   - Recompute button (ADMIN / EDITOR)
 *   - Search filter for themes and features
 */
import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  useCiqStrategicSignals,
  useCiqThemeRanking,
  useCiqFeatureRanking,
  useCiqCustomerRanking,
  useCiqRecompute,
} from '@/hooks/use-ciq';
import { useWorkspace } from '@/hooks/use-workspace';
import { appRoutes } from '@/lib/routes';
import { CiqImpactBadge } from '@/components/ciq/CiqImpactBadge';
import { PromoteToRoadmapModal } from '@/components/roadmap/PromoteToRoadmapModal';
import { ThemeRankingItem, FeatureRankingItem, CustomerRankingItem } from '@/lib/api-types';
import { PageHeader } from '@/components/shared/ui/page-header';
import { CiqBreakdownBar } from '@/components/ciq/CiqBreakdownBar';

// ─── Design tokens ────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const SIGNAL_COLORS: Record<string, { bg: string; color: string }> = {
  theme:    { bg: '#e8f7f7', color: '#20A4A4' },
  feedback: { bg: '#e8f0fe', color: '#1a73e8' },
  deal:     { bg: '#fff3cd', color: '#b8860b' },
  customer: { bg: '#fce8ff', color: '#7c3aed' },
  voice:    { bg: '#e8f5e9', color: '#2e7d32' },
  survey:   { bg: '#fff8e1', color: '#f57c00' },
  support:  { bg: '#fdecea', color: '#c62828' },
};

const REC_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  promote_to_planned:   { bg: '#e8f7f7', color: '#20A4A4', label: 'Promote to Planned' },
  promote_to_committed: { bg: '#fff3cd', color: '#b8860b', label: 'Promote to Committed' },
  already_committed:    { bg: '#e8f5e9', color: '#2e7d32', label: 'Already Committed' },
  monitor:              { bg: '#f0f4f8', color: '#6C757D', label: 'Monitor' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function CiqScoreBar({ score, label }: { score: number; label?: string }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 70 ? '#20A4A4' : pct >= 40 ? '#f57c00' : '#c62828';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      {label && (
        <span style={{ fontSize: '0.7rem', color: '#6C757D', minWidth: 52, flexShrink: 0 }}>{label}</span>
      )}
      <div style={{ flex: 1, height: 5, background: '#e9ecef', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color, minWidth: 26, textAlign: 'right' }}>
        {Math.round(pct)}
      </span>
    </div>
  );
}

function SourceMixBar({
  voice, survey, support, voiceCount, supportCount, feedbackCount
}: {
  voice: number; survey: number; support: number;
  voiceCount?: number; supportCount?: number; feedbackCount?: number;
}) {
  const total = voice + survey + support;
  // Use actual counts for labels when available, fall back to signal scores
  const hasRealCounts = (voiceCount ?? 0) > 0 || (supportCount ?? 0) > 0 || (feedbackCount ?? 0) > 0;
  if (total === 0 && !hasRealCounts) return <span style={{ fontSize: '0.7rem', color: '#adb5bd' }}>No signals</span>;
  const segments = [
    { label: 'Feedback', value: feedbackCount ?? (total > 0 ? Math.max(0, feedbackCount ?? 0) : 0), color: '#1a73e8', isCount: true },
    { label: 'Voice', value: voiceCount ?? voice, color: '#2e7d32', isCount: hasRealCounts },
    { label: 'Support', value: supportCount ?? support, color: '#c62828', isCount: hasRealCounts },
    { label: 'Survey', value: survey, color: '#f57c00', isCount: false },
  ].filter(s => s.value > 0);
  if (segments.length === 0) return <span style={{ fontSize: '0.7rem', color: '#adb5bd' }}>No signals</span>;
  const segTotal = segments.reduce((s, seg) => s + seg.value, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
        {segments.map(s => (
          <div
            key={s.label}
            title={`${s.label}: ${Math.round(s.value)}${s.isCount ? '' : ' (signal)'}`}
            style={{ flex: s.value / segTotal, background: s.color, minWidth: 2 }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {segments.map(s => (
          <span key={s.label} style={{ fontSize: '0.62rem', color: s.color, fontWeight: 600 }}>
            {s.label[0]} {Math.round(s.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color = '#0a2540', onClick }: {
  label: string; value: string | number; sub?: string; color?: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{ ...CARD, flex: 1, minWidth: 150, cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow 0.15s' }}
      onMouseEnter={onClick ? (e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(10,37,64,0.12)'; } : undefined}
      onMouseLeave={onClick ? (e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(10,37,64,0.06)'; } : undefined}
    >
      <p style={{ margin: 0, fontSize: '0.7rem', color: '#6C757D', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
      <p style={{ margin: '0.25rem 0 0', fontSize: '1.5rem', fontWeight: 700, color }}>{value}</p>
      {sub && <p style={{ margin: '0.125rem 0 0', fontSize: '0.72rem', color: '#6C757D' }}>{sub}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CiqDashboardPage() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const router = useRouter();
  const routes = appRoutes(orgSlug);
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';

  // Data hooks
  const { data: signals, isLoading: signalsLoading } = useCiqStrategicSignals();
  const { data: themeRanking, isLoading: themesLoading } = useCiqThemeRanking(20);
  const { data: featureRanking, isLoading: featuresLoading } = useCiqFeatureRanking(100);
  const { data: customerRanking, isLoading: customersLoading } = useCiqCustomerRanking(10);
  const recompute = useCiqRecompute();

  // UI state
  const [themeSearch, setThemeSearch] = useState('');
  const [featureSearch, setFeatureSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'features' | 'customers' | 'signals'>('features');
  const [promoteModal, setPromoteModal] = useState<{ themeId: string; themeTitle: string } | null>(null);
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null);

  const isLoading = signalsLoading || themesLoading || featuresLoading || customersLoading;

  // Filtered lists
  const filteredThemes = useMemo(() => {
    if (!themeRanking) return [];
    if (!themeSearch.trim()) return themeRanking;
    const q = themeSearch.toLowerCase();
    return themeRanking.filter(t => t.title.toLowerCase().includes(q));
  }, [themeRanking, themeSearch]);

  // Detect "scoring in progress" state: themes exist but none have a CIQ score yet
  const scoringInProgress = useMemo(() => {
    if (!themeRanking || themeRanking.length === 0) return false;
    return themeRanking.every(t => !t.priorityScore && t.ciqScore === 0);
  }, [themeRanking]);
  const [expandedTheme, setExpandedTheme] = React.useState<string | null>(null);

  const filteredFeatures = useMemo(() => {
    if (!featureRanking) return [];
    if (!featureSearch.trim()) return featureRanking;
    const q = featureSearch.toLowerCase();
    return featureRanking.filter(f => f.title.toLowerCase().includes(q));
  }, [featureRanking, featureSearch]);

  const handleRecompute = async () => {
    try {
      const result = await recompute.mutateAsync();
      setRecomputeMsg(result.message ?? 'Recompute job enqueued.');
      setTimeout(() => setRecomputeMsg(null), 5000);
    } catch {
      setRecomputeMsg('Failed to enqueue recompute job.');
      setTimeout(() => setRecomputeMsg(null), 4000);
    }
  };

  // KPI values derived from signals
  const kpiCritical = signals?.topThemes?.filter(t => (t.ciqScore ?? 0) >= 70).length ?? 0;
  const kpiRecs = signals?.roadmapRecommendations?.filter(r => r.recommendation !== 'monitor').length ?? 0;
  const kpiVoiceUrgent = signals?.voiceSentimentSummary?.urgentCount ?? 0;
  const kpiSupportSpikes = signals?.supportSpikeSummary?.spikeCount ?? 0;

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: '0.4rem 1rem',
    borderRadius: '0.4rem',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.82rem',
    background: active ? '#0a2540' : '#f0f4f8',
    color: active ? '#fff' : '#0a2540',
    transition: 'background 0.15s',
  });

  return (
    <div style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Header ── */}
      <PageHeader
        stage="prioritization"
        title="CIQ Scoring"
        description="Customer Intelligence Quotient — composite business score across feedback volume, ARR exposure, voice urgency, support pressure, and strategic signals."
        nextAction="Run Recompute CIQ to score all active themes, then review Theme Ranking and Revenue Opps for action."
      />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href={routes.intelligence}
            style={{ padding: '0.45rem 1rem', background: '#f0f4f8', color: '#0a2540', borderRadius: '0.5rem', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 500 }}>
            Intelligence Hub
          </Link>
          <Link href={routes.prioritizationBoard}
            style={{ padding: '0.45rem 1rem', background: '#f0f4f8', color: '#0a2540', borderRadius: '0.5rem', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 500 }}>
            Priority Board
          </Link>
          <button
            onClick={handleRecompute}
            disabled={recompute.isPending}
            style={{
              padding: '0.45rem 1rem',
              background: recompute.isPending ? '#e9ecef' : '#0a2540',
              color: recompute.isPending ? '#6C757D' : '#fff',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: recompute.isPending ? 'not-allowed' : 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            {recompute.isPending ? 'Recomputing…' : '↻ Recompute CIQ'}
          </button>
        </div>
      </div>

      {/* Recompute feedback */}
      {recomputeMsg && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#e8f7f7', border: '1px solid #20A4A4', borderRadius: '0.5rem', color: '#0a2540', fontSize: '0.875rem' }}>
          {recomputeMsg}
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#6C757D', fontSize: '0.875rem' }}>
          Loading CIQ data…
        </div>
      ) : (
        <>
          {/* ── KPI Row ── */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <KpiCard
              label="Critical Themes"
              value={kpiCritical}
              sub="CIQ score ≥ 70"
              color={kpiCritical > 0 ? '#b91c1c' : '#0a2540'}
              onClick={() => router.push(routes.intelligenceThemes)}
            />
            <KpiCard
              label="Roadmap Actions"
              value={kpiRecs}
              sub="Promote / commit signals"
              color={kpiRecs > 0 ? '#b8860b' : '#0a2540'}
              onClick={() => router.push(routes.roadmap)}
            />
            <KpiCard
              label="Voice Urgent"
              value={kpiVoiceUrgent}
              sub="High-urgency voice signals"
              color={kpiVoiceUrgent > 0 ? '#c62828' : '#0a2540'}
            />
            <KpiCard
              label="Support Spikes"
              value={kpiSupportSpikes}
              sub="Active support pressure"
              color={kpiSupportSpikes > 0 ? '#c62828' : '#0a2540'}
            />
            <KpiCard
              label="Themes Scored"
              value={themeRanking?.length ?? 0}
              sub="Active themes with CIQ"
              onClick={() => router.push(routes.intelligenceThemes)}
            />
          </div>

          {/* ── Theme Ranking redirect card ── */}
          <div style={{ ...CARD, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0f9ff', border: '1px solid #bae6fd' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: '#0a2540', fontSize: '0.9rem' }}>Theme Ranking</p>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#6C757D' }}>Full ranked table of all active themes by CIQ score — with DRS, eligibility chips, trend, and signal breakdown.</p>
            </div>
            <Link href={routes.intelligenceThemes}
              style={{ padding: '0.5rem 1.1rem', background: '#0a2540', color: '#fff', borderRadius: '0.5rem', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
              View Theme Ranking →
            </Link>
          </div>

          {/* ── Tab Navigation ── */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <button style={TAB_STYLE(activeTab === 'features')} onClick={() => setActiveTab('features')}>
              Features ({filteredFeatures.length})
            </button>
            <button style={TAB_STYLE(activeTab === 'customers')} onClick={() => setActiveTab('customers')}>
              Customers ({customerRanking?.length ?? 0})
            </button>
            <button style={TAB_STYLE(activeTab === 'signals')} onClick={() => setActiveTab('signals')}>
              Signal Feed ({signals?.signals?.length ?? 0})
            </button>
          </div>

          {/* ── Themes Tab removed — see Theme Ranking page ── */}
          {false && (
            <div style={CARD}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>
                  Themes by CIQ Score
                </h2>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Search themes…"
                    value={themeSearch}
                    onChange={e => setThemeSearch(e.target.value)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      border: '1px solid #dee2e6',
                      borderRadius: '0.4rem',
                      fontSize: '0.82rem',
                      outline: 'none',
                      width: 180,
                    }}
                  />
                  <Link href={routes.intelligenceThemes}
                    style={{ fontSize: '0.8rem', color: '#20A4A4', textDecoration: 'none', fontWeight: 500 }}>
                    View all →
                  </Link>
                </div>
              </div>

              {filteredThemes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#6C757D', fontSize: '0.875rem' }}>
                  {themeSearch
                    ? 'No themes match your search.'
                    : scoringInProgress
                    ? '⏳ CIQ scoring is in progress — rankings will appear shortly. Click Recompute CIQ to trigger now.'
                    : 'No theme ranking data yet. Add feedback to get started.'}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e9ecef' }}>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, width: 32 }}>#</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#6C757D', fontWeight: 600 }}>Theme</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, width: 90 }}>Impact</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, width: 160 }}>CIQ Score</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, width: 140 }}>Source Mix</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, width: 60 }}>Signals</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, width: 60 }}>Customers</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: '#6C757D', fontWeight: 600, width: 40 }}></th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: '#6C757D', fontWeight: 600, width: 120 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredThemes.map((theme: ThemeRankingItem, i) => (<React.Fragment key={theme.themeId}>
                        <tr style={{ borderBottom: '1px solid #f0f4f8' }}>
                          <td style={{ padding: '0.6rem 0.75rem', color: '#adb5bd', fontWeight: 700, fontSize: '0.75rem' }}>
                            {i + 1}
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem' }}>
                            <Link
                              href={routes.themeItem(theme.themeId)}
                              style={{ fontWeight: 600, color: '#0a2540', textDecoration: 'none' }}
                            >
                              {theme.title}
                            </Link>
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem' }}>
                            <CiqImpactBadge score={theme.ciqScore} size="xs" />
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem' }}>
                            <CiqScoreBar score={theme.ciqScore} />
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem' }}>
                            <SourceMixBar
                              voice={theme.voiceSignalScore}
                              survey={theme.surveySignalScore}
                              support={theme.supportSignalScore}
                              voiceCount={theme.voiceCount}
                              supportCount={theme.supportCount}
                              feedbackCount={theme.feedbackCount}
                            />
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: '#0a2540', fontWeight: 600 }}>
                            <span title={`Feedback: ${theme.feedbackCount - (theme.voiceCount ?? 0)}, Voice: ${theme.voiceCount ?? 0}, Support: ${theme.supportCount ?? 0}`}>
                              {theme.totalSignalCount ?? theme.feedbackCount}
                            </span>
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: '#6C757D' }}>
                            {theme.uniqueCustomerCount}
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                            <button
                              onClick={() => setExpandedTheme(expandedTheme === theme.themeId ? null : theme.themeId)}
                              title={expandedTheme === theme.themeId ? 'Hide breakdown' : 'Show CIQ breakdown'}
                              style={{
                                background: 'transparent', border: 'none',
                                cursor: 'pointer', fontSize: '0.9rem', color: '#6C757D',
                                padding: '0.2rem 0.4rem',
                              }}
                            >
                              {expandedTheme === theme.themeId ? '▲' : '▼'}
                            </button>
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                            <button
                              onClick={() => setPromoteModal({ themeId: theme.themeId, themeTitle: theme.title })}
                              style={{
                                padding: '0.25rem 0.6rem',
                                background: '#e8f7f7',
                                color: '#20A4A4',
                                border: '1px solid #20A4A4',
                                borderRadius: '0.35rem',
                                cursor: 'pointer',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              + Roadmap
                            </button>
                          </td>
                        </tr>
                        {expandedTheme === theme.themeId && (
                          <tr>
                            <td colSpan={9} style={{ padding: '0.75rem 1rem 1rem', background: '#f8fafc', borderBottom: '2px solid #e9ecef' }}>
                              <CiqBreakdownBar
                                breakdown={theme.breakdown}
                                totalScore={theme.ciqScore}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Features Tab ── */}
          {activeTab === 'features' && (
            <div style={CARD}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>
                  Feature Requests by CIQ Score
                </h2>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Search features…"
                    value={featureSearch}
                    onChange={e => setFeatureSearch(e.target.value)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      border: '1px solid #dee2e6',
                      borderRadius: '0.4rem',
                      fontSize: '0.82rem',
                      outline: 'none',
                      width: 180,
                    }}
                  />
                  <Link href={routes.intelligenceFeatures}
                    style={{ fontSize: '0.8rem', color: '#20A4A4', textDecoration: 'none', fontWeight: 500 }}>
                    View all →
                  </Link>
                </div>
              </div>

              {filteredFeatures.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#6C757D', fontSize: '0.875rem' }}>
                  {featureSearch ? 'No features match your search.' : 'No feature ranking data yet.'}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e9ecef' }}>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, width: 32 }}>#</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#6C757D', fontWeight: 600 }}>Feature Request</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, width: 90 }}>Impact</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, width: 160 }}>CIQ Score</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, width: 60 }}>Votes</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, width: 80 }}>ARR Signal</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, width: 80 }}>Sentiment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFeatures.map((feat: FeatureRankingItem, i) => {
                        const sentColor = feat.sentiment != null
                          ? feat.sentiment >= 0.1 ? '#2e7d32' : feat.sentiment <= -0.1 ? '#c62828' : '#6C757D'
                          : '#adb5bd';
                        const sentLabel = feat.sentiment != null
                          ? feat.sentiment >= 0.1 ? 'Positive' : feat.sentiment <= -0.1 ? 'Negative' : 'Neutral'
                          : '—';
                        return (
                          <tr key={feat.feedbackId} style={{ borderBottom: '1px solid #f0f4f8' }}>
                            <td style={{ padding: '0.6rem 0.75rem', color: '#adb5bd', fontWeight: 700, fontSize: '0.75rem' }}>{i + 1}</td>
                            <td style={{ padding: '0.6rem 0.75rem' }}>
                              <Link
                                href={routes.inboxItem(feat.feedbackId)}
                                style={{ fontWeight: 600, color: '#0a2540', textDecoration: 'none' }}
                              >
                                {feat.title}
                              </Link>
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem' }}>
                              <CiqImpactBadge score={feat.ciqScore} size="xs" />
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem' }}>
                              <CiqScoreBar score={feat.ciqScore} />
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#0a2540' }}>
                              {feat.voteCount}
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: '#6C757D' }}>
                              {feat.customerArr > 0 ? `$${(feat.customerArr / 1000).toFixed(0)}k` : '—'}
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: sentColor }}>{sentLabel}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Customers Tab ── */}
          {activeTab === 'customers' && (
            <div style={CARD}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: 0 }}>
                  Customers by CIQ Influence Score
                </h2>
                <Link href={routes.intelligenceCustomers}
                  style={{ fontSize: '0.8rem', color: '#20A4A4', textDecoration: 'none', fontWeight: 500 }}>
                  View all →
                </Link>
              </div>

              {!customerRanking || customerRanking.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#6C757D', fontSize: '0.875rem' }}>
                  No customer ranking data yet.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e9ecef' }}>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, width: 32 }}>#</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#6C757D', fontWeight: 600 }}>Customer</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, width: 90 }}>Segment</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#6C757D', fontWeight: 600, width: 160 }}>CIQ Influence</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, width: 80 }}>ARR</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, width: 60 }}>Feedback</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#6C757D', fontWeight: 600, width: 60 }}>Deals</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerRanking.map((cust: CustomerRankingItem, i) => (
                        <tr key={cust.customerId} style={{ borderBottom: '1px solid #f0f4f8' }}>
                          <td style={{ padding: '0.6rem 0.75rem', color: '#adb5bd', fontWeight: 700, fontSize: '0.75rem' }}>{i + 1}</td>
                          <td style={{ padding: '0.6rem 0.75rem' }}>
                            <Link
                              href={routes.customerItem(cust.customerId)}
                              style={{ fontWeight: 600, color: '#0a2540', textDecoration: 'none' }}
                            >
                              {cust.name}
                            </Link>
                            {cust.companyName && (
                              <div style={{ fontSize: '0.72rem', color: '#6C757D' }}>{cust.companyName}</div>
                            )}
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem' }}>
                            {cust.segment ? (
                              <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', background: '#f0f4f8', borderRadius: '999px', color: '#0a2540', fontWeight: 600 }}>
                                {cust.segment}
                              </span>
                            ) : (
                              <span style={{ color: '#adb5bd', fontSize: '0.72rem' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem' }}>
                            <CiqScoreBar score={cust.ciqInfluenceScore} />
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#0a2540' }}>
                            {cust.arrValue > 0 ? `$${(cust.arrValue / 1000).toFixed(0)}k` : '—'}
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: '#6C757D' }}>
                            {cust.feedbackCount}
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: '#6C757D' }}>
                            {cust.dealCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Signals Tab ── */}
          {activeTab === 'signals' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Roadmap Recommendations */}
              {signals?.roadmapRecommendations && signals.roadmapRecommendations.length > 0 && (
                <div style={CARD}>
                  <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: '0 0 1rem' }}>
                    Roadmap Recommendations
                  </h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {signals.roadmapRecommendations.filter(r => r.recommendation !== 'monitor').map((rec, i) => {
                      const rc = REC_COLORS[rec.recommendation] ?? REC_COLORS.monitor;
                      return (
                        <div key={i} style={{ padding: '0.875rem', background: '#f8f9fa', borderRadius: '0.5rem', borderLeft: `3px solid ${rc.color}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <span style={{ padding: '0.15rem 0.5rem', background: rc.bg, color: rc.color, borderRadius: '0.25rem', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>
                              {rc.label}
                            </span>
                            <span style={{ fontWeight: 600, color: '#0a2540', fontSize: '0.875rem', flex: 1 }}>
                              {rec.title}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: '#6C757D' }}>CIQ {Math.round(rec.ciqScore)}</span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#6C757D' }}>{rec.rationale}</div>
                          <div style={{ marginTop: '0.5rem' }}>
                            <CiqScoreBar score={rec.ciqScore} />
                          </div>
                          <div style={{ marginTop: '0.5rem' }}>
                            <button
                              onClick={() => setPromoteModal({ themeId: rec.themeId, themeTitle: rec.title })}
                              style={{
                                padding: '0.25rem 0.6rem',
                                background: '#e8f7f7',
                                color: '#20A4A4',
                                border: '1px solid #20A4A4',
                                borderRadius: '0.35rem',
                                cursor: 'pointer',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                              }}
                            >
                              + Promote to Roadmap
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Signal Feed */}
              {signals?.signals && signals.signals.length > 0 && (
                <div style={CARD}>
                  <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: '0 0 1rem' }}>
                    Strategic Signal Feed
                  </h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
                    {signals.signals.slice(0, 18).map((sig, i) => {
                      const sc = SIGNAL_COLORS[sig.type] ?? { bg: '#f0f4f8', color: '#6C757D' };
                      return (
                        <div key={i} style={{ padding: '0.875rem', background: '#f8f9fa', borderRadius: '0.5rem', borderLeft: `3px solid ${sc.color}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                            <span style={{ padding: '0.15rem 0.4rem', background: sc.bg, color: sc.color, borderRadius: '0.25rem', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase' }}>
                              {sig.type}
                            </span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0a2540', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {sig.entityTitle}
                            </span>
                            <span style={{ fontSize: '0.68rem', color: '#6C757D', flexShrink: 0 }}>
                              {(sig.strength * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0a2540', marginBottom: '0.2rem' }}>{sig.signal}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6C757D' }}>{sig.detail}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(!signals?.signals || signals.signals.length === 0) &&
               (!signals?.roadmapRecommendations || signals.roadmapRecommendations.filter(r => r.recommendation !== 'monitor').length === 0) && (
                <div style={{ ...CARD, textAlign: 'center', padding: '3rem', color: '#6C757D', fontSize: '0.875rem' }}>
                  No strategic signals yet. CIQ scoring will generate signals as feedback, voice, and survey data accumulates.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Promote to Roadmap Modal ── */}
      {promoteModal && workspaceId && (
        <PromoteToRoadmapModal
          workspaceId={workspaceId}
          themeId={promoteModal.themeId}
          themeTitle={promoteModal.themeTitle}
          isOpen={true}
          onClose={() => setPromoteModal(null)}
          onSuccess={(roadmapItemId) => {
            setPromoteModal(null);
            router.push(routes.roadmapItem(roadmapItemId));
          }}
        />
      )}
    </div>
  );
}
