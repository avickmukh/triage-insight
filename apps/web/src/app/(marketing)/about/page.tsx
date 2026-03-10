export const metadata = { title: "About — TriageInsight" };

export default function AboutPage() {
  return (
    <main>
      <section style={{ background: "linear-gradient(135deg, #0A2540 0%, #0d2e4d 50%, #0a3060 100%)", padding: "8rem 0 5rem", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(32,164,164,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="container" style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <span className="section-label" style={{ color: "#20A4A4" }}>About</span>
          <h1 style={{ fontSize: "clamp(2.2rem,5vw,3.5rem)", fontWeight: 900, color: "#fff", lineHeight: 1.1, marginBottom: "1.25rem" }}>
            We built the tool<br /><span style={{ color: "#20A4A4" }}>we always needed.</span>
          </h1>
          <p style={{ fontSize: "1.15rem", color: "rgba(255,255,255,0.7)", maxWidth: 600, margin: "0 auto" }}>
            TriageInsight was born from the frustration of drowning in feedback with no way to make sense of it.
          </p>
        </div>
      </section>

      <section style={{ background: "#fff", padding: "5rem 0 6rem" }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <span className="section-label">Our Story</span>
          <h2 style={{ fontSize: "clamp(1.75rem,3vw,2.25rem)", fontWeight: 800, color: "#0A2540", marginBottom: "1.5rem" }}>Why we built this</h2>
          <p style={{ fontSize: "1.05rem", color: "#6C757D", lineHeight: 1.8, marginBottom: "1.5rem" }}>
            Every product team we talked to had the same problem: feedback was everywhere — Slack, email, support tickets, sales calls — and no one had time to read it all, let alone act on it. The result? Important signals got missed, roadmaps were driven by whoever shouted loudest, and customers felt ignored.
          </p>
          <p style={{ fontSize: "1.05rem", color: "#6C757D", lineHeight: 1.8, marginBottom: "1.5rem" }}>
            We built TriageInsight to be the single source of truth for product feedback. AI does the heavy lifting — deduplicating, clustering, and prioritising — so your team can focus on building.
          </p>
          <p style={{ fontSize: "1.05rem", color: "#6C757D", lineHeight: 1.8 }}>
            Today, 200+ SaaS teams use TriageInsight to turn feedback noise into product clarity.
          </p>
        </div>
      </section>

      <section style={{ background: "#F8F9FA", padding: "5rem 0 6rem" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <span className="section-label">Values</span>
            <h2 style={{ fontSize: "clamp(1.75rem,3vw,2.25rem)", fontWeight: 800, color: "#0A2540" }}>What we stand for</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "2rem" }}>
            {[
              { title: "Clarity over noise", desc: "We believe every product decision should be grounded in clear, structured evidence — not gut feel." },
              { title: "Customer empathy", desc: "We build tools that help teams listen better. That starts with us listening to our own customers." },
              { title: "Radical transparency", desc: "We share our roadmap publicly, respond to every support ticket, and never hide behind vague status pages." },
              { title: "Sustainable growth", desc: "We grow at a pace that lets us stay focused on quality. We are not chasing vanity metrics." },
            ].map(v => (
              <div key={v.title} style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>{v.title}</h3>
                <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: "#0A2540", padding: "5rem 0", textAlign: "center" }}>
        <div className="container">
          <h2 style={{ fontSize: "clamp(1.75rem,3vw,2.5rem)", fontWeight: 800, color: "#fff", marginBottom: "1rem" }}>Want to join us?</h2>
          <p style={{ fontSize: "1.1rem", color: "rgba(255,255,255,0.65)", marginBottom: "2rem" }}>We are a small, remote-first team. We hire for impact, not credentials.</p>
          <a href="mailto:careers@triage-insight.com" className="btn btn-yellow">View open roles</a>
        </div>
      </section>
    </main>
  );
}
