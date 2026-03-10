// NOTE: No public GET /roadmap endpoint exists on the backend yet.
// When the backend exposes GET /public/:orgSlug/roadmap, replace the
// static list with a data-fetching component.

const PLACEHOLDER_ROADMAP: { status: string; color: string; bg: string; items: { title: string; description: string }[] }[] = [
  { status: "Planned", color: "#0C5460", bg: "#D1ECF1", items: [
    { title: "AI-powered duplicate detection", description: "Automatically surface and merge duplicate feedback entries using semantic similarity." },
    { title: "CSV bulk import", description: "Import historical feedback from spreadsheets in one click." },
  ]},
  { status: "In Progress", color: "#856404", bg: "#FFF3CD", items: [
    { title: "Weekly digest emails", description: "Automated summaries of top feedback themes delivered to your inbox every Monday." },
  ]},
  { status: "Shipped", color: "#155724", bg: "#D4EDDA", items: [
    { title: "Public feedback portal", description: "Let customers submit and vote on feedback without needing an account." },
    { title: "Slack integration", description: "Ingest feedback directly from Slack channels." },
  ]},
];

export default async function PublicRoadmapPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#0A2540", letterSpacing: "-0.02em", marginBottom: "0.4rem" }}>Product Roadmap</h1>
        <p style={{ color: "#6C757D", fontSize: "0.95rem" }}>See what we&apos;re working on, what&apos;s coming next, and what we&apos;ve already shipped.</p>
      </div>
      <div style={{ background: "#e8f7f7", border: "1px solid #20A4A4", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "2rem", fontSize: "0.85rem", color: "#0A2540" }}>
        <strong>Note:</strong> The live roadmap will appear here once the public roadmap API endpoint is enabled. The items below are illustrative placeholders.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
        {PLACEHOLDER_ROADMAP.map((column) => (
          <div key={column.status}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <span style={{ background: column.bg, color: column.color, fontSize: "0.75rem", fontWeight: 700, padding: "0.25rem 0.65rem", borderRadius: 20 }}>{column.status}</span>
              <span style={{ color: "#6C757D", fontSize: "0.8rem" }}>{column.items.length} item{column.items.length !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              {column.items.map((item) => (
                <div key={item.title} style={{ background: "#ffffff", border: "1px solid #e9ecef", borderRadius: 10, padding: "1rem 1.25rem", boxShadow: "0 2px 8px rgba(10,37,64,0.05)" }}>
                  <h3 style={{ fontSize: "0.9rem", fontWeight: 600, color: "#0A2540", marginBottom: "0.35rem" }}>{item.title}</h3>
                  <p style={{ fontSize: "0.8rem", color: "#6C757D", margin: 0, lineHeight: 1.5 }}>{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: "2.5rem", textAlign: "center" }}>
        <p style={{ color: "#6C757D", fontSize: "0.875rem", marginBottom: "0.75rem" }}>Have a feature request?</p>
        <a href={`/${orgSlug}/feedback/new`} style={{ display: "inline-block", background: "#FFC857", color: "#0A2540", fontWeight: 700, fontSize: "0.875rem", padding: "0.625rem 1.25rem", borderRadius: 8 }}>Submit Feedback</a>
      </div>
    </div>
  );
}
