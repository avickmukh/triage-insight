export const metadata = { title: "AI Deduplication — TriageInsight" };

export default function Page() {
  return (
    <main>
      <section style={{ background: "linear-gradient(135deg, #0A2540 0%, #0d2e4d 50%, #0a3060 100%)", padding: "8rem 0 5rem", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(32,164,164,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="container" style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <span className="section-label" style={{ color: "#20A4A4" }}>AI Deduplication</span>
          <h1 style={{ fontSize: "clamp(2.2rem,5vw,3.5rem)", fontWeight: 900, color: "#fff", lineHeight: 1.1, marginBottom: "1.25rem" }}>
            Stop reading the same request twice.<br />
            <span style={{ color: "#20A4A4" }}>Let AI do the triage.</span>
          </h1>
          <p style={{ fontSize: "1.15rem", color: "rgba(255,255,255,0.7)", maxWidth: 600, margin: "0 auto 2.5rem" }}>
            TriageInsight's AI reads every piece of feedback and merges semantically identical requests across all your channels automatically.
          </p>
          <a href="/signup" className="btn btn-yellow">Start free trial</a>
        </div>
      </section>

      <section style={{ background: "#F8F9FA", padding: "5rem 0 6rem" }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "2rem" }}>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Semantic matching</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>We use large language models to compare meaning, not just keywords. 'Add dark mode' and 'Support night theme' are the same request.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Cross-channel dedup</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Feedback from Slack, email, Intercom, and your public portal is deduplicated into a single canonical item.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Confidence scoring</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Every merge is assigned a confidence score. Low-confidence merges are flagged for human review.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Merge history</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>See every source that contributed to a deduplicated item. Full audit trail, always.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Auto-increment vote count</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Each duplicate automatically increments the vote count on the canonical item. Popularity is always accurate.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Manual override</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Disagree with a merge? Split items back out in one click. You are always in control.</p>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "#0A2540", padding: "5rem 0", textAlign: "center" }}>
        <div className="container">
          <h2 style={{ fontSize: "clamp(1.75rem,3vw,2.5rem)", fontWeight: 800, color: "#fff", marginBottom: "1rem" }}>Ready to bring clarity to your feedback?</h2>
          <p style={{ fontSize: "1.1rem", color: "rgba(255,255,255,0.65)", marginBottom: "2rem" }}>Join 200+ SaaS teams already using TriageInsight.</p>
          <a href="/signup" className="btn btn-yellow">Start free trial</a>
        </div>
      </section>
    </main>
  );
}
