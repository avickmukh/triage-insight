'use client';

/**
 * AiConfidenceBadge
 *
 * Displays the AI CONFIDENCE level for a theme’s narration.
 *
 * Confidence = how certain the AI is about its summary, explanation, and
 * recommendation — based on signal volume, cluster cohesion, and consistency
 * of the underlying feedback.
 *
 * This is NOT the same as Decision Priority (CIQ score) or Evidence Quality
 * (cluster cohesion). Each measures a different dimension:
 *   - AI Confidence     → reliability of AI-generated narrative
 *   - Decision Priority → business urgency to act (from CIQ score)
 *   - Evidence Quality  → cohesion of the feedback cluster
 *
 * Thresholds:
 *   Confidence: High    ≥ 0.75  → green  — Rich, consistent evidence; insights can be trusted
 *   Confidence: Medium  ≥ 0.45  → amber  — Moderate evidence; review alongside raw feedback
 *   Confidence: Low     > 0     → slate  — Limited/noisy evidence; treat insights as provisional
 *   Not yet scored      null    → muted  — AI pipeline has not processed this theme
 */

import React from 'react';

interface AiConfidenceBadgeProps {
  confidence?: number | null;
  className?: string;
}

function getLevel(confidence: number | null | undefined): {
  label: string;
  tooltip: string;
  className: string;
} {
  if (confidence == null) {
    return {
      label: 'Not yet scored',
      tooltip: 'AI Confidence: Not yet scored — the AI pipeline has not processed this theme yet.',
      className: 'bg-slate-100 text-slate-400',
    };
  }
  const pct = Math.round(confidence * 100);
  if (confidence >= 0.75) {
    return {
      label: 'Confidence: High',
      tooltip: `AI Confidence: High (${pct}%) — The AI had rich, consistent evidence to generate reliable insights. Summaries and recommendations can be trusted.`,
      className: 'bg-emerald-100 text-emerald-700',
    };
  }
  if (confidence >= 0.45) {
    return {
      label: 'Confidence: Medium',
      tooltip: `AI Confidence: Medium (${pct}%) — Moderate evidence available. Review AI insights alongside the raw feedback before acting.`,
      className: 'bg-amber-100 text-amber-700',
    };
  }
  return {
    label: 'Confidence: Low',
    tooltip: `AI Confidence: Low (${pct}%) — Limited or inconsistent evidence. AI insights are provisional. Gather more feedback signals before relying on them.`,
    className: 'bg-slate-100 text-slate-500',
  };
}

export function AiConfidenceBadge({ confidence, className = '' }: AiConfidenceBadgeProps) {
  const { label, tooltip, className: levelClass } = getLevel(confidence);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium cursor-help ${levelClass} ${className}`}
      title={tooltip}
    >
      {label}
    </span>
  );
}
