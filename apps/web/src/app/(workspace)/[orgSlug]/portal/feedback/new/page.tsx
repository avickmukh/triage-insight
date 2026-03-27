'use client';

import { useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import apiClient from "@/lib/api-client";

const TEAL = "#20A4A4";
const NAVY = "#0A2540";
const GRAY = "#6C757D";

const ALLOWED_AUDIO_MIME = new Set([
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave",
  "audio/m4a", "audio/x-m4a", "audio/mp4", "audio/ogg", "audio/webm", "audio/flac",
]);
const ALLOWED_AUDIO_EXT = [".mp3", ".wav", ".m4a", ".mp4", ".ogg", ".webm", ".flac"];
const MAX_FILE_SIZE_MB = 50;

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CATEGORIES = [
  { value: "feature_request", label: "Feature request" },
  { value: "bug_report",      label: "Bug report" },
  { value: "improvement",     label: "Improvement" },
  { value: "question",        label: "Question" },
  { value: "other",           label: "Other" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"] | "";
type SubmitMode = "text" | "voice";

// ─── Voice Upload State Machine ───────────────────────────────────────────────
type VoiceState =
  | { status: "idle" }
  | { status: "selected"; file: File }
  | { status: "uploading"; file: File; progress: number }
  | { status: "processing"; uploadAssetId: string; aiJobLogId: string }
  | { status: "error"; message: string };

export default function PublicFeedbackNewPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';

  // ── Text form state ──────────────────────────────────────────────────────
  const [title, setTitle]               = useState("");
  const [description, setDescription]   = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [category, setCategory]         = useState<Category>("");
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [success, setSuccess]           = useState(false);
  const [successIsVoice, setSuccessIsVoice] = useState(false);

  // ── Submit mode ──────────────────────────────────────────────────────────
  const [submitMode, setSubmitMode]     = useState<SubmitMode>("text");

  // ── Voice state ──────────────────────────────────────────────────────────
  const [voiceState, setVoiceState]     = useState<VoiceState>({ status: "idle" });
  const [voiceDescription, setVoiceDescription] = useState("");
  const [isDragOver, setIsDragOver]     = useState(false);
  const fileInputRef                    = useRef<HTMLInputElement>(null);

  const titleMax = 160;
  const descMax  = 2000;

  // ── File validation ──────────────────────────────────────────────────────
  const validateAudioFile = (file: File): string | null => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    const mimeOk = ALLOWED_AUDIO_MIME.has(file.type) || file.type === "";
    const extOk  = ALLOWED_AUDIO_EXT.includes(ext);
    if (!mimeOk && !extOk) {
      return `Unsupported file type. Please upload: ${ALLOWED_AUDIO_EXT.join(", ")}`;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `File is too large (${formatFileSize(file.size)}). Maximum size is ${MAX_FILE_SIZE_MB} MB.`;
    }
    return null;
  };

  const handleFileSelect = useCallback((file: File) => {
    const err = validateAudioFile(file);
    if (err) {
      setVoiceState({ status: "error", message: err });
      return;
    }
    setVoiceState({ status: "selected", file });
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  // ── Text form submit ─────────────────────────────────────────────────────
  const handleTextSubmit = async (e: React.FormEvent) => {
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
      setSuccessIsVoice(false);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Voice form submit ────────────────────────────────────────────────────
  const handleVoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (voiceState.status !== "selected") return;

    const file = voiceState.file;
    setError(null);

    try {
      // Step 1: Get presigned URL
      setVoiceState({ status: "uploading", file, progress: 0 });
      const mimeType = file.type || "audio/mpeg";
      const { signedUrl, key, bucket } = await apiClient.portal.getVoicePresignedUrl(orgSlug, {
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
      });

      // Step 2: PUT file directly to S3
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", signedUrl);
        xhr.setRequestHeader("Content-Type", mimeType);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setVoiceState({ status: "uploading", file, progress: Math.round((ev.loaded / ev.total) * 100) });
          }
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`S3 upload failed: ${xhr.status}`)));
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
      });

      // Step 3: Finalize — enqueue transcription job
      setVoiceState({ status: "uploading", file, progress: 100 });
      const anonymousId = getOrCreateAnonymousId();
      const result = await apiClient.portal.finalizeVoiceUpload(orgSlug, {
        s3Key: key,
        s3Bucket: bucket,
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
        label: title.trim() || file.name,
        description: voiceDescription.trim() || undefined,
        email: submitterEmail.trim() || undefined,
        anonymousId: anonymousId || undefined,
      });

      setVoiceState({ status: "processing", uploadAssetId: result.uploadAssetId, aiJobLogId: result.aiJobLogId });
      setSuccessIsVoice(true);
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed. Please try again.";
      setVoiceState({ status: "error", message });
      setError(message);
    }
  };

  const resetVoice = () => {
    setVoiceState({ status: "idle" });
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ── Success screen ── */
  if (success) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center", padding: "3rem 1.5rem" }}>
        <div style={{
          width: 72, height: 72,
          background: "linear-gradient(135deg, #20A4A4 0%, #1a8f8f 100%)",
          borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 1.5rem",
          boxShadow: "0 4px 16px rgba(32,164,164,0.3)",
        }}>
          {successIsVoice ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="white" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <path d="M12 19v4M8 23h8" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>

        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: NAVY, marginBottom: "0.75rem" }}>
          {successIsVoice ? "Voice feedback received!" : "Thank you for your feedback!"}
        </h2>
        <p style={{ color: GRAY, marginBottom: "1.25rem", lineHeight: 1.6, fontSize: "0.9rem" }}>
          {successIsVoice
            ? "Your audio is being transcribed and analysed by our AI pipeline. This usually takes under a minute."
            : "Your submission has been received. Our team reads every piece of feedback and uses it to shape the product roadmap."}
        </p>

        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "1.75rem", textAlign: "left" }}>
          <p style={{ fontSize: "0.75rem", fontWeight: 700, color: TEAL, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.625rem" }}>What happens next</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {(successIsVoice ? [
              "Your audio is transcribed using AI (Whisper).",
              "Key themes, pain points, and feature requests are extracted automatically.",
              "The feedback is matched to existing themes and added to the inbox.",
              "High-impact voice feedback is promoted to the roadmap.",
            ] : [
              "Your feedback is added to our inbox and reviewed by the team.",
              "If it matches an existing theme, it will be grouped automatically.",
              "High-impact requests are promoted to the roadmap.",
              submitterEmail ? "We may follow up at " + submitterEmail + " if we have questions." : "Add your email next time to receive updates on your request.",
            ]).map((step, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                <span style={{ color: TEAL, fontWeight: 700, fontSize: "0.8rem", flexShrink: 0, marginTop: "0.05rem" }}>→</span>
                <p style={{ fontSize: "0.82rem", color: "#374151", margin: 0, lineHeight: 1.5 }}>{step}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.875rem", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => {
              setSuccess(false); setTitle(""); setDescription(""); setSubmitterEmail(""); setCategory("");
              setVoiceState({ status: "idle" }); setVoiceDescription(""); setSuccessIsVoice(false);
            }}
            style={{ background: "none", border: `1.5px solid ${TEAL}`, color: TEAL, fontWeight: 600, fontSize: "0.875rem", padding: "0.6rem 1.25rem", borderRadius: 8, cursor: "pointer" }}
          >
            Submit another
          </button>
          <button
            onClick={() => router.push(`/${orgSlug}/portal/feedback`)}
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
          Share your idea, report a problem, or request a feature. We read everything and use it to decide what to build next.
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

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.75rem", background: "#f8fafc", borderRadius: 10, padding: "0.3rem" }}>
          {([["text", "✏️ Write"], ["voice", "🎙️ Voice"]] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => { setSubmitMode(mode); setError(null); }}
              style={{
                flex: 1, padding: "0.55rem 0", borderRadius: 8, fontSize: "0.875rem", fontWeight: 600,
                border: "none", cursor: "pointer", transition: "all 0.15s",
                background: submitMode === mode ? "#fff" : "transparent",
                color: submitMode === mode ? NAVY : GRAY,
                boxShadow: submitMode === mode ? "0 1px 4px rgba(10,37,64,0.1)" : "none",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ background: "#FFF3F3", border: "1px solid #E85D4A", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.25rem", color: "#E85D4A", fontSize: "0.875rem" }}>
            {error}
          </div>
        )}

        {/* ── TEXT FORM ── */}
        {submitMode === "text" && (
          <form onSubmit={handleTextSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
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
                      cursor: "pointer",
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
                <label style={{ fontWeight: 600, fontSize: "0.875rem", color: NAVY }}>Title <span style={{ color: "#E85D4A" }}>*</span></label>
                <span style={{ fontSize: "0.72rem", color: title.length > titleMax * 0.85 ? "#e63946" : GRAY }}>{title.length}/{titleMax}</span>
              </div>
              <input
                type="text" value={title} onChange={(e) => setTitle(e.target.value.slice(0, titleMax))}
                placeholder="A short, clear summary of your feedback" required
                style={{ width: "100%", padding: "0.65rem 0.875rem", border: "1.5px solid #e9ecef", borderRadius: 8, fontSize: "0.9rem", color: NAVY, outline: "none", boxSizing: "border-box" }}
                onFocus={(e) => (e.target.style.borderColor = TEAL)}
                onBlur={(e) => (e.target.style.borderColor = "#e9ecef")}
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
                <label style={{ fontWeight: 600, fontSize: "0.875rem", color: NAVY }}>Description</label>
                <span style={{ fontSize: "0.72rem", color: description.length > descMax * 0.9 ? "#e63946" : GRAY }}>{description.length}/{descMax}</span>
              </div>
              <textarea
                value={description} onChange={(e) => setDescription(e.target.value.slice(0, descMax))}
                placeholder="Provide more context, use cases, or examples (optional)" rows={4}
                style={{ width: "100%", padding: "0.65rem 0.875rem", border: "1.5px solid #e9ecef", borderRadius: 8, fontSize: "0.9rem", color: NAVY, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
                onFocus={(e) => (e.target.style.borderColor = TEAL)}
                onBlur={(e) => (e.target.style.borderColor = "#e9ecef")}
              />
            </div>

            <div>
              <label style={{ display: "block", fontWeight: 600, fontSize: "0.875rem", color: NAVY, marginBottom: "0.4rem" }}>
                Your email <span style={{ color: GRAY, fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                type="email" value={submitterEmail} onChange={(e) => setSubmitterEmail(e.target.value)}
                placeholder="you@example.com"
                style={{ width: "100%", padding: "0.65rem 0.875rem", border: "1.5px solid #e9ecef", borderRadius: 8, fontSize: "0.9rem", color: NAVY, outline: "none", boxSizing: "border-box" }}
                onFocus={(e) => (e.target.style.borderColor = TEAL)}
                onBlur={(e) => (e.target.style.borderColor = "#e9ecef")}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <button
                type="submit" disabled={submitting || !title.trim()}
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
                <Link href={`/${orgSlug}/portal/feedback`} style={{ color: TEAL, textDecoration: "none" }}>community guidelines</Link>.
              </p>
            </div>
          </form>
        )}

        {/* ── VOICE FORM ── */}
        {submitMode === "voice" && (
          <form onSubmit={handleVoiceSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Voice info banner */}
            <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "0.75rem 1rem", display: "flex", gap: "0.625rem" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10" fill="#0ea5e9" />
                <path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <p style={{ fontSize: "0.8rem", color: "#0369a1", margin: 0, lineHeight: 1.5 }}>
                Record or upload an audio file. Our AI will transcribe it and extract key insights automatically.
                Supported formats: MP3, WAV, M4A, OGG, WebM, FLAC — max {MAX_FILE_SIZE_MB} MB.
              </p>
            </div>

            {/* Drop zone */}
            {(voiceState.status === "idle" || voiceState.status === "error") && (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragOver ? TEAL : "#d1d5db"}`,
                  borderRadius: 12, padding: "2.5rem 1.5rem", textAlign: "center",
                  cursor: "pointer", transition: "all 0.15s",
                  background: isDragOver ? "#f0fdf9" : "#fafafa",
                }}
              >
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ margin: "0 auto 0.75rem", display: "block" }}>
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill={TEAL} opacity="0.7" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke={TEAL} strokeWidth="2" strokeLinecap="round" />
                  <path d="M12 19v4M8 23h8" stroke={TEAL} strokeWidth="2" strokeLinecap="round" />
                </svg>
                <p style={{ fontWeight: 600, color: NAVY, fontSize: "0.9rem", margin: "0 0 0.25rem" }}>
                  Drop your audio file here, or click to browse
                </p>
                <p style={{ color: GRAY, fontSize: "0.78rem", margin: 0 }}>
                  MP3, WAV, M4A, OGG, WebM, FLAC — max {MAX_FILE_SIZE_MB} MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_AUDIO_EXT.join(",")}
                  style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                />
              </div>
            )}

            {/* File selected */}
            {voiceState.status === "selected" && (
              <div style={{ border: "1.5px solid #d1fae5", borderRadius: 10, padding: "1rem 1.25rem", background: "#f0fdf4", display: "flex", alignItems: "center", gap: "0.875rem" }}>
                <div style={{ width: 40, height: 40, background: "#dcfce7", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="#16a34a" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, color: NAVY, fontSize: "0.875rem", margin: "0 0 0.15rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {voiceState.file.name}
                  </p>
                  <p style={{ color: GRAY, fontSize: "0.78rem", margin: 0 }}>
                    {formatFileSize(voiceState.file.size)}
                  </p>
                </div>
                <button type="button" onClick={resetVoice}
                  style={{ background: "none", border: "none", color: GRAY, cursor: "pointer", padding: "0.25rem", fontSize: "1.1rem", lineHeight: 1 }}>
                  ✕
                </button>
              </div>
            )}

            {/* Upload progress */}
            {voiceState.status === "uploading" && (
              <div style={{ border: "1.5px solid #e0f2fe", borderRadius: 10, padding: "1rem 1.25rem", background: "#f0f9ff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.875rem", fontWeight: 600, color: NAVY }}>
                    {voiceState.progress < 100 ? "Uploading…" : "Finalizing…"}
                  </span>
                  <span style={{ fontSize: "0.875rem", color: GRAY }}>{voiceState.progress}%</span>
                </div>
                <div style={{ height: 6, background: "#e0f2fe", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: TEAL, borderRadius: 3, width: `${voiceState.progress}%`, transition: "width 0.2s" }} />
                </div>
                <p style={{ fontSize: "0.78rem", color: GRAY, margin: "0.5rem 0 0" }}>
                  {voiceState.file.name} — {formatFileSize(voiceState.file.size)}
                </p>
              </div>
            )}

            {/* Optional title */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
                <label style={{ fontWeight: 600, fontSize: "0.875rem", color: NAVY }}>
                  Title <span style={{ color: GRAY, fontWeight: 400 }}>(optional)</span>
                </label>
                <span style={{ fontSize: "0.72rem", color: GRAY }}>{title.length}/{titleMax}</span>
              </div>
              <input
                type="text" value={title} onChange={(e) => setTitle(e.target.value.slice(0, titleMax))}
                placeholder="Give your recording a short title (AI will generate one if blank)"
                style={{ width: "100%", padding: "0.65rem 0.875rem", border: "1.5px solid #e9ecef", borderRadius: 8, fontSize: "0.9rem", color: NAVY, outline: "none", boxSizing: "border-box" }}
                onFocus={(e) => (e.target.style.borderColor = TEAL)}
                onBlur={(e) => (e.target.style.borderColor = "#e9ecef")}
              />
            </div>

            {/* Optional text note */}
            <div>
              <label style={{ display: "block", fontWeight: 600, fontSize: "0.875rem", color: NAVY, marginBottom: "0.4rem" }}>
                Add a note <span style={{ color: GRAY, fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                value={voiceDescription} onChange={(e) => setVoiceDescription(e.target.value.slice(0, descMax))}
                placeholder="Any additional context you'd like to add alongside your recording"
                rows={3}
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
                type="email" value={submitterEmail} onChange={(e) => setSubmitterEmail(e.target.value)}
                placeholder="you@example.com"
                style={{ width: "100%", padding: "0.65rem 0.875rem", border: "1.5px solid #e9ecef", borderRadius: 8, fontSize: "0.9rem", color: NAVY, outline: "none", boxSizing: "border-box" }}
                onFocus={(e) => (e.target.style.borderColor = TEAL)}
                onBlur={(e) => (e.target.style.borderColor = "#e9ecef")}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <button
                type="submit"
                disabled={voiceState.status !== "selected" || submitting}
                style={{
                  background: voiceState.status !== "selected" || submitting ? "#e9ecef" : "#FFC857",
                  color: voiceState.status !== "selected" || submitting ? GRAY : NAVY,
                  fontWeight: 700, fontSize: "0.9rem", padding: "0.75rem 1.75rem",
                  borderRadius: 8, border: "none",
                  cursor: voiceState.status !== "selected" || submitting ? "not-allowed" : "pointer",
                }}
              >
                {voiceState.status === "uploading" ? "Uploading…" : "Submit Voice Feedback"}
              </button>
              <p style={{ fontSize: "0.75rem", color: GRAY, margin: 0 }}>
                Audio is processed securely and never shared.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
