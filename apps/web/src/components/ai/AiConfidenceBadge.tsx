'use client';

/**
 * AiConfidenceBadge
 *
 * Displays a colour-coded confidence indicator for AI-generated content.
 *
 * Thresholds:
 *   >= 0.75  → High   (green)
 *   >= 0.45  → Medium (amber)
 *   > 0      → Low    (slate)
 *   null     → "Not yet scored" (muted)
 */

import React from 'react';

interface AiConfidenceBadgeProps {
  confidence?: number | null;
  className?: string;
}

function getLevel(confidence: number | null | undefined): {
  label: string;
  className: string;
} {
  if (confidence == null) {
    return { label: 'Not scored', className: 'bg-slate-100 text-slate-400' };
  }
  if (confidence >= 0.75) {
    return { label: 'High confidence', className: 'bg-emerald-100 text-emerald-700' };
  }
  if (confidence >= 0.45) {
    return { label: 'Medium confidence', className: 'bg-amber-100 text-amber-700' };
  }
  return { label: 'Low confidence', className: 'bg-slate-100 text-slate-500' };
}

export function AiConfidenceBadge({ confidence, className = '' }: AiConfidenceBadgeProps) {
  const { label, className: levelClass } = getLevel(confidence);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${levelClass} ${className}`}
      title={confidence != null ? `AI confidence: ${Math.round(confidence * 100)}%` : 'Not yet scored'}
    >
      {label}
    </span>
  );
}
