export const metadata = { title: "Integrations — TriageInsight" };

const INTEGRATIONS = [
  { name: "Slack", cat: "Communication", desc: "Capture feedback from Slack channels automatically. Any message tagged #feedback lands in your inbox.", color: "#4A154B" },
  { name: "Intercom", cat: "Support", desc: "Sync support conversations and feature requests from Intercom directly into TriageInsight.", color: "#286EFA" },
  { name: "HubSpot", cat: "CRM", desc: "Link feedback to deals and contacts. See which features your highest-value customers are requesting.", color: "#FF7A59" },
  { name: "Salesforce", cat: "CRM", desc: "Pull deal data and contact records to weight feedback by revenue impact automatically.", color: "#00A1E0" },
  { name: "Zendesk", cat: "Support", desc: "Import support tickets and tag them as feedback. Spot recurring issues before they escalate.", color: "#03363D" },
  { name: "Zapier", cat: "Automation", desc: "Connect any tool to TriageInsight via Zapier. 5,000+ apps supported.", color: "#FF4A00" },
  { name: "CSV Import", cat: "Data", desc: "Bulk import historical feedback from any spreadsheet in seconds.", color: "#20A4A4" },
  { name: "REST API", cat: "Developer", desc: "Push feedback from any source using our RESTful API. Full OpenAPI documentation included.", color: "#0A2540" },
];

export default function IntegrationsPage() {
  return (
    <main>
      <section style={{ background: "linear-gradient(135deg, #0A2540 0%, #0d2e4d 50%, #0a3060 100%)", padding: "8rem 0 5rem", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(32,164,164,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="container" style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <span className="section-label" style={{ color: "#20A4A4" }}>Integrations</span>
          <h1 style={{ fontSize: "clamp(2.2rem,5vw,3.5rem)", fontWeight: 900, color: "#fff", lineHeight: 1.1, marginBottom: "1.25rem" }}>
            Feedback lives everywhere.<br /><span style={{ color: "#20A4A4" }}>TriageInsight connects it all.</span>
          </h1>
          <p style={{ fontSize: "1.15rem", color: "rgba(255,255,255,0.7)", maxWidth: 560, margin: "0 auto 2.5rem" }}>
            Connect your existing tools in minutes. No engineering required.
          </p>
          <a href="/signup?plan=FREE" className="btn btn-yellow">Start free trial</a>
        </div>
      </section>

      <section style={{ background: "#F8F9FA", padding: "5rem 0 6rem" }}>
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.5rem" }}>
            {INTEGRATIONS.map(i => (
              <div key={i.name} style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
                <div style={{ width: "3rem", height: "3rem", borderRadius: "0.75rem", background: i.color, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem" }}>
                  <span style={{ color: "#fff", fontWeight: 800, fontSize: "0.85rem" }}>{i.name.slice(0,2)}</span>
                </div>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#20A4A4", marginBottom: "0.375rem" }}>{i.cat}</div>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>{i.name}</h3>
                <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.6 }}>{i.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: "#0A2540", padding: "5rem 0", textAlign: "center" }}>
        <div className="container">
          <h2 style={{ fontSize: "clamp(1.75rem,3vw,2.5rem)", fontWeight: 800, color: "#fff", marginBottom: "1rem" }}>Don&apos;t see your tool?</h2>
          <p style={{ fontSize: "1.1rem", color: "rgba(255,255,255,0.65)", marginBottom: "2rem" }}>Use our REST API or Zapier to connect anything. Or contact us — we add integrations fast.</p>
          <a href="/signup?plan=FREE" className="btn btn-yellow">Start free trial</a>
        </div>
      </section>
    </main>
  );
}
