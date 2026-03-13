'use client';

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  usePublicFeedbackDetail,
  usePublicVote,
  usePublicAddComment,
} from "@/hooks/use-public-portal";
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublicFeedbackDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? "";
  const feedbackId = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";

  const { data: feedback, isLoading, isError } = usePublicFeedbackDetail(orgSlug, feedbackId);
  const voteMutation = usePublicVote(orgSlug, feedbackId);
  const commentMutation = usePublicAddComment(orgSlug, feedbackId);

  // Vote state
  const [voted, setVoted] = useState(false);
  const [voteCount, setVoteCount] = useState(0);

  // Comment form state
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [commentName, setCommentName] = useState("");
  const [commentEmail, setCommentEmail] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);

  useEffect(() => {
    if (feedback) setVoteCount(feedback.voteCount);
  }, [feedback]);

  useEffect(() => {
    if (feedbackId && localStorage.getItem(`voted_${feedbackId}`) === "1") {
      setVoted(true);
    }
  }, [feedbackId]);

  const handleVote = () => {
    if (voted || voteMutation.isPending) return;
    voteMutation.mutate(
      { anonymousId: getAnonymousId() },
      {
        onSuccess: (result) => {
          setVoted(true);
          setVoteCount(result.voteCount);
          localStorage.setItem(`voted_${feedbackId}`, "1");
        },
      }
    );
  };

  const handleComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setCommentError(null);
    commentMutation.mutate(
      {
        body: commentBody.trim(),
        name: commentName.trim() || undefined,
        email: commentEmail.trim() || undefined,
        anonymousId: getAnonymousId(),
      },
      {
        onSuccess: () => {
          setCommentBody("");
          setCommentName("");
          setCommentEmail("");
          setShowCommentForm(false);
        },
        onError: () => {
          setCommentError("Failed to post comment. Please try again.");
        },
      }
    );
  };

  // ─── Loading ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ textAlign: "center", padding: "4rem 0", color: "#6C757D" }}>
        Loading…
      </div>
    );
  }

  if (isError || !feedback) {
    return (
      <div style={{ textAlign: "center", padding: "4rem 0" }}>
        <p style={{ color: "#E85D4A", marginBottom: "1rem" }}>Feedback item not found.</p>
        <button
          onClick={() => router.push(`/${orgSlug}/feedback`)}
          style={{ background: "#0A2540", color: "#fff", fontWeight: 600, fontSize: "0.875rem", padding: "0.6rem 1.25rem", borderRadius: 8, border: "none", cursor: "pointer" }}
        >
          ← Back to Feedback Board
        </button>
      </div>
    );
  }

  const badge = STATUS_COLORS[feedback.status] ?? { bg: "#e9ecef", color: "#495057" };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Back link */}
      <Link
        href={`/${orgSlug}/feedback`}
        style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", color: "#20A4A4", fontWeight: 600, fontSize: "0.875rem", textDecoration: "none", marginBottom: "1.5rem" }}
      >
        ← Back to Feedback Board
      </Link>

      {/* Main card */}
      <div style={{ background: "#ffffff", border: "1px solid #e9ecef", borderRadius: 12, padding: "2rem", boxShadow: "0 4px 16px rgba(10,37,64,0.08)", marginBottom: "1.5rem" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "1.25rem" }}>
          {/* Vote column */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem", minWidth: 52 }}>
            <button
              onClick={handleVote}
              disabled={voted || voteMutation.isPending}
              title={voted ? "Already voted" : "Upvote this"}
              style={{
                background: voted ? "#20A4A4" : "none",
                border: "1.5px solid #20A4A4",
                borderRadius: 8,
                padding: "0.4rem 0.6rem",
                cursor: voted ? "default" : "pointer",
                color: voted ? "#ffffff" : "#20A4A4",
                fontSize: "1rem",
                fontWeight: 700,
                lineHeight: 1,
                transition: "background 0.15s",
              }}
            >
              ▲
            </button>
            <span style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540" }}>{voteCount}</span>
            <span style={{ fontSize: "0.7rem", color: "#6C757D" }}>votes</span>
          </div>

          {/* Content */}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
              <h1 style={{ fontSize: "1.35rem", fontWeight: 700, color: "#0A2540", margin: 0, letterSpacing: "-0.02em" }}>{feedback.title}</h1>
              <span style={{ background: badge.bg, color: badge.color, fontSize: "0.72rem", fontWeight: 600, padding: "0.25rem 0.65rem", borderRadius: 20 }}>
                {statusLabel(feedback.status)}
              </span>
            </div>
            <p style={{ color: "#495057", fontSize: "0.95rem", lineHeight: 1.65, margin: 0 }}>{feedback.description}</p>
            <p style={{ color: "#adb5bd", fontSize: "0.78rem", marginTop: "0.75rem" }}>
              Submitted {new Date(feedback.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
        </div>
      </div>

      {/* Comments */}
      <div style={{ background: "#ffffff", border: "1px solid #e9ecef", borderRadius: 12, padding: "1.75rem 2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.05)" }}>
        <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0A2540", marginBottom: "1.25rem" }}>
          Comments ({feedback.comments.length})
        </h2>

        {feedback.comments.length === 0 && (
          <p style={{ color: "#6C757D", fontSize: "0.875rem", marginBottom: "1.25rem" }}>No comments yet. Be the first to share your thoughts.</p>
        )}

        {feedback.comments.map((c) => (
          <div key={c.id} style={{ display: "flex", gap: "0.875rem", marginBottom: "1.25rem" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#e8f7f7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "0.85rem", fontWeight: 700, color: "#20A4A4" }}>
              {c.authorName ? c.authorName[0].toUpperCase() : "?"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "#0A2540" }}>{c.authorName ?? "Anonymous"}</span>
                <span style={{ fontSize: "0.75rem", color: "#adb5bd" }}>{new Date(c.createdAt).toLocaleDateString()}</span>
              </div>
              <p style={{ fontSize: "0.875rem", color: "#495057", margin: 0, lineHeight: 1.6 }}>{c.body}</p>
            </div>
          </div>
        ))}

        {/* Comment form toggle */}
        {!showCommentForm ? (
          <button
            onClick={() => setShowCommentForm(true)}
            style={{ background: "none", border: "1.5px solid #20A4A4", color: "#20A4A4", fontWeight: 600, fontSize: "0.875rem", padding: "0.5rem 1.1rem", borderRadius: 8, cursor: "pointer", marginTop: feedback.comments.length > 0 ? "0.5rem" : 0 }}
          >
            + Add a comment
          </button>
        ) : (
          <form onSubmit={handleComment} style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            {commentError && (
              <div style={{ background: "#FFF3F3", border: "1px solid #E85D4A", borderRadius: 8, padding: "0.6rem 0.875rem", color: "#E85D4A", fontSize: "0.8rem" }}>{commentError}</div>
            )}
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <input
                type="text"
                value={commentName}
                onChange={(e) => setCommentName(e.target.value)}
                placeholder="Your name (optional)"
                style={{ flex: 1, minWidth: 160, padding: "0.55rem 0.75rem", border: "1.5px solid #e9ecef", borderRadius: 8, fontSize: "0.875rem", color: "#0A2540", outline: "none" }}
                onFocus={(e) => (e.target.style.borderColor = "#20A4A4")}
                onBlur={(e) => (e.target.style.borderColor = "#e9ecef")}
              />
              <input
                type="email"
                value={commentEmail}
                onChange={(e) => setCommentEmail(e.target.value)}
                placeholder="Email (optional)"
                style={{ flex: 1, minWidth: 160, padding: "0.55rem 0.75rem", border: "1.5px solid #e9ecef", borderRadius: 8, fontSize: "0.875rem", color: "#0A2540", outline: "none" }}
                onFocus={(e) => (e.target.style.borderColor = "#20A4A4")}
                onBlur={(e) => (e.target.style.borderColor = "#e9ecef")}
              />
            </div>
            <textarea
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder="Write your comment…"
              required
              rows={3}
              style={{ width: "100%", padding: "0.65rem 0.875rem", border: "1.5px solid #e9ecef", borderRadius: 8, fontSize: "0.875rem", color: "#0A2540", outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
              onFocus={(e) => (e.target.style.borderColor = "#20A4A4")}
              onBlur={(e) => (e.target.style.borderColor = "#e9ecef")}
            />
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                type="submit"
                disabled={commentMutation.isPending || !commentBody.trim()}
                style={{ background: commentMutation.isPending || !commentBody.trim() ? "#e9ecef" : "#FFC857", color: commentMutation.isPending || !commentBody.trim() ? "#6C757D" : "#0A2540", fontWeight: 700, fontSize: "0.875rem", padding: "0.55rem 1.1rem", borderRadius: 8, border: "none", cursor: commentMutation.isPending || !commentBody.trim() ? "not-allowed" : "pointer" }}
              >
                {commentMutation.isPending ? "Posting…" : "Post Comment"}
              </button>
              <button
                type="button"
                onClick={() => { setShowCommentForm(false); setCommentBody(""); setCommentError(null); }}
                style={{ background: "none", border: "1.5px solid #e9ecef", color: "#6C757D", fontWeight: 600, fontSize: "0.875rem", padding: "0.55rem 1.1rem", borderRadius: 8, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
