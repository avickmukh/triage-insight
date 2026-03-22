'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import { useWorkspaceLimits } from '@/hooks/use-workspace-limits';
import { InviteMemberDto, WorkspaceRole } from '@/lib/api-types';

// ── Design tokens ─────────────────────────────────────────────────────────────

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

const BTN_DISABLED: React.CSSProperties = {
  ...BTN_DANGER,
  opacity: 0.4,
  cursor: 'not-allowed',
};

const ROLE_BADGE: Record<string, React.CSSProperties> = {
  ADMIN:  { background: '#e8f7f7', color: '#20A4A4', fontWeight: 700 },
  EDITOR: { background: '#fff3cd', color: '#856404', fontWeight: 700 },
  VIEWER: { background: '#f0f4f8', color: '#6C757D', fontWeight: 600 },
};

const roleBadge = (role: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '0.2rem 0.6rem',
  borderRadius: '999px',
  fontSize: '0.72rem',
  ...(ROLE_BADGE[role] ?? ROLE_BADGE.VIEWER),
});

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MembersPage() {
  const params = useParams();
  const slug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';
  const qc = useQueryClient();
  const { workspace } = useWorkspace();

  // Resolve the current user's id so we can prevent self-removal / self-role-change
  const { data: me } = useQuery({
    queryKey: ['user', 'me'],
    queryFn: apiClient.auth.getMe,
    staleTime: 1000 * 60 * 5,
  });

  // ── Invite form state ──────────────────────────────────────────────────────
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [invitePosition, setInvitePosition] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>(WorkspaceRole.VIEWER);
  const [inviteError, setInviteError] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [copyLabel, setCopyLabel] = useState('Copy link');

  // ── Queries ────────────────────────────────────────────────────────────────

  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspace?.id],
    queryFn: () => apiClient.workspace.getMembers(workspace!.id),
    enabled: !!workspace?.id,
  });

  const invitesQuery = useQuery({
    queryKey: ['workspace-invites'],
    queryFn: () => apiClient.workspace.getPendingInvites(),
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const inviteMutation = useMutation({
    mutationFn: (data: InviteMemberDto) => apiClient.workspace.inviteMember(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['workspace-invites'] });
      setInviteEmail('');
      setInviteFirstName('');
      setInviteLastName('');
      setInvitePosition('');
      setInviteError('');
      const link = `${window.location.origin}/accept-invite?token=${res.inviteToken}`;
      setInviteLink(link);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setInviteError(
        Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to send invite.',
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => apiClient.workspace.removeMember(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-members', workspace?.id] }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      alert(Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to remove member.');
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiClient.workspace.updateMemberRole(userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-members', workspace?.id] }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      alert(Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to update role.');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => apiClient.workspace.revokeInvite(inviteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-invites'] }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      alert(Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to revoke invite.');
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteLink('');
    const dto: InviteMemberDto = {
      email: inviteEmail.trim(),
      role: inviteRole,
      ...(inviteFirstName.trim() && { firstName: inviteFirstName.trim() }),
      ...(inviteLastName.trim() && { lastName: inviteLastName.trim() }),
      ...(invitePosition.trim() && { position: invitePosition.trim() }),
    };
    inviteMutation.mutate(dto);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopyLabel('Copied!');
    setTimeout(() => setCopyLabel('Copy link'), 2000);
  };

  const handleRemove = (userId: string, email: string) => {
    if (userId === me?.id) {
      alert('You cannot remove yourself from the workspace.');
      return;
    }
    if (confirm(`Remove ${email} from this workspace?`)) {
      removeMutation.mutate(userId);
    }
  };

  const handleRoleChange = (userId: string, newRole: string) => {
    if (userId === me?.id) {
      alert('You cannot change your own role.');
      return;
    }
    roleMutation.mutate({ userId, role: newRole });
  };

  // ── Derived data ───────────────────────────────────────────────────────────

  const members = membersQuery.data ?? [];
  const invites = invitesQuery.data ?? [];

  // ── Plan limits ────────────────────────────────────────────────────────────
  const { limits } = useWorkspaceLimits();
  const seatUsed = limits?.seats.used ?? members.length;
  const seatMax = limits?.seats.limit;
  const adminUsed = limits?.admins.used ?? members.filter((m) => m.role === WorkspaceRole.ADMIN).length;
  const adminMax = limits?.admins.limit;

  // ── Render ─────────────────────────────────────────────────────────────────

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
        {/* Seat / admin limit badges */}
        {limits && (
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, padding: '0.2rem 0.75rem', borderRadius: '999px', background: seatMax !== null && seatUsed >= seatMax ? '#fff5f5' : '#f1f3f5', color: seatMax !== null && seatUsed >= seatMax ? '#c53030' : '#0A2540' }}>
              {seatMax === null ? `${seatUsed} seats used (unlimited)` : `${seatUsed} / ${seatMax} seats used`}
            </span>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, padding: '0.2rem 0.75rem', borderRadius: '999px', background: adminMax !== null && adminUsed >= adminMax ? '#fff5f5' : '#f1f3f5', color: adminMax !== null && adminUsed >= adminMax ? '#c53030' : '#0A2540' }}>
              {adminMax === null ? `${adminUsed} admins (unlimited)` : `${adminUsed} / ${adminMax} admins`}
            </span>
          </div>
        )}
      </div>

      {/* ── Invite form ── */}
      <div style={CARD}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0A2540', marginBottom: '1.25rem' }}>
          Invite a team member
        </h2>
        <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Row 1: Name + Email */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: '0.75rem' }}>
            <div>
              <label style={LABEL}>First name</label>
              <input
                type="text"
                value={inviteFirstName}
                onChange={(e) => setInviteFirstName(e.target.value)}
                placeholder="Ada"
                maxLength={100}
                style={INPUT}
              />
            </div>
            <div>
              <label style={LABEL}>Last name</label>
              <input
                type="text"
                value={inviteLastName}
                onChange={(e) => setInviteLastName(e.target.value)}
                placeholder="Lovelace"
                maxLength={100}
                style={INPUT}
              />
            </div>
            <div>
              <label style={LABEL}>
                Email address <span style={{ color: '#e74c3c' }}>*</span>
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="ada@company.com"
                required
                style={INPUT}
              />
            </div>
          </div>

          {/* Row 2: Position + Role + Submit */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={LABEL}>Position / title</label>
              <input
                type="text"
                value={invitePosition}
                onChange={(e) => setInvitePosition(e.target.value)}
                placeholder="e.g. Support Lead"
                maxLength={200}
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
            <button
              type="submit"
              disabled={inviteMutation.isPending}
              style={inviteMutation.isPending ? { ...BTN_PRIMARY, opacity: 0.5, cursor: 'not-allowed' } : BTN_PRIMARY}
            >
              {inviteMutation.isPending ? 'Sending…' : 'Send invite'}
            </button>
          </div>
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
            <button
              onClick={copyLink}
              style={{ ...BTN_GHOST, borderColor: '#20A4A4', color: '#20A4A4' }}
            >
              {copyLabel}
            </button>
          </div>
        )}
      </div>

      {/* ── Members table ── */}
      <div style={CARD}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0A2540', marginBottom: '1.25rem' }}>
          Current members
        </h2>

        {membersQuery.isLoading ? (
          <p style={{ color: '#6C757D', fontSize: '0.9rem' }}>Loading…</p>
        ) : membersQuery.isError ? (
          <p style={{ color: '#e74c3c', fontSize: '0.9rem' }}>Failed to load members.</p>
        ) : members.length === 0 ? (
          <p style={{ color: '#6C757D', fontSize: '0.9rem' }}>No members found.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e9ecef' }}>
                  {['Name', 'Email', 'Position', 'Role', 'Joined', ''].map((h) => (
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
                {members.map((m) => {
                  const isSelf = m.userId === me?.id;
                  const isChangingRole = roleMutation.isPending &&
                    (roleMutation.variables as { userId: string } | undefined)?.userId === m.userId;
                  const isRemoving = removeMutation.isPending &&
                    removeMutation.variables === m.userId;

                  return (
                    <tr key={m.userId} style={{ borderBottom: '1px solid #f0f4f8' }}>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ fontWeight: 600, color: '#0A2540' }}>
                          {m.user?.firstName || m.user?.lastName
                            ? `${m.user.firstName ?? ''} ${m.user.lastName ?? ''}`.trim()
                            : '—'}
                        </span>
                        {isSelf && (
                          <span
                            style={{
                              marginLeft: '0.5rem',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: '#20A4A4',
                              background: '#e8f7f7',
                              padding: '0.1rem 0.45rem',
                              borderRadius: '999px',
                            }}
                          >
                            You
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem', color: '#495057' }}>{m.user?.email}</td>
                      <td style={{ padding: '0.75rem', color: '#6C757D', fontSize: '0.82rem' }}>
                        {m.position ?? <span style={{ opacity: 0.4 }}>—</span>}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        {isSelf ? (
                          /* Self: show badge only — cannot change own role */
                          <span style={roleBadge(m.role)}>{m.role}</span>
                        ) : (
                          <select
                            value={m.role}
                            disabled={isChangingRole}
                            onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                            style={{
                              padding: '0.3rem 0.6rem',
                              borderRadius: '0.4rem',
                              border: '1px solid #dee2e6',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              color: '#0A2540',
                              background: '#fff',
                              cursor: isChangingRole ? 'wait' : 'pointer',
                              opacity: isChangingRole ? 0.5 : 1,
                            }}
                          >
                            <option value={WorkspaceRole.VIEWER}>Viewer</option>
                            <option value={WorkspaceRole.EDITOR}>Editor</option>
                            <option value={WorkspaceRole.ADMIN}>Admin</option>
                          </select>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem', color: '#6C757D', fontSize: '0.82rem' }}>
                        {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        {isSelf ? (
                          /* Cannot remove yourself */
                          <button disabled style={BTN_DISABLED} title="You cannot remove yourself">
                            Remove
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRemove(m.userId, m.user?.email ?? m.userId)}
                            disabled={isRemoving}
                            style={isRemoving ? BTN_DISABLED : BTN_DANGER}
                          >
                            {isRemoving ? 'Removing…' : 'Remove'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pending invites ── */}
      {(invitesQuery.isLoading || invites.length > 0) && (
        <div style={CARD}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0A2540', marginBottom: '1.25rem' }}>
            Pending invites
          </h2>

          {invitesQuery.isLoading ? (
            <p style={{ color: '#6C757D', fontSize: '0.9rem' }}>Loading…</p>
          ) : invites.length === 0 ? null : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e9ecef' }}>
                    {['Email', 'Name', 'Position', 'Role', 'Expires', ''].map((h) => (
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
                  {invites.map((inv) => {
                    const isRevoking = revokeMutation.isPending && revokeMutation.variables === inv.id;
                    const invExt = inv as {
                      id: string;
                      email: string;
                      role: string;
                      expiresAt: string;
                      firstName?: string;
                      lastName?: string;
                      position?: string;
                    };
                    return (
                      <tr key={invExt.id} style={{ borderBottom: '1px solid #f0f4f8' }}>
                        <td style={{ padding: '0.75rem', color: '#495057' }}>{invExt.email}</td>
                        <td style={{ padding: '0.75rem', color: '#0A2540', fontSize: '0.82rem' }}>
                          {invExt.firstName || invExt.lastName
                            ? `${invExt.firstName ?? ''} ${invExt.lastName ?? ''}`.trim()
                            : <span style={{ opacity: 0.4 }}>—</span>}
                        </td>
                        <td style={{ padding: '0.75rem', color: '#6C757D', fontSize: '0.82rem' }}>
                          {invExt.position ?? <span style={{ opacity: 0.4 }}>—</span>}
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={roleBadge(invExt.role)}>{invExt.role}</span>
                        </td>
                        <td style={{ padding: '0.75rem', color: '#6C757D', fontSize: '0.82rem' }}>
                          {new Date(invExt.expiresAt).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          <button
                            onClick={() => revokeMutation.mutate(invExt.id)}
                            disabled={isRevoking}
                            style={isRevoking ? BTN_DISABLED : BTN_DANGER}
                          >
                            {isRevoking ? 'Revoking…' : 'Revoke'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
