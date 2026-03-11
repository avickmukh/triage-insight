'use client';

import { useParams } from "next/navigation";
import Link from "next/link";
import { usePublicRoadmap } from "@/hooks/use-public-portal";
import { RoadmapStatus } from "@/lib/api-types";

// ─── Status display config ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; order: number }> = {
  [RoadmapStatus.BACKLOG]:   { label: "Backlog",    bg: "#f8f9fa", color: "#495057", order: 0 },
  [RoadmapStatus.EXPLORING]: { label: "Exploring",  bg: "#e8f7f7", color: "#0A7070", order: 1 },
  [RoadmapStatus.PLANNED]:   { label: "Planned",    bg: "#D1ECF1", color: "#0C5460", order: 2 },
  [RoadmapStatus.COMMITTED]: { label: "Committed",  bg: "#FFF3CD", color: "#856404", order: 3 },
  [RoadmapStatus.SHIPPED]:   { label: "Shipped",    bg: "#D4EDDA", color: "#155724", order: 4 },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublicRoadmapPage() {
  const params = useParams();
  const orgSlug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? "";

  const { data, isLoading, isError } = usePublicRoadmap(orgSlug);

  // Group items by status
  const columns = Object.entries(STATUS_CONFIG)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([status, config]) => ({
      status,
      config,
      items: (data?.data ?? []).filter((item) => item.status === status),
    }))
    .filter((col) => col.items.length > 0);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#0A2540", letterSpacing: "-0.02em", marginBottom: "0.4rem" }}>Product Roadmap</h1>
        <p style={{ color: "#6C757D", fontSize: "0.95rem" }}>See what we&apos;re working on, what&apos;s coming next, and what we&apos;ve already shipped.</p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "#6C757D" }}>Loading roadmap…</div>
      )}

      {/* Error */}
      {isError && (
        <div style={{ background: "#FFF3F3", border: "1px solid #E85D4A", borderRadius: 8, padding: "0.75rem 1rem", color: "#E85D4A", fontSize: "0.875rem" }}>
          Failed to load the roadmap. Please refresh the page.
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && columns.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "#6C757D" }}>
          No public roadmap items yet.
        </div>
      )}

      {/* Kanban columns */}
      {!isLoading && !isError && columns.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
          {columns.map(({ status, config, items }) => (
            <div key={status}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                <span style={{ background: config.bg, color: config.color, fontSize: "0.75rem", fontWeight: 700, padding: "0.25rem 0.65rem", borderRadius: 20 }}>
                  {config.label}
                </span>
                <span style={{ color: "#6C757D", fontSize: "0.8rem" }}>
                  {items.length} item{items.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                {items.map((item) => (
                  <div key={item.id} style={{ background: "#ffffff", border: "1px solid #e9ecef", borderRadius: 10, padding: "1rem 1.25rem", boxShadow: "0 2px 8px rgba(10,37,64,0.05)" }}>
                    <h3 style={{ fontSize: "0.9rem", fontWeight: 600, color: "#0A2540", marginBottom: "0.35rem" }}>{item.title}</h3>
                    {item.description && (
                      <p style={{ fontSize: "0.8rem", color: "#6C757D", margin: 0, lineHeight: 1.5 }}>{item.description}</p>
                    )}
                    {(item.targetQuarter || item.targetYear) && (
                      <p style={{ fontSize: "0.75rem", color: "#20A4A4", marginTop: "0.5rem", marginBottom: 0 }}>
                        Target: {[item.targetQuarter, item.targetYear].filter(Boolean).join(" ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <div style={{ marginTop: "2.5rem", textAlign: "center" }}>
        <p style={{ color: "#6C757D", fontSize: "0.875rem", marginBottom: "0.75rem" }}>Have a feature request?</p>
        <Link href={`/${orgSlug}/feedback/new`} style={{ display: "inline-block", background: "#FFC857", color: "#0A2540", fontWeight: 700, fontSize: "0.875rem", padding: "0.625rem 1.25rem", borderRadius: 8 }}>
          Submit Feedback
        </Link>
      </div>
    </div>
  );
}
