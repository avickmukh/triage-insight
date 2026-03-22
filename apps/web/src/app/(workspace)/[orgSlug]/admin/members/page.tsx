'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import { WorkspaceRole } from '@/lib/api-types';

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
  padding: '0.65rem 1.25rem',
  borderRadius: '0.5rem',
  border: 'none',
  background: '#FFC832',
  color: '#0A2540',
  fontWeight: 700,
  fontSize: '0.88rem',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const BTN_GHOST: React.CSSProperties = {
  padding: '0.4rem 0.75rem',
  borderRadius: '0.4rem',
  border: '1px solid #dee2e6',
  background: 'transparent',
  color: '#6C757D',
  fontWeight: 600,
  fontSize: '0.8rem',
  cursor: 'pointer',
};

const BTN_DANGER: React.CSSProperties = {
  ...BTN_GHOST,
  borderColor: '#f8d7da',
  color: '#e74c3c',
};

const ROLE_BADGE: Record<string, React.CSSProperties> = {
  ADMIN: { background: '#e8f7f7', color: '#20A4A4', fontWeight: 700 },
  EDITOR: { background: '#fff3cd', color: '#856404', fontWeight: 700 },
  VIEWER: { background: '#f0f4f8', color: '#6C757D', fontWeight: 600 },
};

const roleBadge = (role: string) => ({
  display: 'inline-block',
  padding: '0.2rem 0.6rem',
  borderRadius: '999px',
  fontSize: '0.72rem',
  ...(ROLE_BADGE[role] ?? ROLE_BADGE.VIEWER),
});

export default function MembersPage() {
  const params = useParams();
  const slug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';
  const qc = useQueryClient();
  const { workspace } = useWorkspace();

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>(WorkspaceRole.VIEWER);
  const [inviteError, setInviteError] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [copyLabel, setCopyLabel] = useState('Copy link');

  // Members list
  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspace?.id],
    queryFn: () => apiClient.workspace.getMembers(workspace!.id),
    enabled: !!workspace?.id,
  });

  // Pending invites
  const invitesQuery = useQuery({
    queryKey: ['workspace-invites'],
    queryFn: () => apiClient.workspace.getPendingInvites(),
  });

  // Invite mutation
  const inviteMutation = useMutation({
    mutationFn: (data: { email: string; role: string }) =>
      apiClient.workspace.inviteMember(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['workspace-invites'] });
      setInviteEmail('');
      setInviteError('');
      const link = `${window.location.origin}/accept-invite?token=${res.inviteToken}`;
      setInviteLink(link);
    },
    onError: (err: any) => {
      setInviteError(err?.response?.data?.message ?? 'Failed to send invite.');
    },
  });

  // Remove member mutation
  const removeMutation = useMutation({
    mutationFn: (userId: string) => apiClient.workspace.removeMember(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-members', workspace?.id] }),
  });

  // Role change mutation
  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiClient.workspace.updateMemberRole(userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-members', workspace?.id] }),
  });

  // Revoke invite mutation
  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => apiClient.workspace.revokeInvite(inviteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-invites'] }),
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteLink('');
    inviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopyLabel('Copied!');
    setTimeout(() => setCopyLabel('Copy link'), 2000);
  };

  const members = membersQuery.data ?? [];
  const invites = invitesQuery.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0A2540', marginBottom: '0.25rem' }}>
          Team Members
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#6C757D' }}>
          Manage who has access to the <strong>{workspace?.name ?? slug}</strong> workspace.
        </p>
      </div>

      {/* Invite form */}
      <div style={CARD}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0A2540', marginBottom: '1.25rem' }}>
          Invite a team member
        </h2>
        <form onSubmit={handleInvite} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label style={LABEL}>Email address</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              required
              style={INPUT}
            />
          </div>
          <div style={{ flex: '0 0 140px' }}>
            <label style={LABEL}>Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
              style={{ ...INPUT }}
            >
              <option value={WorkspaceRole.VIEWER}>Viewer</option>
              <option value={WorkspaceRole.EDITOR}>Editor</option>
              <option value={WorkspaceRole.ADMIN}>Admin</option>
            </select>
          </div>
          <button type="submit" disabled={inviteMutation.isPending} style={BTN_PRIMARY}>
            {inviteMutation.isPending ? 'Sending…' : 'Send invite'}
          </button>
        </form>

        {inviteError && (
          <p style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: '#e74c3c' }}>{inviteError}</p>
        )}

        {inviteLink && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.875rem 1rem',
              background: '#f0fafa',
              border: '1px solid #b2e0e0',
              borderRadius: '0.6rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '0.82rem', color: '#0A2540', flex: 1, wordBreak: 'break-all' }}>
              {inviteLink}
            </span>
            <button onClick={copyLink} style={{ ...BTN_GHOST, borderColor: '#20A4A4', color: '#20A4A4' }}>
              {copyLabel}
            </button>
          </div>
        )}
      </div>

      {/* Members table */}
      <div style={CARD}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0A2540', marginBottom: '1.25rem' }}>
          Current members
        </h2>
        {membersQuery.isLoading ? (
          <p style={{ color: '#6C757D', fontSize: '0.9rem' }}>Loading…</p>
        ) : members.length === 0 ? (
          <p style={{ color: '#6C757D', fontSize: '0.9rem' }}>No members found.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e9ecef' }}>
                  {['Name', 'Email', 'Role', 'Joined', ''].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        padding: '0.5rem 0.75rem',
                        fontWeight: 700,
                        color: '#6C757D',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m: any) => (
                  <tr key={m.userId} style={{ borderBottom: '1px solid #f0f4f8' }}>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{ fontWeight: 600, color: '#0A2540' }}>
                        {m.user?.firstName || m.user?.lastName
                          ? `${m.user.firstName ?? ''} ${m.user.lastName ?? ''}`.trim()
                          : '—'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', color: '#495057' }}>{m.user?.email}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <select
                        value={m.role}
                        onChange={(e) => roleMutation.mutate({ userId: m.userId, role: e.target.value })}
                        style={{
                          padding: '0.3rem 0.6rem',
                          borderRadius: '0.4rem',
                          border: '1px solid #dee2e6',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          color: '#0A2540',
                          background: '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        <option value={WorkspaceRole.VIEWER}>Viewer</option>
                        <option value={WorkspaceRole.EDITOR}>Editor</option>
                        <option value={WorkspaceRole.ADMIN}>Admin</option>
                      </select>
                    </td>
                    <td style={{ padding: '0.75rem', color: '#6C757D', fontSize: '0.82rem' }}>
                      {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${m.user?.email} from this workspace?`)) {
                            removeMutation.mutate(m.userId);
                          }
                        }}
                        style={BTN_DANGER}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div style={CARD}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0A2540', marginBottom: '1.25rem' }}>
            Pending invites
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e9ecef' }}>
                  {['Email', 'Role', 'Expires', ''].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        padding: '0.5rem 0.75rem',
                        fontWeight: 700,
                        color: '#6C757D',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invites.map((inv: any) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #f0f4f8' }}>
                    <td style={{ padding: '0.75rem', color: '#495057' }}>{inv.email}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={roleBadge(inv.role)}>{inv.role}</span>
                    </td>
                    <td style={{ padding: '0.75rem', color: '#6C757D', fontSize: '0.82rem' }}>
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <button
                        onClick={() => revokeMutation.mutate(inv.id)}
                        style={BTN_DANGER}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
