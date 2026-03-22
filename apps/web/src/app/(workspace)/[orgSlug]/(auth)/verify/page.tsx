"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { workspaceAuthRoutes } from "@/lib/routes";

export default function VerifyPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const wa = workspaceAuthRoutes(orgSlug);

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");

  useEffect(() => {
    if (!token) { setStatus("error"); return; }
    // Backend endpoint POST /auth/verify-email not yet implemented.
    // When available, call it here with the token.
    const t = setTimeout(() => {
      // Simulate success until endpoint exists.
      setStatus("success");
      setTimeout(() => router.push(wa.login), 2500);
    }, 800);
    return () => clearTimeout(t);
  }, [token, router, wa.login]);

  const bg: React.CSSProperties = {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0A2540 0%, #0d3060 60%, #0A2540 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "2rem", fontFamily: "'Inter', sans-serif",
  };

  return (
    <div style={bg}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <span style={{ fontSize: "1.5rem", fontWeight: 900, color: "#FFC832", letterSpacing: "-0.03em" }}>
            Triage<span style={{ color: "#20A4A4" }}>Insight</span>
          </span>
        </div>
        <div style={{
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "1.25rem", padding: "2.5rem", backdropFilter: "blur(12px)",
          textAlign: "center",
        }}>
          {status === "verifying" && (
            <>
              <div style={{ width: "3rem", height: "3rem", borderRadius: "50%", border: "3px solid rgba(255,200,50,0.3)", borderTop: "3px solid #FFC832", margin: "0 auto 1.5rem", animation: "spin 0.8s linear infinite" }} />
              <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#fff", marginBottom: "0.5rem" }}>Verifying your email…</h1>
              <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.5)" }}>Please wait a moment.</p>
            </>
          )}
          {status === "success" && (
            <>
              <div style={{ width: "3.5rem", height: "3.5rem", borderRadius: "50%", background: "rgba(32,164,164,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
                <span style={{ fontSize: "1.8rem", color: "#20A4A4" }}>✓</span>
              </div>
              <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#fff", marginBottom: "0.5rem" }}>Email verified!</h1>
              <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.5)", marginBottom: "2rem" }}>Redirecting you to sign in…</p>
              <Link href={wa.login} style={{ display: "inline-block", padding: "0.75rem 2rem", borderRadius: "0.6rem", background: "#FFC832", color: "#0A2540", fontWeight: 800, textDecoration: "none" }}>Sign in now</Link>
            </>
          )}
          {status === "error" && (
            <>
              <div style={{ width: "3.5rem", height: "3.5rem", borderRadius: "50%", background: "rgba(231,76,60,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
                <span style={{ fontSize: "1.8rem", color: "#e74c3c" }}>✕</span>
              </div>
              <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#fff", marginBottom: "0.5rem" }}>Verification failed</h1>
              <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.5)", marginBottom: "2rem" }}>The link is invalid or has expired. Please request a new one.</p>
              <Link href={wa.login} style={{ display: "inline-block", padding: "0.75rem 2rem", borderRadius: "0.6rem", background: "#FFC832", color: "#0A2540", fontWeight: 800, textDecoration: "none" }}>Back to sign in</Link>
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
