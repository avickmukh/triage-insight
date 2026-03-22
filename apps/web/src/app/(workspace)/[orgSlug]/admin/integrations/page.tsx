'use client';
import { useState } from 'react';
import {
  useIntegrations,
  useConnectSlack,
  useConnectZendesk,
  useConnectIntercom,
  useDisconnectIntegration,
  useSyncIntegrations,
} from '@/hooks/use-integrations';
import { IntegrationProvider, IntegrationStatus } from '@/lib/api-types';
import { PlanGate } from '@/components/shared/plan-gate';

// ── Design tokens (matches existing admin design system) ──────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
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
};
const BTN_PRIMARY: React.CSSProperties = {
  padding: '0.55rem 1.1rem',
  borderRadius: '0.5rem',
  border: 'none',
  background: '#FFC832',
  color: '#0A2540',
  fontWeight: 700,
  fontSize: '0.85rem',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const BTN_DANGER: React.CSSProperties = {
  padding: '0.55rem 1.1rem',
  borderRadius: '0.5rem',
  border: '1px solid #dc3545',
  background: 'transparent',
  color: '#dc3545',
  fontWeight: 600,
  fontSize: '0.85rem',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const BTN_SECONDARY: React.CSSProperties = {
  padding: '0.55rem 1.1rem',
  borderRadius: '0.5rem',
  border: '1px solid #dee2e6',
  background: 'transparent',
  color: '#0A2540',
  fontWeight: 600,
  fontSize: '0.85rem',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const BTN_DISABLED: React.CSSProperties = {
  ...BTN_PRIMARY,
  opacity: 0.5,
  cursor: 'not-allowed',
};
const BADGE_CONNECTED: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  padding: '0.2rem 0.65rem',
  borderRadius: '999px',
  background: '#d1fae5',
  color: '#065f46',
  fontSize: '0.75rem',
  fontWeight: 600,
};
const BADGE_DISCONNECTED: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  padding: '0.2rem 0.65rem',
  borderRadius: '999px',
  background: '#f1f3f5',
  color: '#6C757D',
  fontSize: '0.75rem',
  fontWeight: 600,
};
const OVERLAY: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(10,37,64,0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
};
const MODAL: React.CSSProperties = {
  background: '#fff',
  borderRadius: '1rem',
  padding: '2rem',
  width: '100%',
  maxWidth: '420px',
  boxShadow: '0 8px 32px rgba(10,37,64,0.15)',
};

// ── Provider catalogue ─────────────────────────────────────────────
interface ProviderMeta {
  provider: IntegrationProvider;
  label: string;
  description: string;
  category: string;
  hasConnectFlow: boolean;
}

const PROVIDER_META: ProviderMeta[] = [
  {
    provider: IntegrationProvider.SLACK,
    label: 'Slack',
    description: 'Ingest feedback from Slack slash commands and channel messages. Requires a Slack App bot token.',
    category: 'Feedback Ingestion',
    hasConnectFlow: true,
  },
  {
    provider: IntegrationProvider.EMAIL,
    label: 'Email',
    description: 'Forward customer emails to your workspace inbox address to create feedback automatically.',
    category: 'Feedback Ingestion',
    hasConnectFlow: false,
  },
  {
    provider: IntegrationProvider.ZENDESK,
    label: 'Zendesk',
    description: 'Sync support tickets from Zendesk to surface customer pain points alongside product feedback.',
    category: 'Support',
    hasConnectFlow: true,
  },
  {
    provider: IntegrationProvider.INTERCOM,
    label: 'Intercom',
    description: 'Pull conversation data from Intercom to enrich your feedback signal.',
    category: 'Support',
    hasConnectFlow: true,
  },
  {
    provider: IntegrationProvider.FRESHDESK,
    label: 'Freshdesk',
    description: 'Sync Freshdesk tickets into TriageInsight for unified customer intelligence.',
    category: 'Support',
    hasConnectFlow: false,
  },
  {
    provider: IntegrationProvider.HUBSPOT,
    label: 'HubSpot',
    description: 'Enrich feedback items with deal and contact data from HubSpot CRM.',
    category: 'CRM',
    hasConnectFlow: false,
  },
  {
    provider: IntegrationProvider.SALESFORCE,
    label: 'Salesforce',
    description: 'Link feedback to Salesforce opportunities and accounts for revenue-at-risk analysis.',
    category: 'CRM',
    hasConnectFlow: false,
  },
  {
    provider: IntegrationProvider.STRIPE,
    label: 'Stripe',
    description: 'Attach MRR and subscription data to customer profiles for ARR-weighted prioritisation.',
    category: 'Billing',
    hasConnectFlow: false,
  },
];

// ── Skeleton ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ height: '1rem', width: '40%', background: '#f1f3f5', borderRadius: '0.4rem' }} />
      <div style={{ height: '0.75rem', width: '80%', background: '#f1f3f5', borderRadius: '0.4rem' }} />
      <div style={{ height: '0.75rem', width: '60%', background: '#f1f3f5', borderRadius: '0.4rem' }} />
    </div>
  );
}

// ── Connect modals ────────────────────────────────────────────────
function SlackModal({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teamName, setTeamName] = useState('');
  const { mutate, isPending, isError, error } = useConnectSlack();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    mutate(
      { accessToken: token.trim(), teamId: teamId.trim() || undefined, teamName: teamName.trim() || undefined },
      { onSuccess: onClose },
    );
  };

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={MODAL} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0A2540', marginBottom: '0.25rem' }}>Connect Slack</h2>
        <p style={{ fontSize: '0.85rem', color: '#6C757D', marginBottom: '1.25rem' }}>
          Paste your Slack bot token (xoxb-…). In production this is obtained via the Slack OAuth flow.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={LABEL}>Bot Token *</label>
            <input style={INPUT} type="password" placeholder="xoxb-…" value={token} onChange={(e) => setToken(e.target.value)} required />
          </div>
          <div>
            <label style={LABEL}>Team ID (optional)</label>
            <input style={INPUT} type="text" placeholder="T0XXXXXXX" value={teamId} onChange={(e) => setTeamId(e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>Team Name (optional)</label>
            <input style={INPUT} type="text" placeholder="Acme Corp" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
          </div>
          {isError && <p style={{ fontSize: '0.82rem', color: '#dc3545' }}>{(error as Error)?.message ?? 'Failed to connect Slack.'}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" style={BTN_SECONDARY} onClick={onClose}>Cancel</button>
            <button type="submit" style={isPending || !token.trim() ? BTN_DISABLED : BTN_PRIMARY} disabled={isPending || !token.trim()}>
              {isPending ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ZendeskModal({ onClose }: { onClose: () => void }) {
  const [subdomain, setSubdomain] = useState('');
  const [token, setToken] = useState('');
  const { mutate, isPending, isError, error } = useConnectZendesk();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subdomain.trim() || !token.trim()) return;
    mutate({ subdomain: subdomain.trim(), accessToken: token.trim() }, { onSuccess: onClose });
  };

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={MODAL} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0A2540', marginBottom: '0.25rem' }}>Connect Zendesk</h2>
        <p style={{ fontSize: '0.85rem', color: '#6C757D', marginBottom: '1.25rem' }}>
          Enter your Zendesk subdomain and an API token with read access to tickets.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={LABEL}>Subdomain *</label>
            <input style={INPUT} type="text" placeholder="yourcompany (without .zendesk.com)" value={subdomain} onChange={(e) => setSubdomain(e.target.value)} required />
          </div>
          <div>
            <label style={LABEL}>API Token *</label>
            <input style={INPUT} type="password" placeholder="Zendesk API token" value={token} onChange={(e) => setToken(e.target.value)} required />
          </div>
          {isError && <p style={{ fontSize: '0.82rem', color: '#dc3545' }}>{(error as Error)?.message ?? 'Failed to connect Zendesk.'}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" style={BTN_SECONDARY} onClick={onClose}>Cancel</button>
            <button type="submit" style={isPending || !subdomain.trim() || !token.trim() ? BTN_DISABLED : BTN_PRIMARY} disabled={isPending || !subdomain.trim() || !token.trim()}>
              {isPending ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function IntercomModal({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState('');
  const { mutate, isPending, isError, error } = useConnectIntercom();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    mutate({ accessToken: token.trim() }, { onSuccess: onClose });
  };

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={MODAL} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0A2540', marginBottom: '0.25rem' }}>Connect Intercom</h2>
        <p style={{ fontSize: '0.85rem', color: '#6C757D', marginBottom: '1.25rem' }}>
          Paste your Intercom access token. You can generate one in your Intercom Developer Hub.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={LABEL}>Access Token *</label>
            <input style={INPUT} type="password" placeholder="dG9rZW4…" value={token} onChange={(e) => setToken(e.target.value)} required />
          </div>
          {isError && <p style={{ fontSize: '0.82rem', color: '#dc3545' }}>{(error as Error)?.message ?? 'Failed to connect Intercom.'}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" style={BTN_SECONDARY} onClick={onClose}>Cancel</button>
            <button type="submit" style={isPending || !token.trim() ? BTN_DISABLED : BTN_PRIMARY} disabled={isPending || !token.trim()}>
              {isPending ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Disconnect confirm modal ───────────────────────────────────────────
function DisconnectModal({ label, onConfirm, onClose, isPending }: { label: string; onConfirm: () => void; onClose: () => void; isPending: boolean }) {
  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={MODAL} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0A2540', marginBottom: '0.5rem' }}>Disconnect {label}?</h2>
        <p style={{ fontSize: '0.88rem', color: '#6C757D', marginBottom: '1.5rem' }}>
          This will remove the stored credentials and stop any future syncs. Existing synced data is not deleted.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button style={BTN_SECONDARY} onClick={onClose}>Cancel</button>
          <button style={isPending ? { ...BTN_DANGER, opacity: 0.5, cursor: 'not-allowed' } : BTN_DANGER} onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Provider card ─────────────────────────────────────────────────────
function ProviderCard({ meta, status }: { meta: ProviderMeta; status: IntegrationStatus | undefined }) {
  const [showConnect, setShowConnect] = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const { mutate: disconnect, isPending: isDisconnecting } = useDisconnectIntegration();

  const connected = status?.connected ?? false;

  const handleDisconnect = () => {
    disconnect(meta.provider, { onSuccess: () => setShowDisconnect(false) });
  };

  const lastSynced = status?.lastSyncedAt
    ? new Date(status.lastSyncedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  const metaEntries = status?.metadata
    ? Object.entries(status.metadata).filter(([k]) => k !== 'teamId')
    : [];

  return (
    <>
      <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: '0.75rem', opacity: connected ? 1 : 0.92 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0A2540' }}>{meta.label}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6C757D', background: '#f1f3f5', borderRadius: '999px', padding: '0.1rem 0.5rem' }}>
                {meta.category}
              </span>
            </div>
            <p style={{ fontSize: '0.83rem', color: '#6C757D', margin: 0, lineHeight: 1.5 }}>{meta.description}</p>
          </div>
          <div style={{ flexShrink: 0 }}>
            {connected ? (
              <span style={BADGE_CONNECTED}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                Connected
              </span>
            ) : (
              <span style={BADGE_DISCONNECTED}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#adb5bd', display: 'inline-block' }} />
                Not connected
              </span>
            )}
          </div>
        </div>
        {connected && metaEntries.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {metaEntries.map(([k, v]) => (
              <span key={k} style={{ fontSize: '0.75rem', color: '#0A2540', background: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: '0.4rem', padding: '0.15rem 0.5rem' }}>
                <strong>{k}:</strong> {v}
              </span>
            ))}
          </div>
        )}
        {connected && lastSynced && (
          <p style={{ fontSize: '0.75rem', color: '#6C757D', margin: 0 }}>Last synced: {lastSynced}</p>
        )}
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.25rem' }}>
          {connected ? (
            <button style={BTN_DANGER} onClick={() => setShowDisconnect(true)}>Disconnect</button>
          ) : meta.hasConnectFlow ? (
            <button style={BTN_PRIMARY} onClick={() => setShowConnect(true)}>Connect</button>
          ) : (
            <button style={{ ...BTN_SECONDARY, cursor: 'not-allowed', opacity: 0.6 }} disabled title="Coming soon">Coming soon</button>
          )}
        </div>
      </div>
      {showConnect && meta.provider === IntegrationProvider.SLACK && <SlackModal onClose={() => setShowConnect(false)} />}
      {showConnect && meta.provider === IntegrationProvider.ZENDESK && <ZendeskModal onClose={() => setShowConnect(false)} />}
      {showConnect && meta.provider === IntegrationProvider.INTERCOM && <IntercomModal onClose={() => setShowConnect(false)} />}
      {showDisconnect && (
        <DisconnectModal label={meta.label} onConfirm={handleDisconnect} onClose={() => setShowDisconnect(false)} isPending={isDisconnecting} />
      )}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function IntegrationsPage() {
  const { integrations, isLoading, isError, error } = useIntegrations();
  const { mutate: sync, isPending: isSyncing, isSuccess: syncSuccess } = useSyncIntegrations();

  const statusMap = new Map(integrations.map((s) => [s.provider, s]));
  const categories = Array.from(new Set(PROVIDER_META.map((p) => p.category)));
  const connectedCount = integrations.filter((s) => s.connected).length;

  return (
    <PlanGate feature="integrations" requiredPlan="Pro">
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0A2540', margin: 0 }}>Integrations</h1>
          <p style={{ fontSize: '0.9rem', color: '#6C757D', marginTop: '0.35rem' }}>
            Connect external tools to ingest feedback, enrich customer data, and trigger syncs.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {!isLoading && !isError && (
            <span style={{ fontSize: '0.82rem', color: '#6C757D' }}>{connectedCount} of {PROVIDER_META.length} connected</span>
          )}
          <button style={isSyncing || connectedCount === 0 ? BTN_DISABLED : BTN_PRIMARY} disabled={isSyncing || connectedCount === 0} onClick={() => sync()}>
            {isSyncing ? 'Syncing…' : 'Sync all'}
          </button>
        </div>
      </div>

      {syncSuccess && (
        <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#065f46', marginBottom: '1.5rem' }}>
          Sync jobs started for all connected integrations.
        </div>
      )}

      {isError && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#c53030', marginBottom: '1.5rem' }}>
          Failed to load integrations: {(error as Error)?.message ?? 'Unknown error'}
        </div>
      )}

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        categories.map((category) => {
          const providers = PROVIDER_META.filter((p) => p.category === category);
          return (
            <div key={category} style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6C757D', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                {category}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
                {providers.map((meta) => (
                  <ProviderCard key={meta.provider} meta={meta} status={statusMap.get(meta.provider)} />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
    </PlanGate>
  );
}
