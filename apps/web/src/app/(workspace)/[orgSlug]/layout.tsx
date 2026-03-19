'use client';

import { useEffect } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/lib/auth";
import { useRouter, useParams } from "next/navigation";
import { WorkspaceStatus } from "@/lib/api-types";
import Link from "next/link";
import { appRoutes, orgAdminRoutes } from "@/lib/routes";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspace, isLoading } = useWorkspace();
  const { logout } = useAuth();
  const router = useRouter();
  const params = useParams();
  const slug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';
  const r = appRoutes(slug);
  const ra = orgAdminRoutes(slug);

  useEffect(() => {
    if (!isLoading && workspace && workspace.status !== WorkspaceStatus.ACTIVE) {
      router.push("/activation");
    }
  }, [workspace, isLoading, router]);

  if (isLoading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        Loading...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F8F9FA",
        fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif",
        color: "#0A2540",
      }}
    >
      {/* Top Navigation */}
      <header
        style={{
          background: "#0A2540",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "0 1.5rem",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Logo */}
          <Link
            href={r.dashboard}
            style={{
              color: "#fff",
              fontWeight: 700,
              fontSize: "1rem",
              textDecoration: "none",
            }}
          >
            TriageInsight
          </Link>

          {/* Menu */}
          <nav style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
            <Link href={r.inbox} style={navStyle}>Inbox</Link>
            <Link href={r.themes} style={navStyle}>Themes</Link>
            <Link href={r.roadmap} style={navStyle}>Roadmap</Link>
            <Link href={r.dashboard} style={navStyle}>Dashboard</Link>
            <Link href={ra.settings} style={navStyle}>Settings</Link>

            <button
              onClick={logout}
              style={{
                background: "#20A4A4",
                border: "none",
                color: "#fff",
                padding: "6px 12px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            >
              Logout
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "2rem 1.5rem",
        }}
      >
        {children}
      </main>
    </div>
  );
}

const navStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.75)",
  textDecoration: "none",
  fontSize: "0.9rem",
  fontWeight: 500,
};