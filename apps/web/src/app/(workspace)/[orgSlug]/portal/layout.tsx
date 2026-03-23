import React from "react";

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F8F9FA",
        fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif",
        color: "#0A2540",
      }}
    >
      <header
        style={{
          background: "#0A2540",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "0 1.5rem",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            height: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: 28,
                height: 28,
                background: "linear-gradient(135deg, #20A4A4 0%, #1a8f8f 100%)",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 4h10M3 8h7M3 12h5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span style={{ color: "#ffffff", fontWeight: 700, fontSize: "0.95rem", letterSpacing: "-0.01em" }}>
              TriageInsight
            </span>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem", marginLeft: "0.25rem" }}>
              / {orgSlug}
            </span>
          </div>
          <nav style={{ display: "flex", gap: "1.5rem" }}>
            <a href={`/${orgSlug}/portal/feedback`} style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.875rem", fontWeight: 500 }}>Feedback</a>
            <a href={`/${orgSlug}/portal/roadmap`} style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.875rem", fontWeight: 500 }}>Roadmap</a>
          </nav>
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
        {children}
      </main>
      <footer style={{ borderTop: "1px solid #e9ecef", padding: "1.5rem", textAlign: "center", color: "#6C757D", fontSize: "0.8rem" }}>
        Powered by <a href="/" style={{ color: "#20A4A4", fontWeight: 600 }}>TriageInsight</a>
      </footer>
    </div>
  );
}
