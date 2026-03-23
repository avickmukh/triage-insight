'use client';
import { useState } from 'react';
import {
  useIntegrations,
  useConnectSlack,
  useConnectZendesk,
  useConnectIntercom,
  useDisconnectIntegration,
  useSyncIntegrations,
  useSlackChannels,
  useConfigureSlackChannels,
  useSyncSlack,
} from '@/hooks/use-integrations';
import { IntegrationProvider, IntegrationStatus } from '@/lib/api-types';

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
const BADGE_ERROR: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  padding: '0.2rem 0.65rem',
  borderRadius: '999px',
  background: '#fff5f5',
  color: '#c53030',
  fontSize: '0.75rem',
  fontWeight: 600,
  border: '1px solid #feb2b2',
};
const BADGE_DEGRADED: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  padding: '0.2rem 0.65rem',
  borderRadius: '999px',
  background: '#fffbeb',
  color: '#92400e',
  fontSize: '0.75rem',
  fontWeight: 600,
  border: '1px solid #fde68a',
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

// ── Slack channel configuration modal ───────────────────────────────────────
function SlackChannelModal({ onClose }: { onClose: () => void }) {
  const { channels, isLoading } = useSlackChannels();
  const { mutate: configure, isPending, isError, error } = useConfigureSlackChannels();
  const [selected, setSelected] = useState<Array<{ id: string; name: string }>>([]);

  const toggle = (ch: { id: string; name: string }) => {
    setSelected((prev) =>
      prev.some((s) => s.id === ch.id) ? prev.filter((s) => s.id !== ch.id) : [...prev, ch],
    );
  };

  const handleSave = () => {
    configure({ channels: selected }, { onSuccess: onClose });
  };

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={{ ...MODAL, maxWidth: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0A2540', marginBottom: '0.25rem' }}>Configure Slack Channels</h2>
        <p style={{ fontSize: '0.85rem', color: '#6C757D', marginBottom: '1.25rem' }}>
          Select the channels TriageInsight should monitor for feedback messages.
        </p>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ height: '2.5rem', background: '#f1f3f5', borderRadius: '0.4rem' }} />
            ))}
          </div>
        ) : channels.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: '#6C757D', textAlign: 'center', padding: '2rem 0' }}>
            No channels found. Ensure the bot has been added to at least one channel.
          </p>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
            {channels.map((ch) => {
              const isSelected = selected.some((s) => s.id === ch.id);
              return (
                <label
                  key={ch.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: `1px solid ${isSelected ? '#0ea5e9' : '#e9ecef'}`,
                    background: isSelected ? '#f0f9ff' : '#fff',
                    cursor: 'pointer',
                    fontSize: '0.88rem',
                    color: '#0A2540',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(ch)}
                    style={{ accentColor: '#0ea5e9', width: '1rem', height: '1rem' }}
                  />
                  <span style={{ fontWeight: 500 }}>#{ch.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#6C757D' }}>{ch.id}</span>
                </label>
              );
            })}
          </div>
        )}
        {isError && <p style={{ fontSize: '0.82rem', color: '#dc3545', marginBottom: '0.5rem' }}>{(error as Error)?.message ?? 'Failed to save channels.'}</p>}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid #e9ecef' }}>
          <button type="button" style={BTN_SECONDARY} onClick={onClose}>Cancel</button>
          <button
            type="button"
            style={isPending || selected.length === 0 ? BTN_DISABLED : BTN_PRIMARY}
            disabled={isPending || selected.length === 0}
            onClick={handleSave}
          >
            {isPending ? 'Saving…' : `Save ${selected.length > 0 ? `(${selected.length})` : ''}`}
          </button>
        </div>
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
  const [showChannels, setShowChannels] = useState(false);
  const { mutate: disconnect, isPending: isDisconnecting } = useDisconnectIntegration();
  const { mutate: syncSlack, isPending: isSyncingSlack, isSuccess: slackSyncSuccess } = useSyncSlack();

  const connected = status?.connected ?? false;
  const isSlack = meta.provider === IntegrationProvider.SLACK;
  const isError = status?.status === 'ERROR' || status?.healthState === 'ERROR';
  const isDegraded = status?.healthState === 'DEGRADED';
  const errorMessage = status?.lastErrorMessage;
  const lastErrorAt = status?.lastErrorAt
    ? new Date(status.lastErrorAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  const handleDisconnect = () => {
    disconnect(meta.provider, { onSuccess: () => setShowDisconnect(false) });
  };

  const lastSynced = status?.lastSyncedAt
    ? new Date(status.lastSyncedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  // For Slack, extract configured channels from metadata
  const slackMeta = isSlack && status?.metadata ? status.metadata as Record<string, unknown> : null;
  const configuredChannels = slackMeta?.channels as Array<{ id: string; name: string }> | undefined;
  const slackTeamName = slackMeta?.teamName as string | undefined;

  const metaEntries = status?.metadata && !isSlack
    ? Object.entries(status.metadata as Record<string, string>).filter(([k]) => k !== 'teamId')
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
            {connected && isError ? (
              <span style={BADGE_ERROR}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c53030', display: 'inline-block' }} />
                Error
              </span>
            ) : connected && isDegraded ? (
              <span style={BADGE_DEGRADED}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                Degraded
              </span>
            ) : connected ? (
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

        {/* Slack-specific: team name + configured channels */}
        {isSlack && connected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {slackTeamName && (
              <p style={{ fontSize: '0.78rem', color: '#0A2540', margin: 0 }}>
                <strong>Workspace:</strong> {slackTeamName}
              </p>
            )}
            {configuredChannels && configuredChannels.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {configuredChannels.map((ch) => (
                  <span key={ch.id} style={{ fontSize: '0.72rem', color: '#0369a1', background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: '0.4rem', padding: '0.1rem 0.45rem', fontWeight: 500 }}>
                    #{ch.name}
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.75rem', color: '#f59e0b', margin: 0 }}>
                No channels configured — click "Configure Channels" to select which channels to monitor.
              </p>
            )}
          </div>
        )}

        {/* Non-Slack metadata */}
        {!isSlack && connected && metaEntries.length > 0 && (
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

        {/* Error state panel */}
        {connected && isError && (
          <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', borderRadius: '0.5rem', padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#c53030', margin: 0 }}>Connection error</p>
            {errorMessage && <p style={{ fontSize: '0.75rem', color: '#c53030', margin: 0 }}>{errorMessage}</p>}
            {lastErrorAt && <p style={{ fontSize: '0.72rem', color: '#9b2c2c', margin: 0 }}>Occurred: {lastErrorAt}</p>}
            <p style={{ fontSize: '0.72rem', color: '#9b2c2c', margin: 0 }}>Reconnect or check credentials to restore the integration.</p>
          </div>
        )}

        {slackSyncSuccess && (
          <p style={{ fontSize: '0.75rem', color: '#065f46', background: '#d1fae5', borderRadius: '0.4rem', padding: '0.3rem 0.6rem', margin: 0 }}>
            Slack sync job queued. New messages will appear in your inbox shortly.
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
          {connected ? (
            <>
              {isSlack && (
                <>
                  <button style={BTN_SECONDARY} onClick={() => setShowChannels(true)}>Configure Channels</button>
                  <button
                    style={isSyncingSlack ? BTN_DISABLED : BTN_PRIMARY}
                    disabled={isSyncingSlack}
                    onClick={() => syncSlack()}
                  >
                    {isSyncingSlack ? 'Syncing…' : 'Sync Now'}
                  </button>
                </>
              )}
              <button style={BTN_DANGER} onClick={() => setShowDisconnect(true)}>Disconnect</button>
            </>
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
      {showChannels && isSlack && <SlackChannelModal onClose={() => setShowChannels(false)} />}
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
