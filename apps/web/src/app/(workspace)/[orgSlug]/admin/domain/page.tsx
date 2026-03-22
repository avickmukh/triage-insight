'use client';

import { useState, useEffect } from 'react';
import { useDomain, useSetDomain, useVerifyDomain, useRemoveDomain } from '@/hooks/use-domain';
import { DomainVerificationStatus } from '@/lib/api-types';
import { isApiError } from '@/lib/api-client';

// ── Design tokens (matches existing admin design system) ──────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: '#0A2540',
  marginBottom: '1.25rem',
};

const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#6C757D',
  marginBottom: '0.4rem',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.9rem',
  borderRadius: '0.5rem',
  border: '1px solid #dee2e6',
  fontSize: '0.9rem',
  color: '#0A2540',
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
};

const HINT: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#6C757D',
  marginTop: '0.3rem',
};

const BTN_PRIMARY: React.CSSProperties = {
  padding: '0.65rem 1.5rem',
  borderRadius: '0.5rem',
  border: 'none',
  background: '#FFC832',
  color: '#0A2540',
  fontWeight: 700,
  fontSize: '0.88rem',
  cursor: 'pointer',
};

const BTN_DISABLED: React.CSSProperties = {
  ...BTN_PRIMARY,
  opacity: 0.5,
  cursor: 'not-allowed',
};

const BTN_SECONDARY: React.CSSProperties = {
  padding: '0.65rem 1.5rem',
  borderRadius: '0.5rem',
  border: '1px solid #dee2e6',
  background: '#fff',
  color: '#0A2540',
  fontWeight: 600,
  fontSize: '0.88rem',
  cursor: 'pointer',
};

const BTN_DANGER: React.CSSProperties = {
  padding: '0.65rem 1.5rem',
  borderRadius: '0.5rem',
  border: '1px solid #dc3545',
  background: '#fff',
  color: '#dc3545',
  fontWeight: 600,
  fontSize: '0.88rem',
  cursor: 'pointer',
};

const BTN_DANGER_DISABLED: React.CSSProperties = {
  ...BTN_DANGER,
  opacity: 0.5,
  cursor: 'not-allowed',
};

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<
  DomainVerificationStatus,
  { label: string; bg: string; color: string }
> = {
  [DomainVerificationStatus.UNVERIFIED]: {
    label: 'Not configured',
    bg: '#f0f4f8',
    color: '#6C757D',
  },
  [DomainVerificationStatus.PENDING]: {
    label: 'Pending verification',
    bg: '#fff8e1',
    color: '#b8860b',
  },
  [DomainVerificationStatus.VERIFIED]: {
    label: 'Verified',
    bg: '#e8f7f7',
    color: '#20A4A4',
  },
  [DomainVerificationStatus.FAILED]: {
    label: 'Verification failed',
    bg: '#fde8e8',
    color: '#dc3545',
  },
};

function StatusBadge({ status }: { status: DomainVerificationStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG[DomainVerificationStatus.UNVERIFIED];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.2rem 0.65rem',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: 700,
        background: cfg.bg,
        color: cfg.color,
      }}
    >
      {cfg.label}
    </span>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ width = '100%', height = '1rem' }: { width?: string; height?: string }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: '0.4rem',
        background: 'linear-gradient(90deg, #f0f4f8 25%, #e9ecef 50%, #f0f4f8 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s infinite',
      }}
    />
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DomainPage() {
  const { data: domain, isLoading, isError, error } = useDomain();
  const setDomainMutation = useSetDomain();
  const verifyMutation = useVerifyDomain();
  const removeMutation = useRemoveDomain();

  const [customDomainInput, setCustomDomainInput] = useState('');
  const [setError, setSetError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  // Pre-fill input when data loads
  useEffect(() => {
    if (domain?.customDomain) {
      setCustomDomainInput(domain.customDomain);
    }
  }, [domain?.customDomain]);

  function extractMessage(err: unknown): string {
    if (isApiError(err)) {
      const msg = err.response?.data?.message;
      return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'An error occurred.');
    }
    if (err instanceof Error) return err.message;
    return 'An unexpected error occurred.';
  }

  function handleSetDomain(e: React.FormEvent) {
    e.preventDefault();
    setSetError(null);
    const trimmed = customDomainInput.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!trimmed) {
      setSetError('Please enter a domain name.');
      return;
    }
    setDomainMutation.mutate(
      { customDomain: trimmed },
      {
        onError: (err) => setSetError(extractMessage(err)),
      },
    );
  }

  function handleVerify() {
    setVerifyError(null);
    verifyMutation.mutate(undefined, {
      onError: (err) => setVerifyError(extractMessage(err)),
    });
  }

  function handleRemove() {
    setRemoveError(null);
    removeMutation.mutate(undefined, {
      onSuccess: () => {
        setCustomDomainInput('');
        setShowRemoveConfirm(false);
      },
      onError: (err) => {
        setRemoveError(extractMessage(err));
        setShowRemoveConfirm(false);
      },
    });
  }

  const currentStatus = domain?.domainVerificationStatus ?? DomainVerificationStatus.UNVERIFIED;
  const hasCustomDomain = !!domain?.customDomain;
  const isVerified = currentStatus === DomainVerificationStatus.VERIFIED;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0A2540', marginBottom: '0.25rem' }}>
          Domain
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#6C757D' }}>
          Configure a custom domain for your workspace public portal.
        </p>
      </div>

      {/* ── Global load / error ─────────────────────────────────────────────── */}
      {isLoading && (
        <div style={CARD}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Skeleton width="40%" height="1.1rem" />
            <Skeleton width="70%" />
            <Skeleton width="55%" />
          </div>
        </div>
      )}

      {isError && !isLoading && (
        <div
          style={{
            ...CARD,
            borderLeft: '3px solid #dc3545',
            background: '#fde8e8',
            color: '#dc3545',
            fontSize: '0.88rem',
          }}
        >
          Failed to load domain settings: {extractMessage(error)}
        </div>
      )}

      {/* ── Current domain status card ──────────────────────────────────────── */}
      {domain && (
        <div style={CARD}>
          <p style={SECTION_TITLE}>Current domain</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Default domain */}
            <div>
              <label style={LABEL}>Default domain</label>
              <div
                style={{
                  padding: '0.65rem 0.9rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #e9ecef',
                  background: '#F8F9FA',
                  fontSize: '0.9rem',
                  color: '#0A2540',
                  fontFamily: 'monospace',
                }}
              >
                {domain.defaultDomain}
              </div>
              <p style={HINT}>
                This domain is always active and cannot be removed.
              </p>
            </div>

            {/* Custom domain status */}
            {hasCustomDomain && (
              <div>
                <label style={LABEL}>Custom domain</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      padding: '0.65rem 0.9rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #e9ecef',
                      background: '#F8F9FA',
                      fontSize: '0.9rem',
                      color: '#0A2540',
                      fontFamily: 'monospace',
                    }}
                  >
                    {domain.customDomain}
                  </span>
                  <StatusBadge status={currentStatus} />
                </div>
                {domain.domainLastCheckedAt && (
                  <p style={HINT}>
                    Last checked:{' '}
                    {new Date(domain.domainLastCheckedAt).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                )}
              </div>
            )}

            {!hasCustomDomain && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '0.5rem',
                  background: '#F8F9FA',
                  border: '1px solid #e9ecef',
                  fontSize: '0.88rem',
                  color: '#6C757D',
                }}
              >
                No custom domain configured. Use the form below to add one.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Set / update domain form ────────────────────────────────────────── */}
      {domain && (
        <div style={CARD}>
          <p style={SECTION_TITLE}>{hasCustomDomain ? 'Update custom domain' : 'Add custom domain'}</p>

          <form onSubmit={handleSetDomain} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={LABEL}>Custom domain</label>
              <input
                type="text"
                value={customDomainInput}
                onChange={(e) => setCustomDomainInput(e.target.value)}
                placeholder="feedback.acme.com"
                style={INPUT}
                disabled={setDomainMutation.isPending}
              />
              <p style={HINT}>
                Enter a bare hostname — no <code>https://</code> prefix or trailing slash.
                Example: <code>feedback.acme.com</code>
              </p>
            </div>

            {setError && (
              <div
                style={{
                  padding: '0.65rem 0.9rem',
                  borderRadius: '0.5rem',
                  background: '#fde8e8',
                  border: '1px solid #f5c2c7',
                  color: '#dc3545',
                  fontSize: '0.85rem',
                }}
              >
                {setError}
              </div>
            )}

            {setDomainMutation.isSuccess && (
              <div
                style={{
                  padding: '0.65rem 0.9rem',
                  borderRadius: '0.5rem',
                  background: '#e8f7f7',
                  border: '1px solid #b2dfdb',
                  color: '#20A4A4',
                  fontSize: '0.85rem',
                }}
              >
                Domain saved. Add the TXT record below to your DNS zone to verify ownership.
              </div>
            )}

            <div>
              <button
                type="submit"
                style={setDomainMutation.isPending ? BTN_DISABLED : BTN_PRIMARY}
                disabled={setDomainMutation.isPending}
              >
                {setDomainMutation.isPending ? 'Saving…' : hasCustomDomain ? 'Update domain' : 'Add domain'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── DNS verification instructions ──────────────────────────────────── */}
      {domain && hasCustomDomain && !isVerified && domain.domainVerificationToken && (
        <div style={{ ...CARD, borderLeft: '3px solid #FFC832' }}>
          <p style={SECTION_TITLE}>DNS verification</p>

          <p style={{ fontSize: '0.88rem', color: '#0A2540', marginBottom: '1rem', lineHeight: 1.6 }}>
            To verify ownership of <strong>{domain.customDomain}</strong>, add the following TXT
            record to your DNS zone. Changes can take up to 48 hours to propagate.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'max-content 1fr',
              gap: '0.5rem 1.5rem',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
            }}
          >
            <span style={{ color: '#6C757D', fontWeight: 600 }}>Type</span>
            <span style={{ fontFamily: 'monospace', color: '#0A2540' }}>TXT</span>

            <span style={{ color: '#6C757D', fontWeight: 600 }}>Name / Host</span>
            <span style={{ fontFamily: 'monospace', color: '#0A2540' }}>@</span>

            <span style={{ color: '#6C757D', fontWeight: 600 }}>Value</span>
            <span
              style={{
                fontFamily: 'monospace',
                color: '#0A2540',
                background: '#F8F9FA',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.3rem',
                border: '1px solid #e9ecef',
                wordBreak: 'break-all',
              }}
            >
              {domain.domainVerificationToken}
            </span>

            <span style={{ color: '#6C757D', fontWeight: 600 }}>TTL</span>
            <span style={{ fontFamily: 'monospace', color: '#0A2540' }}>3600</span>
          </div>

          {verifyError && (
            <div
              style={{
                padding: '0.65rem 0.9rem',
                borderRadius: '0.5rem',
                background: '#fde8e8',
                border: '1px solid #f5c2c7',
                color: '#dc3545',
                fontSize: '0.85rem',
                marginBottom: '1rem',
              }}
            >
              {verifyError}
            </div>
          )}

          {verifyMutation.isSuccess && (
            <div
              style={{
                padding: '0.65rem 0.9rem',
                borderRadius: '0.5rem',
                background: '#e8f7f7',
                border: '1px solid #b2dfdb',
                color: '#20A4A4',
                fontSize: '0.85rem',
                marginBottom: '1rem',
              }}
            >
              Verification check triggered. DNS propagation can take up to 48 hours.
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleVerify}
              style={verifyMutation.isPending ? BTN_DISABLED : BTN_SECONDARY}
              disabled={verifyMutation.isPending}
            >
              {verifyMutation.isPending ? 'Checking…' : 'Check verification'}
            </button>
          </div>
        </div>
      )}

      {/* ── Verified success banner ─────────────────────────────────────────── */}
      {domain && isVerified && (
        <div
          style={{
            ...CARD,
            borderLeft: '3px solid #20A4A4',
            background: '#e8f7f7',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>✓</span>
            <div>
              <p style={{ fontWeight: 700, color: '#0A2540', marginBottom: '0.2rem' }}>
                Domain verified
              </p>
              <p style={{ fontSize: '0.85rem', color: '#6C757D' }}>
                <strong>{domain.customDomain}</strong> is verified and active. Your public portal
                is accessible at this domain.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove domain ───────────────────────────────────────────────────── */}
      {domain && hasCustomDomain && (
        <div style={CARD}>
          <p style={SECTION_TITLE}>Remove custom domain</p>
          <p style={{ fontSize: '0.88rem', color: '#6C757D', marginBottom: '1rem', lineHeight: 1.6 }}>
            Removing the custom domain will revert your portal to the default{' '}
            <strong>{domain.defaultDomain}</strong> address. This action cannot be undone.
          </p>

          {removeError && (
            <div
              style={{
                padding: '0.65rem 0.9rem',
                borderRadius: '0.5rem',
                background: '#fde8e8',
                border: '1px solid #f5c2c7',
                color: '#dc3545',
                fontSize: '0.85rem',
                marginBottom: '1rem',
              }}
            >
              {removeError}
            </div>
          )}

          {!showRemoveConfirm ? (
            <button
              type="button"
              onClick={() => setShowRemoveConfirm(true)}
              style={BTN_DANGER}
            >
              Remove domain
            </button>
          ) : (
            <div
              style={{
                padding: '1rem',
                borderRadius: '0.5rem',
                background: '#fde8e8',
                border: '1px solid #f5c2c7',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <p style={{ fontSize: '0.88rem', color: '#dc3545', fontWeight: 600 }}>
                Are you sure? This will remove <strong>{domain.customDomain}</strong> from your
                workspace.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={handleRemove}
                  style={removeMutation.isPending ? BTN_DANGER_DISABLED : BTN_DANGER}
                  disabled={removeMutation.isPending}
                >
                  {removeMutation.isPending ? 'Removing…' : 'Yes, remove domain'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRemoveConfirm(false)}
                  style={BTN_SECONDARY}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Shimmer keyframe ─────────────────────────────────────────────────── */}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
