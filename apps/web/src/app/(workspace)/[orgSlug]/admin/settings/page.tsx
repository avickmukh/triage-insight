'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/use-workspace';
import apiClient from '@/lib/api-client';
import { PublicPortalVisibility, UpdateWorkspaceDto, Workspace } from '@/lib/api-types';

// ── Design tokens (matches existing admin design system) ──────────────────────

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
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

// ── Timezone options (representative IANA subset) ─────────────────────────────

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const LOCALES: { value: string; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese (Simplified)' },
];

const CURRENCIES: { value: string; label: string }[] = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'JPY', label: 'JPY — Japanese Yen' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'INR', label: 'INR — Indian Rupee' },
  { value: 'BRL', label: 'BRL — Brazilian Real' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function useSettingsForm(workspace: Workspace | undefined) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [defaultLocale, setDefaultLocale] = useState('en');
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [portalVisibility, setPortalVisibility] = useState<PublicPortalVisibility>(
    PublicPortalVisibility.PUBLIC,
  );
  const [billingEmail, setBillingEmail] = useState('');

  // Sync form when workspace data loads
  useEffect(() => {
    if (!workspace) return;
    setName(workspace.name ?? '');
    setDescription(workspace.description ?? '');
    setTimezone(workspace.timezone ?? 'UTC');
    setDefaultLocale(workspace.defaultLocale ?? 'en');
    setDefaultCurrency(workspace.defaultCurrency ?? 'USD');
    setPortalVisibility(workspace.portalVisibility ?? PublicPortalVisibility.PUBLIC);
    setBillingEmail(workspace.billingEmail ?? '');
  }, [workspace]);

  const toDto = (): UpdateWorkspaceDto => ({
    name: name.trim() || undefined,
    description: description.trim() || undefined,
    timezone,
    defaultLocale,
    defaultCurrency,
    portalVisibility,
    billingEmail: billingEmail.trim() || undefined,
  });

  return {
    name, setName,
    description, setDescription,
    timezone, setTimezone,
    defaultLocale, setDefaultLocale,
    defaultCurrency, setDefaultCurrency,
    portalVisibility, setPortalVisibility,
    billingEmail, setBillingEmail,
    toDto,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const qc = useQueryClient();
  const { workspace, isLoading } = useWorkspace();

  const form = useSettingsForm(workspace);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (dto: UpdateWorkspaceDto) => apiClient.workspace.updateCurrent(dto),
    onSuccess: (updated) => {
      qc.setQueryData(['workspace', 'current'], updated);
      setSaveSuccess(true);
      setSaveError('');
      setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setSaveError(
        Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to save settings.',
      );
      setSaveSuccess(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    saveMutation.mutate(form.toDto());
  };

  if (isLoading) {
    return (
      <div style={{ color: '#6C757D', fontSize: '0.9rem', padding: '2rem 0' }}>
        Loading workspace settings…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0A2540', marginBottom: '0.25rem' }}>
          Workspace Settings
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#6C757D' }}>
          Configure your workspace identity, regional defaults, and portal visibility.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* ── General ── */}
        <div style={CARD}>
          <h2 style={SECTION_TITLE}>General</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={LABEL}>
                Workspace name <span style={{ color: '#e74c3c' }}>*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => form.setName(e.target.value)}
                placeholder="Acme Corp"
                maxLength={100}
                required
                style={INPUT}
              />
            </div>
            <div>
              <label style={LABEL}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => form.setDescription(e.target.value)}
                placeholder="A short description of your workspace…"
                maxLength={500}
                rows={3}
                style={{ ...INPUT, resize: 'vertical', lineHeight: '1.5' }}
              />
              <p style={HINT}>Shown on the public portal header. Max 500 characters.</p>
            </div>
          </div>
        </div>

        {/* ── Regional ── */}
        <div style={CARD}>
          <h2 style={SECTION_TITLE}>Regional Defaults</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={LABEL}>Timezone</label>
              <select
                value={form.timezone}
                onChange={(e) => form.setTimezone(e.target.value)}
                style={INPUT}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
              <p style={HINT}>Used for digest scheduling and timestamps.</p>
            </div>
            <div>
              <label style={LABEL}>Default language</label>
              <select
                value={form.defaultLocale}
                onChange={(e) => form.setDefaultLocale(e.target.value)}
                style={INPUT}
              >
                {LOCALES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={LABEL}>Default currency</label>
              <select
                value={form.defaultCurrency}
                onChange={(e) => form.setDefaultCurrency(e.target.value)}
                style={INPUT}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <p style={HINT}>Used for ARR and revenue context fields.</p>
            </div>
          </div>
        </div>

        {/* ── Public Portal ── */}
        <div style={CARD}>
          <h2 style={SECTION_TITLE}>Public Portal</h2>
          <div>
            <label style={LABEL}>Portal visibility</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.25rem' }}>
              {[
                {
                  value: PublicPortalVisibility.PUBLIC,
                  label: 'Public',
                  desc: 'Anyone can view the portal and submit feedback without logging in.',
                },
                {
                  value: PublicPortalVisibility.PRIVATE,
                  label: 'Private',
                  desc: 'Portal is hidden. Only authenticated portal users can access it.',
                },
              ].map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                    padding: '0.875rem 1rem',
                    borderRadius: '0.6rem',
                    border: `1px solid ${form.portalVisibility === opt.value ? '#20A4A4' : '#dee2e6'}`,
                    background: form.portalVisibility === opt.value ? '#f0fafa' : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="portalVisibility"
                    value={opt.value}
                    checked={form.portalVisibility === opt.value}
                    onChange={() => form.setPortalVisibility(opt.value)}
                    style={{ marginTop: '0.15rem', accentColor: '#20A4A4' }}
                  />
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0A2540', margin: 0 }}>
                      {opt.label}
                    </p>
                    <p style={{ fontSize: '0.8rem', color: '#6C757D', margin: '0.15rem 0 0' }}>
                      {opt.desc}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ── Billing contact ── */}
        <div style={CARD}>
          <h2 style={SECTION_TITLE}>Billing Contact</h2>
          <div>
            <label style={LABEL}>Billing email</label>
            <input
              type="email"
              value={form.billingEmail}
              onChange={(e) => form.setBillingEmail(e.target.value)}
              placeholder="billing@company.com"
              maxLength={254}
              style={INPUT}
            />
            <p style={HINT}>
              Invoices and billing notifications are sent to this address. Leave blank to use
              the workspace owner&apos;s email.
            </p>
          </div>
        </div>

        {/* ── Save bar ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1rem 1.5rem',
            background: '#fff',
            border: '1px solid #e9ecef',
            borderRadius: '0.875rem',
          }}
        >
          <button
            type="submit"
            disabled={saveMutation.isPending}
            style={saveMutation.isPending ? BTN_DISABLED : BTN_PRIMARY}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save changes'}
          </button>

          {saveSuccess && (
            <span style={{ fontSize: '0.85rem', color: '#20A4A4', fontWeight: 600 }}>
              ✓ Settings saved
            </span>
          )}

          {saveError && (
            <span style={{ fontSize: '0.85rem', color: '#e74c3c' }}>{saveError}</span>
          )}
        </div>
      </form>
    </div>
  );
}
