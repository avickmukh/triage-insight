import Link from "next/link";

// NOTE: No public GET /feedback endpoint exists on the backend yet.
// This page renders a static portal entry with a CTA to submit feedback.
// When the backend exposes GET /public/:orgSlug/feedback, replace the
// static list with a data-fetching component.

const PLACEHOLDER_ITEMS = [
  { id: "1", title: "Better export options for reports", description: "It would be great to export feedback reports as CSV or PDF directly from the dashboard.", voteCount: 34, status: "Under Review" },
  { id: "2", title: "Dark mode support", description: "A dark mode toggle would reduce eye strain for users who work late.", voteCount: 28, status: "Planned" },
  { id: "3", title: "Slack notifications for new feedback", description: "Send a Slack message to a channel whenever new feedback is submitted via the portal.", voteCount: 19, status: "Shipped" },
];

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  "Under Review": { bg: "#FFF3CD", color: "#856404" },
  "Planned": { bg: "#D1ECF1", color: "#0C5460" },
  "Shipped": { bg: "#D4EDDA", color: "#155724" },
  "Default": { bg: "#e9ecef", color: "#495057" },
};

export default async function PublicFeedbackListPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#0A2540", letterSpacing: "-0.02em", marginBottom: "0.4rem" }}>Feedback Board</h1>
          <p style={{ color: "#6C757D", fontSize: "0.95rem" }}>Share your ideas, vote on requests, and track what&apos;s being built.</p>
        </div>
        <Link href={`/${orgSlug}/feedback/new`} style={{ display: "inline-block", background: "#FFC857", color: "#0A2540", fontWeight: 700, fontSize: "0.875rem", padding: "0.625rem 1.25rem", borderRadius: 8, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>+ Submit Feedback</Link>
      </div>
      <div style={{ background: "#e8f7f7", border: "1px solid #20A4A4", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.5rem", fontSize: "0.85rem", color: "#0A2540" }}>
        <strong>Note:</strong> The live feedback list will appear here once the public portal API endpoint is enabled. The items below are illustrative placeholders.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {PLACEHOLDER_ITEMS.map((item) => {
          const badge = STATUS_COLORS[item.status] ?? STATUS_COLORS.Default;
          return (
            <div key={item.id} style={{ background: "#ffffff", border: "1px solid #e9ecef", borderRadius: 10, padding: "1.25rem 1.5rem", display: "flex", alignItems: "flex-start", gap: "1.25rem", boxShadow: "0 2px 8px rgba(10,37,64,0.06)" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 48, gap: "0.25rem" }}>
                <button style={{ background: "none", border: "1.5px solid #20A4A4", borderRadius: 6, padding: "0.25rem 0.5rem", cursor: "pointer", color: "#20A4A4", fontSize: "0.75rem", fontWeight: 700, lineHeight: 1 }}>▲</button>
                <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#0A2540" }}>{item.voteCount}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#0A2540", margin: 0 }}>{item.title}</h3>
                  <span style={{ background: badge.bg, color: badge.color, fontSize: "0.7rem", fontWeight: 600, padding: "0.2rem 0.55rem", borderRadius: 20 }}>{item.status}</span>
                </div>
                <p style={{ color: "#6C757D", fontSize: "0.875rem", margin: 0 }}>{item.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
