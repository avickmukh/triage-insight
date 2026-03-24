'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import apiClient from '@/lib/api-client';
import PasswordInput from '@/components/shared/PasswordInput';
import { setTokens } from '@/lib/token-storage';
import { hashPasswordForTransmission } from '@/lib/password-hash';
import { appRoutes } from '@/lib/routes';

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

type FormValues = z.infer<typeof schema>;

type InviteInfo = {
  email: string;
  role: string;
  workspaceName: string;
  workspaceSlug: string;
};

export default function AcceptInvitePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const passwordValue = watch('password');

  useEffect(() => {
    if (!token) {
      setLoadError('Missing invite token.');
      return;
    }
    apiClient.auth
      .getInviteInfo(token)
      .then(setInfo)
      .catch((err) => {
        setLoadError(err?.response?.data?.message ?? 'Invalid or expired invite link.');
      });
  }, [token]);

  const onSubmit = async (data: FormValues) => {
    setSubmitError('');
    try {
      const hashedPassword = await hashPasswordForTransmission(data.password);
      const res = await apiClient.auth.setupPassword({ token, password: hashedPassword });
      setTokens(res.accessToken, res.refreshToken);
      setDone(true);
      setTimeout(() => {
        router.push(appRoutes(info!.workspaceSlug).inbox);
      }, 1500);
    } catch (err: any) {
      setSubmitError(err?.response?.data?.message ?? 'Something went wrong. Please try again.');
    }
  };

  const bgStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0A2540 0%, #0d2e4d 60%, #0a3060 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1rem',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: 'Inter, sans-serif',
  };

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '1.25rem',
    padding: '2.5rem',
    backdropFilter: 'blur(12px)',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.78rem',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.65)',
    marginBottom: '0.4rem',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  };

  const inputStyle = (hasError: boolean): React.CSSProperties => ({
    width: '100%',
    padding: '0.7rem 1rem',
    borderRadius: '0.6rem',
    border: hasError ? '1px solid #e74c3c' : '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: '0.95rem',
    outline: 'none',
    boxSizing: 'border-box',
  });

  return (
    <div style={bgStyle}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(32,164,164,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span
              style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em' }}
            >
              Triage<span style={{ color: '#20A4A4' }}>Insight</span>
            </span>
          </Link>
        </div>

        <div style={cardStyle}>
          {loadError ? (
            <>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginBottom: '0.75rem' }}>
                Invalid invite
              </h1>
              <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.55)' }}>{loadError}</p>
              <Link
                href="/login"
                style={{
                  display: 'inline-block',
                  marginTop: '1.5rem',
                  fontSize: '0.88rem',
                  color: '#20A4A4',
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                ← Back to login
              </Link>
            </>
          ) : !info ? (
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.9rem' }}>Validating invite…</p>
          ) : done ? (
            <>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginBottom: '0.5rem' }}>
                You&apos;re in!
              </h1>
              <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.55)' }}>
                Redirecting to your workspace…
              </p>
            </>
          ) : (
            <>
              <h1
                style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', marginBottom: '0.375rem' }}
              >
                Set your password
              </h1>
              <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.55)', marginBottom: '0.25rem' }}>
                You&apos;ve been invited to{' '}
                <strong style={{ color: '#20A4A4' }}>{info.workspaceName}</strong> as{' '}
                <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{info.role.toLowerCase()}</strong>.
              </p>
              <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', marginBottom: '2rem' }}>
                {info.email}
              </p>

              <form
                onSubmit={handleSubmit(onSubmit)}
                style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
              >
                <div>
                  <label style={labelStyle}>New password</label>
                  <PasswordInput
                    placeholder="At least 8 characters"
                    hasError={!!errors.password}
                    showStrength
                    value={passwordValue}
                    {...register('password')}
                  />
                  {errors.password && (
                    <p style={{ fontSize: '0.75rem', color: '#e74c3c', marginTop: '0.3rem' }}>
                      {errors.password.message}
                    </p>
                  )}
                  {!errors.password && (
                    <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.35rem' }}>
                      Min. 8 characters with uppercase, number, and special character.
                    </p>
                  )}
                </div>

                <div>
                  <label style={labelStyle}>Confirm password</label>
                  <PasswordInput
                    placeholder="Repeat password"
                    hasError={!!errors.confirm}
                    {...register('confirm')}
                  />
                  {errors.confirm && (
                    <p style={{ fontSize: '0.75rem', color: '#e74c3c', marginTop: '0.3rem' }}>
                      {errors.confirm.message}
                    </p>
                  )}
                </div>

                {submitError && (
                  <p style={{ fontSize: '0.82rem', color: '#e74c3c' }}>{submitError}</p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '0.85rem',
                    borderRadius: '0.6rem',
                    border: 'none',
                    background: isSubmitting ? '#e6b400' : '#FFC832',
                    color: '#0A2540',
                    fontWeight: 800,
                    fontSize: '0.95rem',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    transition: 'background 0.2s',
                  }}
                >
                  {isSubmitting ? 'Setting up…' : 'Activate account'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
