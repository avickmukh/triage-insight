'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import { WorkspaceRole } from '@/lib/api-types';

// ── Design tokens ─────────────────────────────────────────────────────────────

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

const TH: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.5rem 0.75rem',
  fontWeight: 700,
  color: '#6C757D',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const TD: React.CSSProperties = {
  padding: '0.75rem',
  fontSize: '0.88rem',
  color: '#495057',
  borderBottom: '1px solid #f0f4f8',
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

const CHECK = '✓';
const CROSS = '—';

// ── Role capability matrix ────────────────────────────────────────────────────

const CAPABILITY_MATRIX: { capability: string; admin: boolean; editor: boolean; viewer: boolean }[] = [
  { capability: 'View feedback inbox',            admin: true,  editor: true,  viewer: true  },
  { capability: 'Create feedback',                admin: true,  editor: true,  viewer: false },
  { capability: 'Edit / triage feedback',         admin: true,  editor: true,  viewer: false },
  { capability: 'Delete feedback',                admin: true,  editor: false, viewer: false },
  { capability: 'Accept / reject duplicates',     admin: true,  editor: true,  viewer: false },
  { capability: 'View themes',                    admin: true,  editor: true,  viewer: true  },
  { capability: 'Create / edit themes',           admin: true,  editor: true,  viewer: false },
  { capability: 'Delete themes',                  admin: true,  editor: false, viewer: false },
  { capability: 'Trigger theme recluster',        admin: true,  editor: true,  viewer: false },
  { capability: 'View roadmap',                   admin: true,  editor: true,  viewer: true  },
  { capability: 'Create / edit roadmap items',    admin: true,  editor: true,  viewer: false },
  { capability: 'Delete roadmap items',           admin: true,  editor: false, viewer: false },
  { capability: 'View team members',              admin: true,  editor: true,  viewer: true  },
  { capability: 'Invite members',                 admin: true,  editor: false, viewer: false },
  { capability: 'Remove members',                 admin: true,  editor: false, viewer: false },
  { capability: 'Change member roles',            admin: true,  editor: false, viewer: false },
  { capability: 'Edit workspace settings',        admin: true,  editor: false, viewer: false },
  { capability: 'Manage integrations',            admin: true,  editor: false, viewer: false },
  { capability: 'View billing information',       admin: true,  editor: false, viewer: false },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PermissionsPage() {
  const qc = useQueryClient();
  const { workspace } = useWorkspace();

  // Current user (to prevent self-role-change)
  const { data: me } = useQuery({
    queryKey: ['user', 'me'],
    queryFn: apiClient.auth.getMe,
    staleTime: 1000 * 60 * 5,
  });

  // Members list
  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspace?.id],
    queryFn: () => apiClient.workspace.getMembers(workspace!.id),
    enabled: !!workspace?.id,
  });

  // Role change mutation (same endpoint as members page)
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

  const members = membersQuery.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0A2540', marginBottom: '0.25rem' }}>
          Permissions
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#6C757D' }}>
          Review what each role can do and adjust member roles directly from this page.
        </p>
      </div>

      {/* ── Role capability matrix ── */}
      <div style={CARD}>
        <h2 style={SECTION_TITLE}>Role capability matrix</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e9ecef' }}>
                <th style={{ ...TH, width: '50%' }}>Capability</th>
                <th style={{ ...TH, textAlign: 'center' }}>
                  <span style={roleBadge('ADMIN')}>Admin</span>
                </th>
                <th style={{ ...TH, textAlign: 'center' }}>
                  <span style={roleBadge('EDITOR')}>Editor</span>
                </th>
                <th style={{ ...TH, textAlign: 'center' }}>
                  <span style={roleBadge('VIEWER')}>Viewer</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {CAPABILITY_MATRIX.map((row) => (
                <tr key={row.capability} style={{ borderBottom: '1px solid #f0f4f8' }}>
                  <td style={{ ...TD, color: '#0A2540', fontWeight: 500 }}>{row.capability}</td>
                  <td style={{ ...TD, textAlign: 'center', color: row.admin ? '#20A4A4' : '#dee2e6', fontWeight: 700 }}>
                    {row.admin ? CHECK : CROSS}
                  </td>
                  <td style={{ ...TD, textAlign: 'center', color: row.editor ? '#856404' : '#dee2e6', fontWeight: 700 }}>
                    {row.editor ? CHECK : CROSS}
                  </td>
                  <td style={{ ...TD, textAlign: 'center', color: row.viewer ? '#6C757D' : '#dee2e6', fontWeight: 700 }}>
                    {row.viewer ? CHECK : CROSS}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Member roles ── */}
      <div style={CARD}>
        <h2 style={SECTION_TITLE}>Member roles</h2>
        <p style={{ fontSize: '0.85rem', color: '#6C757D', marginBottom: '1.25rem', marginTop: '-0.5rem' }}>
          Change a member&apos;s role here or on the{' '}
          <a href="../members" style={{ color: '#20A4A4', textDecoration: 'none', fontWeight: 600 }}>
            Members
          </a>{' '}
          page. You cannot change your own role.
        </p>

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
                  {['Member', 'Email', 'Current role', 'Change role'].map((h) => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const isSelf = m.userId === me?.id;
                  const isChanging = roleMutation.isPending &&
                    (roleMutation.variables as { userId: string } | undefined)?.userId === m.userId;

                  return (
                    <tr key={m.userId} style={{ borderBottom: '1px solid #f0f4f8' }}>
                      <td style={{ ...TD, fontWeight: 600, color: '#0A2540' }}>
                        {m.user?.firstName || m.user?.lastName
                          ? `${m.user.firstName ?? ''} ${m.user.lastName ?? ''}`.trim()
                          : '—'}
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
                      <td style={TD}>{m.user?.email}</td>
                      <td style={TD}>
                        <span style={roleBadge(m.role)}>{m.role}</span>
                      </td>
                      <td style={TD}>
                        {isSelf ? (
                          <span style={{ fontSize: '0.8rem', color: '#adb5bd', fontStyle: 'italic' }}>
                            Cannot change own role
                          </span>
                        ) : (
                          <select
                            value={m.role}
                            disabled={isChanging}
                            onChange={(e) =>
                              roleMutation.mutate({ userId: m.userId, role: e.target.value })
                            }
                            style={{
                              padding: '0.3rem 0.6rem',
                              borderRadius: '0.4rem',
                              border: '1px solid #dee2e6',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              color: '#0A2540',
                              background: '#fff',
                              cursor: isChanging ? 'wait' : 'pointer',
                              opacity: isChanging ? 0.5 : 1,
                            }}
                          >
                            <option value={WorkspaceRole.VIEWER}>Viewer</option>
                            <option value={WorkspaceRole.EDITOR}>Editor</option>
                            <option value={WorkspaceRole.ADMIN}>Admin</option>
                          </select>
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

      {/* ── Role descriptions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        {[
          {
            role: 'ADMIN',
            title: 'Admin',
            desc: 'Full control over the workspace: members, settings, integrations, billing, and all product data. Assign this role sparingly.',
          },
          {
            role: 'EDITOR',
            title: 'Editor',
            desc: 'Can create and triage feedback, manage themes and roadmap items, and trigger AI jobs. Cannot change workspace settings or manage members.',
          },
          {
            role: 'VIEWER',
            title: 'Viewer',
            desc: 'Read-only access to feedback, themes, and the roadmap. Suitable for stakeholders who need visibility without edit rights.',
          },
        ].map((r) => (
          <div
            key={r.role}
            style={{
              ...CARD,
              borderLeft: `3px solid ${r.role === 'ADMIN' ? '#20A4A4' : r.role === 'EDITOR' ? '#FFC832' : '#dee2e6'}`,
            }}
          >
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={roleBadge(r.role)}>{r.title}</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#495057', lineHeight: 1.55, margin: 0 }}>
              {r.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
