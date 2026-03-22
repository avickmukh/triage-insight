export const metadata = { title: "Public Roadmap — TriageInsight" };

export default function Page() {
  return (
    <main>
      <section style={{ background: "linear-gradient(135deg, #0A2540 0%, #0d2e4d 50%, #0a3060 100%)", padding: "8rem 0 5rem", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(32,164,164,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="container" style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <span className="section-label" style={{ color: "#20A4A4" }}>Public Roadmap</span>
          <h1 style={{ fontSize: "clamp(2.2rem,5vw,3.5rem)", fontWeight: 900, color: "#fff", lineHeight: 1.1, marginBottom: "1.25rem" }}>
            Build trust by showing<br />
            <span style={{ color: "#20A4A4" }}>what is coming.</span>
          </h1>
          <p style={{ fontSize: "1.15rem", color: "rgba(255,255,255,0.7)", maxWidth: 600, margin: "0 auto 2.5rem" }}>
            Share a live, filterable roadmap with your customers. Close the feedback loop automatically when items ship.
          </p>
          <a href="/signup?plan=FREE" className="btn btn-yellow">Start free trial</a>
        </div>
      </section>

      <section style={{ background: "#F8F9FA", padding: "5rem 0 6rem" }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "2rem" }}>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Kanban view</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>A clean Now / Next / Later board that customers can browse. Status updates in your admin panel reflect instantly.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Linked to feedback</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Each roadmap item shows the number of customers who requested it. Transparency builds trust.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Automatic notifications</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>When you mark an item as Shipped, every customer who voted for it receives an email automatically.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Filterable by category</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Customers can filter the roadmap by product area, status, or date. No more scrolling through irrelevant items.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Custom domain</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Host your roadmap at roadmap.yourproduct.com. Fully white-labelled.</p>
            </div>
            <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.5rem" }}>Embed anywhere</h3>
              <p style={{ fontSize: "0.875rem", color: "#6C757D", lineHeight: 1.7 }}>Embed the roadmap in your docs, help centre, or marketing site with a single iframe.</p>
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
