export const metadata = { title: "Pricing — TriageInsight" };

// ── Shared helpers ────────────────────────────────────────────────────────────

function CheckIcon({ dark = false }: { dark?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="#20A4A4" fillOpacity={dark ? 0.25 : 0.12} />
      <path d="M5 8l2 2 4-4" stroke="#20A4A4" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Feature({ label, dark = false }: { label: string; dark?: boolean }) {
  return (
    <li style={{ display: "flex", alignItems: "center", gap: "0.625rem", fontSize: "0.9rem", color: dark ? "rgba(255,255,255,0.85)" : "#0A2540" }}>
      <CheckIcon dark={dark} />
      {label}
    </li>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

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
          <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.4)" }}>No credit card required &nbsp;&bull;&nbsp; 14-day free trial on paid plans &nbsp;&bull;&nbsp; Cancel anytime</p>
        </div>
      </section>

      {/* ── Plans ── */}
      <section style={{ background: "#F8F9FA", padding: "5rem 0 6rem" }}>
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "2rem", maxWidth: 1000, margin: "0 auto" }}>

            {/* ── FREE ── */}
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2.5rem 2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <span className="section-label">Free</span>
              <div style={{ fontSize: "3rem", fontWeight: 900, color: "#0A2540", lineHeight: 1, marginBottom: "0.25rem" }}>$0</div>
              <div style={{ fontSize: "0.875rem", color: "#6C757D", marginBottom: "2rem" }}>/ month &middot; forever free</div>
              <ul style={{ listStyle: "none", padding: 0, marginBottom: "2rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <Feature label="1 admin · up to 3 staff" />
                <Feature label="100 feedback items / month" />
                <Feature label="Basic portal (submit + public roadmap)" />
                <Feature label="Basic AI deduplication (limited)" />
                <Feature label="CSV import only" />
              </ul>
              <a href="/signup?plan=FREE" className="btn btn-outline-teal" style={{ width: "100%", justifyContent: "center" }}>Get started free</a>
            </div>

            {/* ── PRO ── */}
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2.5rem 2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <span className="section-label">Pro</span>
              <div style={{ fontSize: "3rem", fontWeight: 900, color: "#0A2540", lineHeight: 1, marginBottom: "0.25rem" }}>$29</div>
              <div style={{ fontSize: "0.875rem", color: "#6C757D", marginBottom: "2rem" }}>/ month &middot; billed monthly</div>
              <ul style={{ listStyle: "none", padding: 0, marginBottom: "2rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <Feature label="1 admin · up to 5 staff" />
                <Feature label="1,000 feedback items / month" />
                <Feature label="Full portal (vote, comment, notifications)" />
                <Feature label="Full AI deduplication & theme clustering" />
                <Feature label="CIQ prioritization & explainable AI scores" />
                <Feature label="Voice feedback (100 uploads / month)" />
                <Feature label="Survey (300 responses / month)" />
                <Feature label="Integrations: Slack + API" />
              </ul>
              <a href="/signup?plan=PRO" className="btn btn-outline-teal" style={{ width: "100%", justifyContent: "center" }}>Start 14-day trial</a>
            </div>

            {/* ── BUSINESS ── */}
            <div style={{ background: "#0A2540", borderRadius: "1rem", border: "2px solid #20A4A4", padding: "2.5rem 2rem", boxShadow: "0 16px 48px rgba(10,37,64,0.18)", position: "relative" }}>
              <span style={{ position: "absolute", top: "-0.875rem", left: "50%", transform: "translateX(-50%)", background: "#FFC857", color: "#0A2540", fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.3rem 1rem", borderRadius: 999 }}>Most Popular</span>
              <span className="section-label" style={{ color: "#20A4A4" }}>Business</span>
              <div style={{ fontSize: "3rem", fontWeight: 900, color: "#fff", lineHeight: 1, marginBottom: "0.25rem" }}>$49</div>
              <div style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.5)", marginBottom: "2rem" }}>/ month &middot; billed monthly</div>
              <ul style={{ listStyle: "none", padding: 0, marginBottom: "2rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <Feature label="Up to 3 admins · up to 15 staff" dark />
                <Feature label="Unlimited feedback items" dark />
                <Feature label="Full AI features + weekly AI digest" dark />
                <Feature label="Voice feedback unlimited" dark />
                <Feature label="Survey unlimited" dark />
                <Feature label="Integrations: Slack, Zendesk, Intercom, HubSpot, API" dark />
                <Feature label="Executive reporting" dark />
              </ul>
              <a href="/signup?plan=BUSINESS" className="btn btn-yellow" style={{ width: "100%", justifyContent: "center" }}>Start 14-day trial</a>
            </div>

          </div>
        </div>
      </section>

      {/* ── Feature comparison table ── */}
      <section style={{ background: "#fff", padding: "5rem 0 6rem" }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <span className="section-label">Compare plans</span>
            <h2 style={{ fontSize: "clamp(1.75rem,3vw,2.5rem)", fontWeight: 800, color: "#0A2540" }}>Everything you get</h2>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e9ecef" }}>
                <th style={{ textAlign: "left", padding: "0.75rem 1rem", color: "#6C757D", fontWeight: 600, width: "40%" }}>Feature</th>
                <th style={{ textAlign: "center", padding: "0.75rem 1rem", color: "#0A2540", fontWeight: 700 }}>Free</th>
                <th style={{ textAlign: "center", padding: "0.75rem 1rem", color: "#0A2540", fontWeight: 700 }}>Pro</th>
                <th style={{ textAlign: "center", padding: "0.75rem 1rem", color: "#0A2540", fontWeight: 700 }}>Business</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Admins",                     "1",        "1",                  "Up to 3"],
                ["Staff seats",                "Up to 3",  "Up to 5",            "Up to 15"],
                ["Feedback items / month",     "100",      "1,000",              "Unlimited"],
                ["Public portal",              "Basic",    "Full",               "Full"],
                ["AI deduplication",           "Limited",  "Full",               "Full"],
                ["AI theme clustering",        "—",        "✓",                  "✓"],
                ["CIQ prioritization",         "—",        "✓",                  "✓"],
                ["Explainable AI scores",      "—",        "✓",                  "✓"],
                ["Weekly AI digest",           "—",        "—",                  "✓"],
                ["Voice feedback",             "—",        "100 / month",        "Unlimited"],
                ["Survey",                     "—",        "300 responses / mo", "Unlimited"],
                ["CSV import",                 "✓",        "✓",                  "✓"],
                ["Integrations",               "—",        "Slack + API",        "Slack, Zendesk, Intercom, HubSpot, API"],
                ["Executive reporting",        "—",        "—",                  "✓"],
                ["Custom domain",              "—",        "Coming soon",        "Coming soon"],
              ].map(([feature, free, pro, business], i) => (
                <tr key={feature} style={{ borderBottom: "1px solid #f1f3f5", background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                  <td style={{ padding: "0.75rem 1rem", color: "#0A2540", fontWeight: 500 }}>{feature}</td>
                  <td style={{ textAlign: "center", padding: "0.75rem 1rem", color: free === "—" ? "#ADB5BD" : "#0A2540" }}>{free}</td>
                  <td style={{ textAlign: "center", padding: "0.75rem 1rem", color: pro === "—" ? "#ADB5BD" : "#0A2540" }}>{pro}</td>
                  <td style={{ textAlign: "center", padding: "0.75rem 1rem", color: business === "—" ? "#ADB5BD" : "#0A2540", fontWeight: business !== "—" && business !== free && business !== pro ? 600 : 400 }}>{business}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ background: "#F8F9FA", padding: "5rem 0 6rem" }}>
        <div className="container" style={{ maxWidth: 720 }}>
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <span className="section-label">FAQ</span>
            <h2 style={{ fontSize: "clamp(1.75rem,3vw,2.5rem)", fontWeight: 800, color: "#0A2540" }}>Common questions</h2>
          </div>
          {[
            { q: "Can I switch plans later?", a: "Yes. You can upgrade or downgrade at any time. Changes take effect at the start of the next billing cycle." },
            { q: "What counts as a feedback item?", a: "Each unique piece of feedback submitted — whether via the public portal, CSV import, or API — counts as one item." },
            { q: "Is there a free trial for paid plans?", a: "Yes. Both Pro and Business start with a 14-day free trial. No credit card required." },
            { q: "What is CIQ prioritization?", a: "Customer Intelligence Quotient (CIQ) is our revenue-weighted scoring model that ranks feedback by the business impact of the customers who submitted it." },
            { q: "What does 'coming soon' mean for custom domain?", a: "Custom domain support for the public portal is on our roadmap. It is not available yet on any plan." },
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
          <a href="/signup?plan=BUSINESS" className="btn btn-yellow">Start free trial</a>
        </div>
      </section>

    </main>
  );
}
