export const metadata = { title: "TriageInsight vs Frill — TriageInsight" };

export default function Page() {
  return (
    <main>
      <section style={{ background: "linear-gradient(135deg, #0A2540 0%, #0d2e4d 50%, #0a3060 100%)", padding: "8rem 0 5rem", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(32,164,164,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="container" style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <span className="section-label" style={{ color: "#20A4A4" }}>Comparison</span>
          <h1 style={{ fontSize: "clamp(2.2rem,5vw,3.5rem)", fontWeight: 900, color: "#fff", lineHeight: 1.1, marginBottom: "1.25rem" }}>
            TriageInsight vs <span style={{ color: "#20A4A4" }}>Frill</span>
          </h1>
          <p style={{ fontSize: "1.15rem", color: "rgba(255,255,255,0.7)", maxWidth: 600, margin: "0 auto 2.5rem" }}>
            Frill is a lightweight roadmap tool. TriageInsight is a full feedback intelligence platform.
          </p>
          <a href="/signup" className="btn btn-yellow">Try TriageInsight free</a>
        </div>
      </section>

      <section style={{ background: "#fff", padding: "5rem 0 6rem" }}>
        <div className="container" style={{ maxWidth: 800 }}>
          <p style={{ fontSize: "1.05rem", color: "#6C757D", lineHeight: 1.8, marginBottom: "3rem", maxWidth: 680 }}>
            Frill is a simple, clean tool for sharing a public roadmap and collecting feature requests. It is well-designed but limited in scope. TriageInsight includes everything Frill offers, plus AI triage, revenue weighting, voice feedback, and deep integrations. If you need more than a public board, TriageInsight is the right choice.
          </p>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #0A2540" }}>
                  <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6C757D" }}>Feature</th>
                  <th style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#20A4A4" }}>TriageInsight</th>
                  <th style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6C757D" }}>Frill</th>
                </tr>
              </thead>
              <tbody>
            <tr style={{ borderBottom: "1px solid #e9ecef" }}>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#0A2540", fontWeight: 500 }}>AI deduplication</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#20A4A4", fontWeight: 600, textAlign: "center" }}>Yes — semantic matching</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#6C757D", textAlign: "center" }}>No</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #e9ecef" }}>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#0A2540", fontWeight: 500 }}>Revenue-weighted prioritisation</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#20A4A4", fontWeight: 600, textAlign: "center" }}>Yes — linked to CRM deals</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#6C757D", textAlign: "center" }}>No</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #e9ecef" }}>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#0A2540", fontWeight: 500 }}>Voice feedback ingestion</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#20A4A4", fontWeight: 600, textAlign: "center" }}>Yes — transcribe and triage calls</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#6C757D", textAlign: "center" }}>No</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #e9ecef" }}>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#0A2540", fontWeight: 500 }}>Weekly AI digest</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#20A4A4", fontWeight: 600, textAlign: "center" }}>Yes — auto-generated every Monday</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#6C757D", textAlign: "center" }}>No</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #e9ecef" }}>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#0A2540", fontWeight: 500 }}>Public feedback portal</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#6C757D", fontWeight: 600, textAlign: "center" }}>Yes</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#6C757D", textAlign: "center" }}>Yes</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #e9ecef" }}>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#0A2540", fontWeight: 500 }}>Public roadmap</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#6C757D", fontWeight: 600, textAlign: "center" }}>Yes</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#6C757D", textAlign: "center" }}>Yes</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #e9ecef" }}>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#0A2540", fontWeight: 500 }}>Voting and comments</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#6C757D", fontWeight: 600, textAlign: "center" }}>Yes</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#6C757D", textAlign: "center" }}>Yes</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #e9ecef" }}>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#0A2540", fontWeight: 500 }}>Slack integration</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#20A4A4", fontWeight: 600, textAlign: "center" }}>Yes</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#6C757D", textAlign: "center" }}>No</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #e9ecef" }}>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#0A2540", fontWeight: 500 }}>CRM integration</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#20A4A4", fontWeight: 600, textAlign: "center" }}>Yes — HubSpot, Salesforce</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#6C757D", textAlign: "center" }}>No</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #e9ecef" }}>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#0A2540", fontWeight: 500 }}>Starting price</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#20A4A4", fontWeight: 600, textAlign: "center" }}>$0 / month</td>
              <td style={{ padding: "1rem 0.75rem", fontSize: "0.9rem", color: "#6C757D", textAlign: "center" }}>$25 / month</td>
            </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section style={{ background: "#0A2540", padding: "5rem 0", textAlign: "center" }}>
        <div className="container">
          <h2 style={{ fontSize: "clamp(1.75rem,3vw,2.5rem)", fontWeight: 800, color: "#fff", marginBottom: "1rem" }}>Ready to make the switch?</h2>
          <p style={{ fontSize: "1.1rem", color: "rgba(255,255,255,0.65)", marginBottom: "2rem" }}>Free migration support included on all paid plans.</p>
          <a href="/signup" className="btn btn-yellow">Start free trial</a>
        </div>
      </section>
    </main>
  );
}
