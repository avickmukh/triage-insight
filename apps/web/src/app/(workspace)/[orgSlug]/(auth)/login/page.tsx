'use client';

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = (data: LoginFormValues) => {
    login(data);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0A2540 0%, #0d2e4d 60%, #0a3060 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
        position: "relative",
        overflow: "hidden",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(32,164,164,0.18) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: "1.5rem", fontWeight: 900, color: "#fff", letterSpacing: "-0.03em" }}>
              Triage<span style={{ color: "#20A4A4" }}>Insight</span>
            </span>
          </Link>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "1.25rem",
            padding: "2.5rem",
            backdropFilter: "blur(12px)",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fff", marginBottom: "0.375rem" }}>
            Welcome back
          </h1>
          <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.55)", marginBottom: "2rem" }}>
            Sign in to your TriageInsight workspace
          </p>

          <form
            onSubmit={handleSubmit(onSubmit)}
            style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
          >
            <div>
              <label
                htmlFor="email"
                style={{
                  display: "block",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.65)",
                  marginBottom: "0.4rem",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                {...register("email")}
                style={{
                  width: "100%",
                  padding: "0.7rem 1rem",
                  borderRadius: "0.6rem",
                  border: errors.email ? "1px solid #e74c3c" : "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  fontSize: "0.95rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {errors.email && (
                <p style={{ fontSize: "0.75rem", color: "#e74c3c", marginTop: "0.3rem" }}>
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.4rem",
                }}
              >
                <label
                  htmlFor="password"
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.65)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  Password
                </label>
                <Link
                  href="/reset-password"
                  style={{ fontSize: "0.78rem", color: "#20A4A4", textDecoration: "none" }}
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register("password")}
                style={{
                  width: "100%",
                  padding: "0.7rem 1rem",
                  borderRadius: "0.6rem",
                  border: errors.password ? "1px solid #e74c3c" : "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  fontSize: "0.95rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {errors.password && (
                <p style={{ fontSize: "0.75rem", color: "#e74c3c", marginTop: "0.3rem" }}>
                  {errors.password.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: "100%",
                padding: "0.85rem",
                borderRadius: "0.6rem",
                border: "none",
                background: isSubmitting ? "#e6b400" : "#FFC832",
                color: "#0A2540",
                fontWeight: 800,
                fontSize: "0.95rem",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                transition: "background 0.2s",
              }}
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p
            style={{
              marginTop: "1.5rem",
              textAlign: "center",
              fontSize: "0.85rem",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            No account?{" "}
            <Link href="/signup" style={{ color: "#20A4A4", textDecoration: "none", fontWeight: 600 }}>
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
