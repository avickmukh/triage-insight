'use client';

/**
 * AiInsightPanel
 *
 * Displays the three Stage-2 AI narration fields for a Theme:
 *   - AI Summary
 *   - Why It Matters (aiExplanation)
 *   - Suggested Action (aiRecommendation)
 *
 * Also renders an AiConfidenceBadge if aiConfidence is provided.
 *
 * Usage:
 *   <AiInsightPanel
 *     aiSummary={theme.aiSummary}
 *     aiExplanation={theme.aiExplanation}
 *     aiRecommendation={theme.aiRecommendation}
 *     aiConfidence={theme.aiConfidence}
 *   />
 */

import React from 'react';
import { Sparkles, Lightbulb, Zap } from 'lucide-react';
import { AiConfidenceBadge } from './AiConfidenceBadge';

interface AiInsightPanelProps {
  aiSummary?: string | null;
  aiExplanation?: string | null;
  aiRecommendation?: string | null;
  aiConfidence?: number | null;
  /** If true, renders a compact single-column layout suitable for list cards */
  compact?: boolean;
}

export function AiInsightPanel({
  aiSummary,
  aiExplanation,
  aiRecommendation,
  aiConfidence,
  compact = false,
}: AiInsightPanelProps) {
  const hasAnyContent = aiSummary || aiExplanation || aiRecommendation;

  if (!hasAnyContent) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400">
        <Sparkles className="h-4 w-4 shrink-0" />
        <span>AI insights will appear here once this theme has been scored.</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-1.5">
        {aiSummary && (
          <p className="text-sm text-slate-600 line-clamp-2">{aiSummary}</p>
        )}
        <div className="flex items-center gap-2">
          <AiConfidenceBadge confidence={aiConfidence} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-indigo-50 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-semibold text-violet-700">AI Intelligence</span>
        </div>
        <AiConfidenceBadge confidence={aiConfidence} />
      </div>

      {/* Summary */}
      {aiSummary && (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-violet-400">Summary</p>
          <p className="text-sm text-slate-700 leading-relaxed">{aiSummary}</p>
        </div>
      )}

      {/* Why it matters */}
      {aiExplanation && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
            <p className="text-xs font-medium uppercase tracking-wide text-amber-500">Why it matters</p>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">{aiExplanation}</p>
        </div>
      )}

      {/* Suggested action */}
      {aiRecommendation && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-emerald-500" />
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Suggested action</p>
          </div>
          <p className="text-sm font-medium text-slate-800 leading-relaxed">{aiRecommendation}</p>
        </div>
      )}
    </div>
  );
}
