"use client";

import { useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { workspaceAuthRoutes } from "@/lib/routes";
import apiClient from "@/lib/api-client";
import PasswordInput from "@/components/shared/PasswordInput";
import { hashPasswordForTransmission } from "@/lib/password-hash";

interface RequestFormValues { email: string; }
interface ConfirmFormValues { password: string; confirmPassword: string; }

const inputStyle = (hasError: boolean): React.CSSProperties => ({
  width: "100%", padding: "0.7rem 1rem", borderRadius: "0.6rem",
  border: hasError ? "1px solid #e74c3c" : "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: "0.95rem",
  outline: "none", boxSizing: "border-box",
});

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "0.78rem", fontWeight: 600,
  color: "rgba(255,255,255,0.65)", marginBottom: "0.4rem",
  letterSpacing: "0.06em", textTransform: "uppercase",
};

const errorBanner = (msg: string) => (
  <div style={{
    background: "rgba(231,76,60,0.12)", border: "1px solid rgba(231,76,60,0.4)",
    borderRadius: "0.6rem", padding: "0.75rem 1rem", color: "#e74c3c",
    fontSize: "0.85rem", marginBottom: "1.25rem",
  }}>{msg}</div>
);

export default function ResetPasswordPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const wa = workspaceAuthRoutes(orgSlug);

  const [requestSent, setRequestSent] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const { register: regReq, handleSubmit: handleReq, formState: { errors: reqErrors, isSubmitting: reqSubmitting } } = useForm<RequestFormValues>();

  const onRequestSubmit = async (values: RequestFormValues) => {
    setRequestError(null);
    try {
      await apiClient.auth.forgotPassword({ email: values.email });
    } catch {
      // Always show the success state to prevent user enumeration
    } finally {
      setRequestSent(true);
    }
  };

  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const { register: regConf, handleSubmit: handleConf, watch, formState: { errors: confErrors, isSubmitting: confSubmitting } } = useForm<ConfirmFormValues>();
  const passwordValue = watch("password");

  const onConfirmSubmit = async (values: ConfirmFormValues) => {
    setConfirmError(null);
    if (!token) {
      setConfirmError("Reset token is missing. Please use the link from your email.");
      return;
    }
    try {
      const hashedPassword = await hashPasswordForTransmission(values.password);
      await apiClient.auth.resetPassword({ token, password: hashedPassword });
      setResetSuccess(true);
      setTimeout(() => router.push(wa.login), 2000);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Reset failed. The link may have expired.";
      setConfirmError(message);
    }
  };

  const bg: React.CSSProperties = {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0A2540 0%, #0d3060 60%, #0A2540 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "2rem", fontFamily: "'Inter', sans-serif",
  };
  const card: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "1.25rem", padding: "2.5rem", backdropFilter: "blur(12px)",
  };
  const btn = (disabled: boolean): React.CSSProperties => ({
    width: "100%", padding: "0.85rem", borderRadius: "0.6rem", border: "none",
    background: disabled ? "#e6b400" : "#FFC832", color: "#0A2540",
    fontWeight: 800, fontSize: "0.95rem", cursor: disabled ? "not-allowed" : "pointer",
  });

  return (
    <div style={bg}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <span style={{ fontSize: "1.5rem", fontWeight: 900, color: "#FFC832", letterSpacing: "-0.03em" }}>
            Triage<span style={{ color: "#20A4A4" }}>Insight</span>
          </span>
        </div>
        <div style={card}>
          {token ? (
            resetSuccess ? (
              <>
                <div style={{ width: "3rem", height: "3rem", borderRadius: "50%", background: "rgba(32,164,164,0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.25rem" }}>
                  <span style={{ fontSize: "1.5rem", color: "#20A4A4" }}>✓</span>
                </div>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fff", marginBottom: "0.5rem" }}>Password updated</h1>
                <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.55)", marginBottom: "2rem" }}>Your password has been reset. Redirecting you to sign in…</p>
              </>
            ) : (
            <>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fff", marginBottom: "0.375rem" }}>Set new password</h1>
              <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.55)", marginBottom: "2rem" }}>Choose a strong password for your account.</p>
              {confirmError && errorBanner(confirmError)}
              <form onSubmit={handleConf(onConfirmSubmit)} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div>
                  <label htmlFor="password" style={labelStyle}>New Password</label>
                  <PasswordInput
                    id="password"
                    placeholder="Min. 8 characters"
                    hasError={!!confErrors.password}
                    showStrength
                    value={passwordValue}
                    {...regConf('password', {
                      required: 'Password is required',
                      minLength: { value: 8, message: 'At least 8 characters' },
                      pattern: {
                        value: /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/,
                        message: 'Must include uppercase, number, and special character',
                      },
                    })}
                  />
                  {confErrors.password && <p style={{ fontSize: "0.75rem", color: "#e74c3c", marginTop: "0.3rem" }}>{confErrors.password.message}</p>}
                  {!confErrors.password && (
                    <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.35rem' }}>
                      Min. 8 characters with uppercase, number, and special character.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="confirmPassword" style={labelStyle}>Confirm Password</label>
                  <PasswordInput
                    id="confirmPassword"
                    placeholder="••••••••"
                    hasError={!!confErrors.confirmPassword}
                    {...regConf('confirmPassword', { required: 'Please confirm', validate: (v) => v === passwordValue || 'Passwords do not match' })}
                  />
                  {confErrors.confirmPassword && <p style={{ fontSize: "0.75rem", color: "#e74c3c", marginTop: "0.3rem" }}>{confErrors.confirmPassword.message}</p>}
                </div>
                <button type="submit" disabled={confSubmitting} style={btn(confSubmitting)}>{confSubmitting ? "Saving…" : "Set password"}</button>
              </form>
            </>
            )
          ) : requestSent ? (
            <>
              <div style={{ width: "3rem", height: "3rem", borderRadius: "50%", background: "rgba(32,164,164,0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.25rem" }}>
                <span style={{ fontSize: "1.5rem", color: "#20A4A4" }}>✓</span>
              </div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fff", marginBottom: "0.5rem" }}>Check your email</h1>
              <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.55)", marginBottom: "2rem" }}>If that address is registered, you will receive a reset link shortly.</p>
              <Link href={wa.login} style={{ display: "block", textAlign: "center", padding: "0.85rem", borderRadius: "0.6rem", background: "#FFC832", color: "#0A2540", fontWeight: 800, fontSize: "0.95rem", textDecoration: "none" }}>Back to sign in</Link>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fff", marginBottom: "0.375rem" }}>Reset your password</h1>
              <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.55)", marginBottom: "2rem" }}>Enter your email and we will send you a reset link.</p>
              {requestError && errorBanner(requestError)}
              <form onSubmit={handleReq(onRequestSubmit)} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div>
                  <label htmlFor="email" style={labelStyle}>Email</label>
                  <input id="email" type="email" placeholder="you@company.com"
                    {...regReq("email", { required: "Email is required" })}
                    style={inputStyle(!!reqErrors.email)} />
                  {reqErrors.email && <p style={{ fontSize: "0.75rem", color: "#e74c3c", marginTop: "0.3rem" }}>{reqErrors.email.message}</p>}
                </div>
                <button type="submit" disabled={reqSubmitting} style={btn(reqSubmitting)}>{reqSubmitting ? "Sending…" : "Send reset link"}</button>
              </form>
              <p style={{ marginTop: "1.5rem", textAlign: "center", fontSize: "0.85rem", color: "rgba(255,255,255,0.5)" }}>
                <Link href={wa.login} style={{ color: "#20A4A4", textDecoration: "none", fontWeight: 600 }}>← Back to sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
