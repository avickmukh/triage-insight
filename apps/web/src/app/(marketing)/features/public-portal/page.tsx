export const metadata = { title: "Public Portal — TriageInsight" };

export default function Page() {
  return (
    <main>
      <section style={{ background: "linear-gradient(135deg, #0A2540 0%, #0d2e4d 50%, #0a3060 100%)", padding: "8rem 0 5rem", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(32,164,164,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="container" style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <span className="section-label" style={{ color: "#20A4A4" }}>Public Portal</span>
          <h1 style={{ fontSize: "clamp(2.2rem,5vw,3.5rem)", fontWeight: 900, color: "#fff", lineHeight: 1.1, marginBottom: "1.25rem" }}>
            Let customers vote on<br />
            <span style={{ color: "#20A4A4" }}>what matters most.</span>
          </h1>
          <p style={{ fontSize: "1.15rem", color: "rgba(255,255,255,0.7)", maxWidth: 600, margin: "0 auto 2.5rem" }}>
            A branded public portal where customers submit feature requests, upvote existing ones, and leave comments. No engineering required.
          </p>
          <a href="/signup" className="btn btn-yellow">Start free trial</a>
        </div>
      </section>

      <section style={{ background: "#F8F9FA", padding: "5rem 0 6rem" }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "2rem" }}>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Custom branding</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Use your own logo, colours, and domain. The portal looks like part of your product, not a third-party tool.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Voting and comments</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Customers upvote requests and leave comments. You see exactly how many customers want each feature.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Status updates</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Mark items as Under Review, Planned, or Shipped. Customers are notified automatically.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Spam protection</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Email verification and rate limiting keep your portal clean without friction for real customers.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Moderation queue</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>New submissions land in a moderation queue before going public. You control what your customers see.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Embeddable widget</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Embed the feedback form directly in your app with a single script tag. No redirect required.</p>
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
