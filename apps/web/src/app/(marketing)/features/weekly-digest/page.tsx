export const metadata = { title: "Weekly Digest — TriageInsight" };

export default function Page() {
  return (
    <main>
      <section style={{ background: "linear-gradient(135deg, #0A2540 0%, #0d2e4d 50%, #0a3060 100%)", padding: "8rem 0 5rem", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(32,164,164,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="container" style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <span className="section-label" style={{ color: "#20A4A4" }}>Weekly Digest</span>
          <h1 style={{ fontSize: "clamp(2.2rem,5vw,3.5rem)", fontWeight: 900, color: "#fff", lineHeight: 1.1, marginBottom: "1.25rem" }}>
            One email. Every insight<br />
            <span style={{ color: "#20A4A4" }}>that matters.</span>
          </h1>
          <p style={{ fontSize: "1.15rem", color: "rgba(255,255,255,0.7)", maxWidth: 600, margin: "0 auto 2.5rem" }}>
            Every Monday, TriageInsight sends your team an AI-written summary of the week's feedback with trends, anomalies, and recommended actions.
          </p>
          <a href="/signup?plan=FREE" className="btn btn-yellow">Start free trial</a>
        </div>
      </section>

      <section style={{ background: "#F8F9FA", padding: "5rem 0 6rem" }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "2rem" }}>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>AI-written narrative</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Not just numbers - a plain-English summary of what changed, what spiked, and what your customers are asking for.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Trend detection</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Spot emerging themes before they become crises. The digest highlights week-on-week changes in feedback volume and sentiment.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Top themes this week</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>The top 5 themes by new feedback volume, with revenue impact and recommended next actions.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Anomaly alerts</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Unusual spikes in a specific topic are flagged automatically even if you did not think to look.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Configurable recipients</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Send the digest to your whole team, just the PM, or a Slack channel. Fully configurable per workspace.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Digest history</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Every digest is archived in your workspace. Search and reference past summaries at any time.</p>
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
