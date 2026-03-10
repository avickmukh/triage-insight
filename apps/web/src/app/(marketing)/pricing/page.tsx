export const metadata = { title: "Pricing — TriageInsight" };

export default function PricingPage() {
  return (
    <main>
      {/* ── Page Hero ── */}
      <section style={{ background: "linear-gradient(135deg, #0A2540 0%, #0d2e4d 50%, #0a3060 100%)", padding: "8rem 0 5rem", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(32,164,164,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="container" style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <span className="section-label" style={{ color: "#20A4A4" }}>Pricing</span>
          <h1 style={{ fontSize: "clamp(2.2rem,5vw,3.5rem)", fontWeight: 900, color: "#fff", lineHeight: 1.1, marginBottom: "1.25rem" }}>
            Simple, transparent pricing.<br />
            <span style={{ color: "#20A4A4" }}>No surprises.</span>
          </h1>
          <p style={{ fontSize: "1.15rem", color: "rgba(255,255,255,0.7)", maxWidth: 560, margin: "0 auto 2rem" }}>
            Start free. Upgrade when you&apos;re ready. Cancel anytime.
          </p>
          <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.4)" }}>No credit card required &nbsp;&bull;&nbsp; 14-day free trial &nbsp;&bull;&nbsp; Cancel anytime</p>
        </div>
      </section>

      {/* ── Plans ── */}
      <section style={{ background: "#F8F9FA", padding: "5rem 0 6rem" }}>
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "2rem", maxWidth: 1000, margin: "0 auto" }}>

            {/* Starter */}
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2.5rem 2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <span className="section-label">Starter</span>
              <div style={{ fontSize: "3rem", fontWeight: 900, color: "#0A2540", lineHeight: 1, marginBottom: "0.25rem" }}>$0</div>
              <div style={{ fontSize: "0.875rem", color: "#6C757D", marginBottom: "2rem" }}>/ month &middot; forever free</div>
              <ul style={{ listStyle: "none", padding: 0, marginBottom: "2rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                {["Up to 100 feedback items / mo", "1 workspace", "AI deduplication (basic)", "Public portal", "Email support"].map(f => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: "0.625rem", fontSize: "0.9rem", color: "#0A2540" }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#20A4A4" fillOpacity="0.12"/><path d="M5 8l2 2 4-4" stroke="#20A4A4" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <a href="/signup" className="btn btn-outline-teal" style={{ width: "100%", justifyContent: "center" }}>Get started free</a>
            </div>

            {/* Pro */}
            <div style={{ background: "#0A2540", borderRadius: "1rem", border: "2px solid #20A4A4", padding: "2.5rem 2rem", boxShadow: "0 16px 48px rgba(10,37,64,0.18)", position: "relative" }}>
              <span style={{ position: "absolute", top: "-0.875rem", left: "50%", transform: "translateX(-50%)", background: "#FFC857", color: "#0A2540", fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.3rem 1rem", borderRadius: 999 }}>Most Popular</span>
              <span className="section-label" style={{ color: "#20A4A4" }}>Pro</span>
              <div style={{ fontSize: "3rem", fontWeight: 900, color: "#fff", lineHeight: 1, marginBottom: "0.25rem" }}>$49</div>
              <div style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.5)", marginBottom: "2rem" }}>/ month &middot; billed monthly</div>
              <ul style={{ listStyle: "none", padding: 0, marginBottom: "2rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                {["Unlimited feedback items", "3 workspaces", "Full AI deduplication & clustering", "Revenue-weighted prioritization", "Weekly AI digest", "Voice feedback ingestion", "Integrations (Slack, Intercom, HubSpot)", "Priority support"].map(f => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: "0.625rem", fontSize: "0.9rem", color: "rgba(255,255,255,0.85)" }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#20A4A4" fillOpacity="0.25"/><path d="M5 8l2 2 4-4" stroke="#20A4A4" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <a href="/signup" className="btn btn-yellow" style={{ width: "100%", justifyContent: "center" }}>Start free trial</a>
            </div>

            {/* Enterprise */}
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2.5rem 2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <span className="section-label">Enterprise</span>
              <div style={{ fontSize: "3rem", fontWeight: 900, color: "#0A2540", lineHeight: 1, marginBottom: "0.25rem" }}>Custom</div>
              <div style={{ fontSize: "0.875rem", color: "#6C757D", marginBottom: "2rem" }}>/ month &middot; annual billing</div>
              <ul style={{ listStyle: "none", padding: 0, marginBottom: "2rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                {["Everything in Pro", "Unlimited workspaces", "SSO / SAML", "Custom integrations", "Dedicated CSM", "SLA & uptime guarantee", "Custom data retention", "Audit logs"].map(f => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: "0.625rem", fontSize: "0.9rem", color: "#0A2540" }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#20A4A4" fillOpacity="0.12"/><path d="M5 8l2 2 4-4" stroke="#20A4A4" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <a href="mailto:sales@triage-insight.com" className="btn btn-teal" style={{ width: "100%", justifyContent: "center" }}>Talk to sales</a>
            </div>

          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ background: "#fff", padding: "5rem 0 6rem" }}>
        <div className="container" style={{ maxWidth: 720 }}>
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <span className="section-label">FAQ</span>
            <h2 style={{ fontSize: "clamp(1.75rem,3vw,2.5rem)", fontWeight: 800, color: "#0A2540" }}>Common questions</h2>
          </div>
          {[
            { q: "Can I switch plans later?", a: "Yes. You can upgrade or downgrade at any time. Changes take effect at the start of the next billing cycle." },
            { q: "What counts as a feedback item?", a: "Each unique piece of feedback submitted — whether via the public portal, email, Slack, or API — counts as one item." },
            { q: "Is there a free trial for paid plans?", a: "Yes. Every paid plan starts with a 14-day free trial. No credit card required." },
            { q: "Do you offer discounts for startups?", a: "Yes. We offer 50% off for early-stage startups (under $1M ARR). Contact us to apply." },
          ].map(({ q, a }) => (
            <div key={q} style={{ borderBottom: "1px solid #e9ecef", padding: "1.5rem 0" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>{q}</h3>
              <p style={{ fontSize: "0.95rem", color: "#6C757D", lineHeight: 1.7 }}>{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
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
