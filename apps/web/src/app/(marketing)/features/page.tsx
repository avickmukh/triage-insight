export const metadata = { title: "Features — TriageInsight" };

const FEATURES = [
  { label: "AI Deduplication", title: "Stop reading the same request twice", desc: "Our AI identifies semantically identical feedback across all your channels and merges them automatically — so your inbox shows signal, not noise.", href: "/features/ai-deduplication", icon: "🔍" },
  { label: "Theme Clustering", title: "See the patterns your team keeps missing", desc: "Feedback is automatically grouped into themes. Spot emerging trends before they become crises.", href: "/features/theme-clustering", icon: "🗂️" },
  { label: "Weekly Digest", title: "One email. Every insight that matters.", desc: "An AI-written digest lands in your inbox every Monday. No dashboards to check, no spreadsheets to maintain.", href: "/features/weekly-digest", icon: "📬" },
  { label: "Voice Feedback", title: "Capture what customers say, not just type", desc: "Upload call recordings or connect your support platform. TriageInsight transcribes and triages voice feedback automatically.", href: "/features/voice-feedback", icon: "🎙️" },
  { label: "Public Portal", title: "Let customers vote on what matters most", desc: "A branded public portal where customers submit and upvote feature requests. No engineering required.", href: "/features/public-portal", icon: "🌐" },
  { label: "Public Roadmap", title: "Build trust by showing what's coming", desc: "Share a live, filterable roadmap with your customers. Close the feedback loop automatically.", href: "/features/public-roadmap", icon: "🗺️" },
];

export default function FeaturesPage() {
  return (
    <main>
      <section style={{ background: "linear-gradient(135deg, #0A2540 0%, #0d2e4d 50%, #0a3060 100%)", padding: "8rem 0 5rem", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(32,164,164,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="container" style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <span className="section-label" style={{ color: "#20A4A4" }}>Features</span>
          <h1 style={{ fontSize: "clamp(2.2rem,5vw,3.5rem)", fontWeight: 900, color: "#fff", lineHeight: 1.1, marginBottom: "1.25rem" }}>
            Everything you need to turn<br /><span style={{ color: "#20A4A4" }}>feedback into decisions.</span>
          </h1>
          <p style={{ fontSize: "1.15rem", color: "rgba(255,255,255,0.7)", maxWidth: 560, margin: "0 auto 2.5rem" }}>
            Six AI-powered capabilities that work together to give your product team an unfair advantage.
          </p>
          <a href="/signup?plan=FREE" className="btn btn-yellow">Start free trial</a>
        </div>
      </section>

      <section style={{ background: "#F8F9FA", padding: "5rem 0 6rem" }}>
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" }}>
            {FEATURES.map(f => (
              <a key={f.href} href={f.href} style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #e9ecef", padding: "2.5rem 2rem", boxShadow: "0 2px 8px rgba(10,37,64,0.08)", textDecoration: "none", display: "block", transition: "box-shadow 0.22s, transform 0.22s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(10,37,64,0.14)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(10,37,64,0.08)"; (e.currentTarget as HTMLElement).style.transform = "none"; }}>
                <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>{f.icon}</div>
                <span className="section-label">{f.label}</span>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#0A2540", marginBottom: "0.75rem", lineHeight: 1.3 }}>{f.title}</h3>
                <p style={{ fontSize: "0.9rem", color: "#6C757D", lineHeight: 1.7 }}>{f.desc}</p>
                <div style={{ marginTop: "1.5rem", color: "#20A4A4", fontSize: "0.875rem", fontWeight: 600 }}>Learn more →</div>
              </a>
            ))}
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
