"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import apiClient, { isApiError } from "@/lib/api-client";
import { publicRoutes } from "@/lib/routes";
import PasswordInput from "@/components/shared/PasswordInput";
import { hashPasswordForTransmission } from "@/lib/password-hash";

interface FormValues {
  email: string;
  password: string;
}

const PORTAL_USER_KEY = "portalUser";
const PORTAL_TOKEN_KEY = "portalAccessToken";

export default function PortalLoginPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>();

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const hashedPassword = await hashPasswordForTransmission(values.password);
      const res = await apiClient.auth.portalLogin(orgSlug, { ...values, password: hashedPassword });
      if (typeof window !== "undefined") {
        localStorage.setItem(PORTAL_USER_KEY, JSON.stringify(res.portalUser));
        localStorage.setItem(PORTAL_TOKEN_KEY, res.accessToken);
      }
      router.push(publicRoutes(orgSlug).feedback);
    } catch (err) {
      if (isApiError(err)) {
        setServerError(
          (err.response?.data as { message?: string })?.message ||
            "Invalid email or password."
        );
      } else {
        setServerError("Something went wrong. Please try again.");
      }
    }
  };

  const pr = publicRoutes(orgSlug);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0A2540 0%, #0d3060 60%, #0A2540 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: "420px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <Link href={pr.feedback} style={{ textDecoration: "none" }}>
            <span
              style={{
                fontSize: "1.5rem",
                fontWeight: 900,
                color: "#FFC832",
                letterSpacing: "-0.03em",
              }}
            >
              Triage<span style={{ color: "#20A4A4" }}>Insight</span>
            </span>
          </Link>
          <p
            style={{
              marginTop: "0.4rem",
              fontSize: "0.8rem",
              color: "rgba(255,255,255,0.4)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Customer Portal
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "1.25rem",
            padding: "2.5rem",
            backdropFilter: "blur(12px)",
          }}
        >
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 800,
              color: "#fff",
              marginBottom: "0.375rem",
            }}
          >
            Sign in to the portal
          </h1>
          <p
            style={{
              fontSize: "0.9rem",
              color: "rgba(255,255,255,0.55)",
              marginBottom: "2rem",
            }}
          >
            Submit and track your feedback
          </p>

          {serverError && (
            <div
              style={{
                background: "rgba(231,76,60,0.12)",
                border: "1px solid rgba(231,76,60,0.4)",
                borderRadius: "0.6rem",
                padding: "0.75rem 1rem",
                color: "#e74c3c",
                fontSize: "0.85rem",
                marginBottom: "1.25rem",
              }}
            >
              {serverError}
            </div>
          )}

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
                {...register("email", { required: "Email is required" })}
                style={{
                  width: "100%",
                  padding: "0.7rem 1rem",
                  borderRadius: "0.6rem",
                  border: errors.email
                    ? "1px solid #e74c3c"
                    : "1px solid rgba(255,255,255,0.15)",
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
              <label
                htmlFor="password"
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
                Password
              </label>
              <PasswordInput
                id="password"
                placeholder="••••••••"
                hasError={!!errors.password}
                {...register("password", { required: "Password is required" })}
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
            <Link
              href={`/${orgSlug}/portal/signup`}
              style={{ color: "#20A4A4", textDecoration: "none", fontWeight: 600 }}
            >
              Create one free
            </Link>
          </p>

          <p
            style={{
              marginTop: "0.75rem",
              textAlign: "center",
              fontSize: "0.85rem",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            <Link
              href={pr.feedback}
              style={{ color: "rgba(255,255,255,0.4)", textDecoration: "none", fontSize: "0.8rem" }}
            >
              Continue without signing in →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
