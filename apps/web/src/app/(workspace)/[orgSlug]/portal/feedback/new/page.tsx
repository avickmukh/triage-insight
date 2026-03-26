'use client';

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import apiClient from "@/lib/api-client";

const TEAL = "#20A4A4";
const NAVY = "#0A2540";
const GRAY = "#6C757D";

/** Retrieve or create a stable anonymous ID stored in localStorage. */
function getOrCreateAnonymousId(): string {
  if (typeof window === "undefined") return "";
  const key = "triage_anon_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

const CATEGORIES = [
  { value: "feature_request", label: "Feature request" },
  { value: "bug_report",      label: "Bug report" },
  { value: "improvement",     label: "Improvement" },
  { value: "question",        label: "Question" },
  { value: "other",           label: "Other" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"] | "";

export default function PublicFeedbackNewPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';

  const [title, setTitle]               = useState("");
  const [description, setDescription]   = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [category, setCategory]         = useState<Category>("");
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [success, setSuccess]           = useState(false);

  const titleMax = 160;
  const descMax  = 2000;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const anonymousId = getOrCreateAnonymousId();
      await apiClient.portal.createFeedback(orgSlug, {
        title: title.trim(),
        description: [
          category ? `[${CATEGORIES.find((c) => c.value === category)?.label ?? category}]` : "",
          description.trim(),
        ].filter(Boolean).join(" "),
        email: submitterEmail.trim() || undefined,
        anonymousId: anonymousId || undefined,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Submission failed. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Success screen ── */
  if (success) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center", padding: "3rem 1.5rem" }}>
        {/* Checkmark circle */}
        <div style={{
          width: 72, height: 72,
          background: "linear-gradient(135deg, #20A4A4 0%, #1a8f8f 100%)",
          borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 1.5rem",
          boxShadow: "0 4px 16px rgba(32,164,164,0.3)",
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: NAVY, marginBottom: "0.75rem" }}>
          Thank you for your feedback!
        </h2>
        <p style={{ color: GRAY, marginBottom: "1.25rem", lineHeight: 1.6, fontSize: "0.9rem" }}>
          Your submission has been received. Our team reads every piece of feedback and uses it to
          shape the product roadmap.
        </p>

        {/* What happens next */}
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "1.75rem", textAlign: "left" }}>
          <p style={{ fontSize: "0.75rem", fontWeight: 700, color: TEAL, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.625rem" }}>What happens next</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {[
              "Your feedback is added to our inbox and reviewed by the team.",
              "If it matches an existing theme, it will be grouped automatically.",
              "High-impact requests are promoted to the roadmap.",
              submitterEmail ? "We may follow up at " + submitterEmail + " if we have questions." : "Add your email next time to receive updates on your request.",
            ].map((step, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                <span style={{ color: TEAL, fontWeight: 700, fontSize: "0.8rem", flexShrink: 0, marginTop: "0.05rem" }}>→</span>
                <p style={{ fontSize: "0.82rem", color: "#374151", margin: 0, lineHeight: 1.5 }}>{step}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.875rem", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => { setSuccess(false); setTitle(""); setDescription(""); setSubmitterEmail(""); setCategory(""); }}
            style={{ background: "none", border: `1.5px solid ${TEAL}`, color: TEAL, fontWeight: 600, fontSize: "0.875rem", padding: "0.6rem 1.25rem", borderRadius: 8, cursor: "pointer" }}
          >
            Submit another
          </button>
          <button
            onClick={() => router.push(`/${orgSlug}/feedback`)}
            style={{ background: NAVY, color: "#fff", fontWeight: 600, fontSize: "0.875rem", padding: "0.6rem 1.25rem", borderRadius: 8, cursor: "pointer", border: "none" }}
          >
            View all feedback
          </button>
        </div>
      </div>
    );
  }

  /* ── Submission form ── */
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <button
        onClick={() => router.back()}
        style={{ background: "none", border: "none", color: TEAL, fontWeight: 600, fontSize: "0.875rem", cursor: "pointer", marginBottom: "1.5rem", padding: 0, display: "flex", alignItems: "center", gap: "0.35rem" }}
      >
        ← Back to Feedback Board
      </button>

      <div style={{ background: "#fff", border: "1px solid #e9ecef", borderRadius: 12, padding: "2rem", boxShadow: "0 4px 16px rgba(10,37,64,0.08)" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: NAVY, marginBottom: "0.4rem", letterSpacing: "-0.02em" }}>
          Submit Feedback
        </h1>
        <p style={{ color: GRAY, fontSize: "0.9rem", marginBottom: "1.5rem", lineHeight: 1.6 }}>
          Share your idea, report a problem, or request a feature. We read everything and use it to
          decide what to build next.
        </p>

        {/* Trust badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "0.5rem 0.875rem", marginBottom: "1.5rem" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" fill="#22c55e" />
            <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p style={{ fontSize: "0.78rem", color: "#15803d", margin: 0, fontWeight: 500 }}>
            Your feedback is private. We never share it publicly without your permission.
          </p>
        </div>

        {error && (
          <div style={{ background: "#FFF3F3", border: "1px solid #E85D4A", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.25rem", color: "#E85D4A", fontSize: "0.875rem" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Category */}
          <div>
            <label style={{ display: "block", fontWeight: 600, fontSize: "0.875rem", color: NAVY, marginBottom: "0.4rem" }}>
              Type <span style={{ color: GRAY, fontWeight: 400 }}>(optional)</span>
            </label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(category === cat.value ? "" : cat.value)}
                  style={{
                    padding: "0.35rem 0.875rem", borderRadius: 20, fontSize: "0.8rem", fontWeight: 600,
                    border: `1.5px solid ${category === cat.value ? TEAL : "#e9ecef"}`,
                    background: category === cat.value ? "#e8f7f7" : "#fff",
                    color: category === cat.value ? TEAL : GRAY,
                    cursor: "pointer", transition: "all 0.1s",
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
              <label style={{ fontWeight: 600, fontSize: "0.875rem", color: NAVY }}>
                Title <span style={{ color: "#E85D4A" }}>*</span>
              </label>
              <span style={{ fontSize: "0.72rem", color: title.length > titleMax * 0.85 ? "#e63946" : GRAY }}>
                {title.length}/{titleMax}
              </span>
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, titleMax))}
              placeholder="A short, clear summary of your feedback"
              required
              style={{ width: "100%", padding: "0.65rem 0.875rem", border: "1.5px solid #e9ecef", borderRadius: 8, fontSize: "0.9rem", color: NAVY, outline: "none", boxSizing: "border-box" }}
              onFocus={(e) => (e.target.style.borderColor = TEAL)}
              onBlur={(e) => (e.target.style.borderColor = "#e9ecef")}
            />
          </div>

          {/* Description */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
              <label style={{ fontWeight: 600, fontSize: "0.875rem", color: NAVY }}>Description</label>
              <span style={{ fontSize: "0.72rem", color: description.length > descMax * 0.9 ? "#e63946" : GRAY }}>
                {description.length}/{descMax}
              </span>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, descMax))}
              placeholder="Provide more context, use cases, or examples (optional)"
              rows={4}
              style={{ width: "100%", padding: "0.65rem 0.875rem", border: "1.5px solid #e9ecef", borderRadius: 8, fontSize: "0.9rem", color: NAVY, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
              onFocus={(e) => (e.target.style.borderColor = TEAL)}
              onBlur={(e) => (e.target.style.borderColor = "#e9ecef")}
            />
          </div>

          {/* Email */}
          <div>
            <label style={{ display: "block", fontWeight: 600, fontSize: "0.875rem", color: NAVY, marginBottom: "0.4rem" }}>
              Your email <span style={{ color: GRAY, fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              type="email"
              value={submitterEmail}
              onChange={(e) => setSubmitterEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ width: "100%", padding: "0.65rem 0.875rem", border: "1.5px solid #e9ecef", borderRadius: 8, fontSize: "0.9rem", color: NAVY, outline: "none", boxSizing: "border-box" }}
              onFocus={(e) => (e.target.style.borderColor = TEAL)}
              onBlur={(e) => (e.target.style.borderColor = "#e9ecef")}
            />
            <p style={{ fontSize: "0.78rem", color: GRAY, marginTop: "0.3rem" }}>
              We&apos;ll only use this to follow up if we have questions about your submission. Never shared.
            </p>
          </div>

          {/* Submit row */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              style={{
                background: submitting || !title.trim() ? "#e9ecef" : "#FFC857",
                color: submitting || !title.trim() ? GRAY : NAVY,
                fontWeight: 700, fontSize: "0.9rem", padding: "0.75rem 1.75rem",
                borderRadius: 8, border: "none",
                cursor: submitting || !title.trim() ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Submitting…" : "Submit Feedback"}
            </button>
            <p style={{ fontSize: "0.75rem", color: GRAY, margin: 0 }}>
              By submitting you agree to our{" "}
              <Link href={`/${orgSlug}/feedback`} style={{ color: TEAL, textDecoration: "none" }}>
                community guidelines
              </Link>
              .
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
