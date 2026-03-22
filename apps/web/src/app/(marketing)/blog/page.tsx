import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog | TriageInsight",
  description:
    "Product insights, best practices, and engineering deep-dives from the TriageInsight team.",
};

export default function BlogPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0A2540 0%, #0d2e4d 60%, #0a3060 100%)",
        fontFamily: "Inter, sans-serif",
        color: "#fff",
      }}
    >
      {/* Hero */}
      <section
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "7rem 2rem 4rem",
          textAlign: "center",
        }}
      >
        <span
          style={{
            display: "inline-block",
            background: "rgba(32,164,164,0.15)",
            border: "1px solid rgba(32,164,164,0.35)",
            borderRadius: "999px",
            padding: "0.3rem 1rem",
            fontSize: "0.78rem",
            fontWeight: 700,
            color: "#20A4A4",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: "1.5rem",
          }}
        >
          TriageInsight Blog
        </span>

        <h1
          style={{
            fontSize: "clamp(2rem, 5vw, 3.25rem)",
            fontWeight: 900,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            marginBottom: "1.25rem",
          }}
        >
          Product Insights &amp;{" "}
          <span style={{ color: "#20A4A4" }}>Best Practices</span>
        </h1>

        <p
          style={{
            fontSize: "1.1rem",
            color: "rgba(255,255,255,0.6)",
            maxWidth: 560,
            margin: "0 auto 2.5rem",
            lineHeight: 1.7,
          }}
        >
          Deep-dives on AI-powered feedback triage, product prioritisation, and
          building customer-centric products — from the TriageInsight team.
        </p>
      </section>

      {/* Coming soon card */}
      <section
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: "0 2rem 8rem",
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "1.25rem",
            padding: "3.5rem 2.5rem",
            textAlign: "center",
            backdropFilter: "blur(12px)",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              background: "rgba(32,164,164,0.12)",
              border: "1px solid rgba(32,164,164,0.25)",
              borderRadius: "1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.75rem",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M6 8h20M6 13h14M6 18h10" stroke="#20A4A4" strokeWidth="2" strokeLinecap="round" />
              <circle cx="25" cy="22" r="5" fill="rgba(32,164,164,0.2)" stroke="#20A4A4" strokeWidth="1.5" />
              <path d="M23.5 22l1 1 2-2" stroke="#20A4A4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#fff", marginBottom: "0.75rem" }}>
            Articles coming soon
          </h2>

          <p
            style={{
              fontSize: "0.95rem",
              color: "rgba(255,255,255,0.5)",
              lineHeight: 1.7,
              maxWidth: 420,
              margin: "0 auto 2rem",
            }}
          >
            We are writing in-depth guides on feedback triage, AI-assisted
            prioritisation, and building a customer-intelligence layer into your
            product workflow. Check back soon.
          </p>

          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/signup?plan=FREE"
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "#FFC832",
                color: "#0A2540",
                fontWeight: 800,
                fontSize: "0.9rem",
                padding: "0.7rem 1.5rem",
                borderRadius: "0.6rem",
                textDecoration: "none",
              }}
            >
              Try TriageInsight free
            </Link>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "rgba(255,255,255,0.8)",
                fontWeight: 600,
                fontSize: "0.9rem",
                padding: "0.7rem 1.5rem",
                borderRadius: "0.6rem",
                textDecoration: "none",
              }}
            >
              Back to home
            </Link>
          </div>
        </div>

        {/* Topics preview */}
        <div style={{ marginTop: "3rem" }}>
          <p
            style={{
              fontSize: "0.78rem",
              fontWeight: 700,
              color: "rgba(255,255,255,0.35)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              textAlign: "center",
              marginBottom: "1.25rem",
            }}
          >
            Topics we will cover
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", justifyContent: "center" }}>
            {[
              "AI Feedback Triage",
              "Product Prioritisation",
              "Customer Intelligence",
              "Voice of Customer",
              "Roadmap Strategy",
              "Integrations & Automation",
              "Weekly Digest Workflows",
              "Public Portal Best Practices",
            ].map((topic) => (
              <span
                key={topic}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "999px",
                  padding: "0.3rem 0.9rem",
                  fontSize: "0.8rem",
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
