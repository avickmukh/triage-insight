export const metadata = { title: "Alternatives — TriageInsight" };

const ALTS = [
  { name: "Canny", href: "/compare/canny", desc: "Canny is a feedback board tool. TriageInsight adds AI triage, revenue weighting, and voice ingestion that Canny lacks." },
  { name: "Frill", href: "/compare/frill", desc: "Frill focuses on public roadmaps. TriageInsight goes deeper with AI clustering and prioritization scoring." },
  { name: "UserVoice", href: "/compare/uservoice", desc: "UserVoice is enterprise-heavy and expensive. TriageInsight gives you more AI power at a fraction of the cost." },
];

export default function AlternativesPage() {
  return (
    <main>
      <section style={{ background: "linear-gradient(135deg, #0A2540 0%, #0d2e4d 50%, #0a3060 100%)", padding: "8rem 0 5rem", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(32,164,164,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="container" style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <span className="section-label" style={{ color: "#20A4A4" }}>Alternatives</span>
          <h1 style={{ fontSize: "clamp(2.2rem,5vw,3.5rem)", fontWeight: 900, color: "#fff", lineHeight: 1.1, marginBottom: "1.25rem" }}>
            How does TriageInsight<br /><span style={{ color: "#20A4A4" }}>compare to the alternatives?</span>
          </h1>
          <p style={{ fontSize: "1.15rem", color: "rgba(255,255,255,0.7)", maxWidth: 560, margin: "0 auto" }}>
            We are not the only feedback tool. But we are the only one built around AI-first triage.
          </p>
        </div>
      </section>

      <section style={{ background: "#F8F9FA", padding: "5rem 0 6rem" }}>
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "2rem", maxWidth: 960, margin: "0 auto" }}>
            {ALTS.map(a => (
              <div key={a.name} style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2.5rem 2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0A2540", marginBottom: "0.75rem" }}>TriageInsight vs {a.name}</h3>
                <p style={{ fontSize: "0.9rem", color: "#6C757D", lineHeight: 1.7, marginBottom: "1.5rem" }}>{a.desc}</p>
                <a href={a.href} className="btn btn-outline-teal btn-sm">See full comparison →</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: "#0A2540", padding: "5rem 0", textAlign: "center" }}>
        <div className="container">
          <h2 style={{ fontSize: "clamp(1.75rem,3vw,2.5rem)", fontWeight: 800, color: "#fff", marginBottom: "1rem" }}>Ready to make the switch?</h2>
          <p style={{ fontSize: "1.1rem", color: "rgba(255,255,255,0.65)", marginBottom: "2rem" }}>Free migration support included on all paid plans.</p>
          <a href="/signup?plan=FREE" className="btn btn-yellow">Start free trial</a>
        </div>
      </section>
    </main>
  );
}
