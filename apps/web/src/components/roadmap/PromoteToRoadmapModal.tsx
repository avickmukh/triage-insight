"use client";

import { useState, useEffect } from "react";
import apiClient from "@/lib/api-client";
import { PromoteThemePreview, RoadmapStatus } from "@/lib/api-types";
import { AiConfidenceBadge } from "@/components/ai/AiConfidenceBadge";

interface PromoteToRoadmapModalProps {
  workspaceId: string;
  themeId: string;
  themeTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (roadmapItemId: string) => void;
}

const STATUS_OPTIONS: { value: RoadmapStatus; label: string }[] = [
  { value: RoadmapStatus.EXPLORING, label: "Exploring" },
  { value: RoadmapStatus.BACKLOG, label: "Backlog" },
  { value: RoadmapStatus.PLANNED, label: "Planned" },
  { value: RoadmapStatus.COMMITTED, label: "Committed" },
];

export function PromoteToRoadmapModal({
  workspaceId,
  themeId,
  themeTitle,
  isOpen,
  onClose,
  onSuccess,
}: PromoteToRoadmapModalProps) {
  const [preview, setPreview] = useState<PromoteThemePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<RoadmapStatus>(RoadmapStatus.EXPLORING);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    apiClient.roadmap
      .previewFromTheme(workspaceId, themeId)
      .then((data) => {
        setPreview(data);
        setTitle(data.suggestedTitle ?? themeTitle);
        setDescription(data.suggestedDescription ?? "");
        setStatus(RoadmapStatus.EXPLORING);
      })
      .catch((err) => {
        setError(err?.response?.data?.message ?? "Failed to load preview.");
      })
      .finally(() => setLoading(false));
  }, [isOpen, workspaceId, themeId, themeTitle]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const item = await apiClient.roadmap.createFromTheme(workspaceId, themeId, {
        title,
        description,
        status,
      });
      onSuccess(item.id);
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e?.response?.data?.message ?? "Failed to create roadmap item.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Promote to Roadmap</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              AI has pre-filled this item from the theme&apos;s intelligence. Edit before confirming.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <svg className="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading AI suggestion…
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {preview?.alreadyPromoted && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              A roadmap item already exists for this theme. Creating another will be blocked by the API.
            </div>
          )}

          {!loading && preview && (
            <>
              {/* AI Context Panel */}
              {(preview.aiSummary || preview.aiExplanation) && (
                <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">AI Intelligence</span>
                    {preview.aiConfidence != null && (
                      <AiConfidenceBadge confidence={preview.aiConfidence} />
                    )}
                  </div>
                  {preview.aiSummary && (
                    <p className="text-sm text-indigo-900">{preview.aiSummary}</p>
                  )}
                  {preview.aiExplanation && (
                    <p className="text-xs text-indigo-700">
                      <span className="font-medium">Why it matters: </span>
                      {preview.aiExplanation}
                    </p>
                  )}
                  {preview.aiRecommendation && (
                    <p className="text-xs text-indigo-700">
                      <span className="font-medium">Suggested action: </span>
                      {preview.aiRecommendation}
                    </p>
                  )}
                  <p className="text-xs text-indigo-500">
                    Based on {preview.feedbackCount} linked feedback item{preview.feedbackCount !== 1 ? "s" : ""}
                  </p>
                </div>
              )}

              {/* Editable Fields */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Roadmap item title"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={5}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    placeholder="Describe what this roadmap item entails…"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Initial Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as RoadmapStatus)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Top Feedback Preview */}
              {preview.topFeedback.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Linked Feedback
                  </p>
                  <ul className="space-y-1">
                    {preview.topFeedback.map((fb) => (
                      <li key={fb.id} className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                        <span className="truncate">{fb.title}</span>
                        {fb.sentiment != null && (
                          <span
                            className={`ml-auto text-xs font-medium px-1.5 py-0.5 rounded-full ${
                              fb.sentiment > 0.2
                                ? "bg-green-100 text-green-700"
                                : fb.sentiment < -0.2
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {fb.sentiment > 0.2 ? "Positive" : fb.sentiment < -0.2 ? "Negative" : "Neutral"}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || loading || !title.trim() || !!preview?.alreadyPromoted}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Creating…" : "Add to Roadmap"}
          </button>
        </div>
      </div>
    </div>
  );
}
