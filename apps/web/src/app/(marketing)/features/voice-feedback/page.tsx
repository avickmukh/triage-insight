export const metadata = { title: "Voice Feedback — TriageInsight" };

export default function Page() {
  return (
    <main>
      <section style={{ background: "linear-gradient(135deg, #0A2540 0%, #0d2e4d 50%, #0a3060 100%)", padding: "8rem 0 5rem", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(32,164,164,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="container" style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <span className="section-label" style={{ color: "#20A4A4" }}>Voice Feedback</span>
          <h1 style={{ fontSize: "clamp(2.2rem,5vw,3.5rem)", fontWeight: 900, color: "#fff", lineHeight: 1.1, marginBottom: "1.25rem" }}>
            Capture what customers say,<br />
            <span style={{ color: "#20A4A4" }}>not just what they type.</span>
          </h1>
          <p style={{ fontSize: "1.15rem", color: "rgba(255,255,255,0.7)", maxWidth: 600, margin: "0 auto 2.5rem" }}>
            Upload call recordings or connect your support platform. TriageInsight transcribes, extracts feedback, and triages it automatically.
          </p>
          <a href="/signup?plan=FREE" className="btn btn-yellow">Start free trial</a>
        </div>
      </section>

      <section style={{ background: "#F8F9FA", padding: "5rem 0 6rem" }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "2rem" }}>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Automatic transcription</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Upload MP3, WAV, or MP4 files. TriageInsight transcribes them using state-of-the-art speech recognition.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Feedback extraction</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>AI reads the transcript and extracts discrete feedback items including feature requests, complaints, and compliments.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Speaker diarisation</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Multi-speaker calls are split by speaker. Feedback is attributed to the customer, not the support agent.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Sentiment analysis</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Each extracted item is tagged with sentiment. Spot frustrated customers before they churn.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Linked to customer record</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Transcripts are linked to the customer record in your CRM. Revenue impact is calculated automatically.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Bulk upload</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Upload hundreds of recordings at once via CSV or API. Process your entire backlog overnight.</p>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "#0A2540", padding: "5rem 0", textAlign: "center" }}>
        <div className="container">
          <h2 style={{ fontSize: "clamp(1.75rem,3vw,2.5rem)", fontWeight: 800, color: "#fff", marginBottom: "1rem" }}>Ready to bring clarity to your feedback?</h2>
          <p style={{ fontSize: "1.1rem", color: "rgba(255,255,255,0.65)", marginBottom: "2rem" }}>Join 200+ SaaS teams already using TriageInsight.</p>
          <a href="/signup?plan=FREE" className="btn btn-yellow">Start free trial</a>
        </div>
      </section>
    </main>
  );
}
