export const metadata = { title: "Security — TriageInsight" };

const PILLARS = [
  { icon: "🔐", title: "Encryption at rest & in transit", desc: "All data is encrypted using AES-256 at rest and TLS 1.3 in transit. Your feedback data is never stored in plaintext." },
  { icon: "🏢", title: "SOC 2 Type II (in progress)", desc: "We are currently undergoing SOC 2 Type II certification. Our controls are audited by an independent third party." },
  { icon: "🌍", title: "GDPR & CCPA compliant", desc: "We are fully compliant with GDPR and CCPA. Data processing agreements available on request." },
  { icon: "🔑", title: "SSO & SAML (Enterprise)", desc: "Enterprise plans support Single Sign-On via SAML 2.0, Google Workspace, and Okta." },
  { icon: "📋", title: "Audit logs", desc: "Every action in your workspace is logged. Full audit trails available for Enterprise customers." },
  { icon: "🗑️", title: "Data deletion", desc: "You own your data. Delete your workspace and all associated data is permanently removed within 30 days." },
];

export default function SecurityPage() {
  return (
    <main>
      <section style={{ background: "linear-gradient(135deg, #0A2540 0%, #0d2e4d 50%, #0a3060 100%)", padding: "8rem 0 5rem", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(32,164,164,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="container" style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <span className="section-label" style={{ color: "#20A4A4" }}>Security</span>
          <h1 style={{ fontSize: "clamp(2.2rem,5vw,3.5rem)", fontWeight: 900, color: "#fff", lineHeight: 1.1, marginBottom: "1.25rem" }}>
            Your data is safe with us.<br /><span style={{ color: "#20A4A4" }}>We take that seriously.</span>
          </h1>
          <p style={{ fontSize: "1.15rem", color: "rgba(255,255,255,0.7)", maxWidth: 560, margin: "0 auto" }}>
            Enterprise-grade security built in from day one — not bolted on later.
          </p>
        </div>
      </section>

      <section style={{ background: "#F8F9FA", padding: "5rem 0 6rem" }}>
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "2rem" }}>
            {PILLARS.map(p => (
              <div key={p.title} style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2.5rem 2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
                <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>{p.icon}</div>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.625rem" }}>{p.title}</h3>
                <p style={{ fontSize: "0.9rem", color: "#6C757D", lineHeight: 1.7 }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: "#fff", padding: "5rem 0 6rem" }}>
        <div className="container" style={{ maxWidth: 720, textAlign: "center" }}>
          <span className="section-label">Responsible Disclosure</span>
          <h2 style={{ fontSize: "clamp(1.75rem,3vw,2.25rem)", fontWeight: 800, color: "#0A2540", marginBottom: "1rem" }}>Found a vulnerability?</h2>
          <p style={{ fontSize: "1rem", color: "#6C757D", lineHeight: 1.7, marginBottom: "2rem" }}>
            We take security reports seriously. Please email <a href="mailto:security@triage-insight.com" style={{ color: "#20A4A4", fontWeight: 600 }}>security@triage-insight.com</a> with details. We aim to respond within 48 hours and will credit responsible disclosures.
          </p>
        </div>
      </section>
    </main>
  );
}
