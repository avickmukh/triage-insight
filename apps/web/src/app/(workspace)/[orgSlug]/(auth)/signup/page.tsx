'use client';

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/lib/auth";
import { useParams } from "next/navigation";
import { workspaceAuthRoutes } from "@/lib/routes";

const signupSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignupFormValues = z.infer<typeof signupSchema>;

const inputStyle = (hasError: boolean): React.CSSProperties => ({
  width: "100%",
  padding: "0.7rem 1rem",
  borderRadius: "0.6rem",
  border: hasError ? "1px solid #e74c3c" : "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  fontSize: "0.95rem",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "Inter, sans-serif",
});

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.78rem",
  fontWeight: 600,
  color: "rgba(255,255,255,0.65)",
  marginBottom: "0.4rem",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

export default function SignupPage() {
  const { signUp } = useAuth();
  const params = useParams();
  const slug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';
  const wa = workspaceAuthRoutes(slug);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({ resolver: zodResolver(signupSchema) });

  const onSubmit = (data: SignupFormValues) => {
    signUp(data);
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

      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 460 }}>
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
            Start for free
          </h1>
          <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.55)", marginBottom: "2rem" }}>
            Create your TriageInsight workspace in 30 seconds
          </p>

          <form
            onSubmit={handleSubmit(onSubmit)}
            style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label htmlFor="firstName" style={labelStyle}>First name</label>
                <input
                  id="firstName"
                  placeholder="Ada"
                  {...register("firstName")}
                  style={inputStyle(!!errors.firstName)}
                />
                {errors.firstName && (
                  <p style={{ fontSize: "0.75rem", color: "#e74c3c", marginTop: "0.3rem" }}>
                    {errors.firstName.message}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="lastName" style={labelStyle}>Last name</label>
                <input
                  id="lastName"
                  placeholder="Lovelace"
                  {...register("lastName")}
                  style={inputStyle(!!errors.lastName)}
                />
                {errors.lastName && (
                  <p style={{ fontSize: "0.75rem", color: "#e74c3c", marginTop: "0.3rem" }}>
                    {errors.lastName.message}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="email" style={labelStyle}>Work email</label>
              <input
                id="email"
                type="email"
                placeholder="ada@company.com"
                {...register("email")}
                style={inputStyle(!!errors.email)}
              />
              {errors.email && (
                <p style={{ fontSize: "0.75rem", color: "#e74c3c", marginTop: "0.3rem" }}>
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" style={labelStyle}>Password</label>
              <input
                id="password"
                type="password"
                placeholder="Min. 8 characters"
                {...register("password")}
                style={inputStyle(!!errors.password)}
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
              {isSubmitting ? "Creating workspace…" : "Create free account"}
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
            Already have an account?{" "}
            <Link href={wa.login} style={{ color: "#20A4A4", textDecoration: "none", fontWeight: 600 }}>
              Sign in
            </Link>
          </p>

          <p
            style={{
              marginTop: "1rem",
              textAlign: "center",
              fontSize: "0.75rem",
              color: "rgba(255,255,255,0.3)",
            }}
          >
            By creating an account you agree to our{" "}
            <Link href="/legal/terms" style={{ color: "rgba(255,255,255,0.45)", textDecoration: "underline" }}>
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" style={{ color: "rgba(255,255,255,0.45)", textDecoration: "underline" }}>
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
