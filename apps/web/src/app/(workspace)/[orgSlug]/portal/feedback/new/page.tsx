'use client';

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import apiClient from "@/lib/api-client";

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

export default function PublicFeedbackNewPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const anonymousId = getOrCreateAnonymousId();
      await apiClient.portal.createFeedback(orgSlug, {
        title: title.trim(),
        description: description.trim() || undefined,
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

  if (success) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center", padding: "3rem 1.5rem" }}>
        <div style={{ width: 64, height: 64, background: "linear-gradient(135deg, #20A4A4 0%, #1a8f8f 100%)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.75rem" }}>Thank you for your feedback!</h2>
        <p style={{ color: "#6C757D", marginBottom: "2rem" }}>Your submission has been received. Our team reviews all feedback and uses it to shape the product roadmap.</p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <button onClick={() => { setSuccess(false); setTitle(""); setDescription(""); setSubmitterEmail(""); }} style={{ background: "none", border: "1.5px solid #20A4A4", color: "#20A4A4", fontWeight: 600, fontSize: "0.875rem", padding: "0.6rem 1.25rem", borderRadius: 8, cursor: "pointer" }}>Submit another</button>
          <button onClick={() => router.push(`/${orgSlug}/feedback`)} style={{ background: "#0A2540", color: "#ffffff", fontWeight: 600, fontSize: "0.875rem", padding: "0.6rem 1.25rem", borderRadius: 8, cursor: "pointer", border: "none" }}>View all feedback</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "#20A4A4", fontWeight: 600, fontSize: "0.875rem", cursor: "pointer", marginBottom: "1.5rem", padding: 0, display: "flex", alignItems: "center", gap: "0.35rem" }}>← Back to Feedback Board</button>
      <div style={{ background: "#ffffff", border: "1px solid #e9ecef", borderRadius: 12, padding: "2rem", boxShadow: "0 4px 16px rgba(10,37,64,0.08)" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.4rem", letterSpacing: "-0.02em" }}>Submit Feedback</h1>
        <p style={{ color: "#6C757D", fontSize: "0.9rem", marginBottom: "2rem" }}>Share your idea, report a problem, or request a feature. We read everything.</p>
        {error && (<div style={{ background: "#FFF3F3", border: "1px solid #E85D4A", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.25rem", color: "#E85D4A", fontSize: "0.875rem" }}>{error}</div>)}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div>
            <label style={{ display: "block", fontWeight: 600, fontSize: "0.875rem", color: "#0A2540", marginBottom: "0.4rem" }}>Title <span style={{ color: "#E85D4A" }}>*</span></label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A short, clear summary of your feedback" required style={{ width: "100%", padding: "0.65rem 0.875rem", border: "1.5px solid #e9ecef", borderRadius: 8, fontSize: "0.9rem", color: "#0A2540", outline: "none", boxSizing: "border-box" }} onFocus={(e) => (e.target.style.borderColor = "#20A4A4")} onBlur={(e) => (e.target.style.borderColor = "#e9ecef")} />
          </div>
          <div>
            <label style={{ display: "block", fontWeight: 600, fontSize: "0.875rem", color: "#0A2540", marginBottom: "0.4rem" }}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Provide more context, use cases, or examples (optional)" rows={4} style={{ width: "100%", padding: "0.65rem 0.875rem", border: "1.5px solid #e9ecef", borderRadius: 8, fontSize: "0.9rem", color: "#0A2540", outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} onFocus={(e) => (e.target.style.borderColor = "#20A4A4")} onBlur={(e) => (e.target.style.borderColor = "#e9ecef")} />
          </div>
          <div>
            <label style={{ display: "block", fontWeight: 600, fontSize: "0.875rem", color: "#0A2540", marginBottom: "0.4rem" }}>Your email <span style={{ color: "#6C757D", fontWeight: 400 }}>(optional)</span></label>
            <input type="email" value={submitterEmail} onChange={(e) => setSubmitterEmail(e.target.value)} placeholder="you@example.com" style={{ width: "100%", padding: "0.65rem 0.875rem", border: "1.5px solid #e9ecef", borderRadius: 8, fontSize: "0.9rem", color: "#0A2540", outline: "none", boxSizing: "border-box" }} onFocus={(e) => (e.target.style.borderColor = "#20A4A4")} onBlur={(e) => (e.target.style.borderColor = "#e9ecef")} />
            <p style={{ fontSize: "0.78rem", color: "#6C757D", marginTop: "0.3rem" }}>We&apos;ll only use this to follow up on your submission if needed.</p>
          </div>
          <button type="submit" disabled={submitting || !title.trim()} style={{ background: submitting || !title.trim() ? "#e9ecef" : "#FFC857", color: submitting || !title.trim() ? "#6C757D" : "#0A2540", fontWeight: 700, fontSize: "0.9rem", padding: "0.75rem 1.5rem", borderRadius: 8, border: "none", cursor: submitting || !title.trim() ? "not-allowed" : "pointer", alignSelf: "flex-start" }}>
            {submitting ? "Submitting…" : "Submit Feedback"}
          </button>
        </form>
      </div>
    </div>
  );
}
