'use client';

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { usePublicFeedbackList, usePublicVote } from "@/hooks/use-public-portal";
import { FeedbackStatus } from "@/lib/api-types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  [FeedbackStatus.NEW]:       { bg: "#e9ecef", color: "#495057" },
  [FeedbackStatus.IN_REVIEW]: { bg: "#FFF3CD", color: "#856404" },
  [FeedbackStatus.PROCESSED]: { bg: "#D4EDDA", color: "#155724" },
};

function statusLabel(status: string): string {
  switch (status) {
    case FeedbackStatus.NEW:       return "New";
    case FeedbackStatus.IN_REVIEW: return "Under Review";
    case FeedbackStatus.PROCESSED: return "Shipped";
    default:                       return status;
  }
}

function getAnonymousId(): string {
  if (typeof window === "undefined") return "";
  const key = "triage_anon_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

// ─── Vote Button ──────────────────────────────────────────────────────────────

function VoteButton({
  feedbackId,
  voteCount,
  workspaceSlug,
}: {
  feedbackId: string;
  voteCount: number;
  workspaceSlug: string;
}) {
  const [voted, setVoted] = useState(false);
  const [localCount, setLocalCount] = useState(voteCount);
  const voteMutation = usePublicVote(workspaceSlug, feedbackId);

  useEffect(() => {
    if (localStorage.getItem(`voted_${feedbackId}`) === "1") setVoted(true);
  }, [feedbackId]);

  const handleVote = () => {
    if (voted || voteMutation.isPending) return;
    voteMutation.mutate(
      { anonymousId: getAnonymousId() },
      {
        onSuccess: (result) => {
          setVoted(true);
          setLocalCount(result.voteCount);
          localStorage.setItem(`voted_${feedbackId}`, "1");
        },
      }
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 48, gap: "0.25rem" }}>
      <button
        onClick={handleVote}
        disabled={voted || voteMutation.isPending}
        title={voted ? "Already voted" : "Upvote"}
        style={{
          background: voted ? "#20A4A4" : "none",
          border: "1.5px solid #20A4A4",
          borderRadius: 6,
          padding: "0.25rem 0.5rem",
          cursor: voted ? "default" : "pointer",
          color: voted ? "#ffffff" : "#20A4A4",
          fontSize: "0.75rem",
          fontWeight: 700,
          lineHeight: 1,
          transition: "background 0.15s",
        }}
      >
        ▲
      </button>
      <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#0A2540" }}>{localCount}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublicFeedbackListPage() {
  const params = useParams();
  const orgSlug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? "";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isError } = usePublicFeedbackList(orgSlug, page, debouncedSearch);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#0A2540", letterSpacing: "-0.02em", marginBottom: "0.4rem" }}>Feedback Board</h1>
          <p style={{ color: "#6C757D", fontSize: "0.95rem" }}>Share your ideas, vote on requests, and track what&apos;s being built.</p>
        </div>
        <Link href={`/${orgSlug}/feedback/new`} style={{ display: "inline-block", background: "#FFC857", color: "#0A2540", fontWeight: 700, fontSize: "0.875rem", padding: "0.625rem 1.25rem", borderRadius: 8, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
          + Submit Feedback
        </Link>
      </div>

      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search feedback…"
        style={{ width: "100%", padding: "0.65rem 0.875rem", border: "1.5px solid #e9ecef", borderRadius: 8, fontSize: "0.9rem", color: "#0A2540", outline: "none", marginBottom: "1.5rem", boxSizing: "border-box" }}
        onFocus={(e) => (e.target.style.borderColor = "#20A4A4")}
        onBlur={(e) => (e.target.style.borderColor = "#e9ecef")}
      />

      {/* Loading */}
      {isLoading && (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "#6C757D" }}>Loading feedback…</div>
      )}

      {/* Error */}
      {isError && (
        <div style={{ background: "#FFF3F3", border: "1px solid #E85D4A", borderRadius: 8, padding: "0.75rem 1rem", color: "#E85D4A", fontSize: "0.875rem" }}>
          Failed to load feedback. Please refresh the page.
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && data && data.data.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "#6C757D" }}>
          {debouncedSearch ? `No feedback matching "${debouncedSearch}".` : "No feedback yet. Be the first to submit!"}
        </div>
      )}

      {/* List */}
      {!isLoading && !isError && data && data.data.length > 0 && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {data.data.map((item) => {
              const badge = STATUS_COLORS[item.status] ?? { bg: "#e9ecef", color: "#495057" };
              return (
                <div key={item.id} style={{ background: "#ffffff", border: "1px solid #e9ecef", borderRadius: 10, padding: "1.25rem 1.5rem", display: "flex", alignItems: "flex-start", gap: "1.25rem", boxShadow: "0 2px 8px rgba(10,37,64,0.06)" }}>
                  <VoteButton feedbackId={item.id} voteCount={item.voteCount} workspaceSlug={orgSlug} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
                      <Link href={`/${orgSlug}/feedback/${item.id}`} style={{ fontSize: "1rem", fontWeight: 600, color: "#0A2540", textDecoration: "none" }}>
                        {item.title}
                      </Link>
                      <span style={{ background: badge.bg, color: badge.color, fontSize: "0.7rem", fontWeight: 600, padding: "0.2rem 0.55rem", borderRadius: 20 }}>
                        {statusLabel(item.status)}
                      </span>
                    </div>
                    <p style={{ color: "#6C757D", fontSize: "0.875rem", margin: 0 }}>{item.description}</p>
                    {item.commentCount > 0 && (
                      <p style={{ color: "#20A4A4", fontSize: "0.78rem", marginTop: "0.4rem" }}>
                        {item.commentCount} comment{item.commentCount !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {data.meta.totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", marginTop: "2rem" }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ background: "none", border: "1.5px solid #e9ecef", borderRadius: 6, padding: "0.4rem 0.875rem", cursor: page === 1 ? "default" : "pointer", color: page === 1 ? "#adb5bd" : "#0A2540", fontSize: "0.875rem" }}
              >
                ← Prev
              </button>
              <span style={{ fontSize: "0.875rem", color: "#6C757D" }}>
                Page {data.meta.page} of {data.meta.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
                disabled={page === data.meta.totalPages}
                style={{ background: "none", border: "1.5px solid #e9ecef", borderRadius: 6, padding: "0.4rem 0.875rem", cursor: page === data.meta.totalPages ? "default" : "pointer", color: page === data.meta.totalPages ? "#adb5bd" : "#0A2540", fontSize: "0.875rem" }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
