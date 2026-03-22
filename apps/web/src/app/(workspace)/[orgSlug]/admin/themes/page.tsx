'use client';

import { useState } from 'react';
import { useThemes } from '@/hooks/use-themes';
import { Theme, ThemeStatus, CreateThemeDto } from '@/lib/api-types';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { appRoutes } from '@/lib/routes';

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  [ThemeStatus.ACTIVE]: { bg: '#e8f7f7', color: '#20A4A4' },
  [ThemeStatus.DRAFT]: { bg: '#fff8e1', color: '#b8860b' },
  [ThemeStatus.ARCHIVED]: { bg: '#f0f4f8', color: '#6C757D' },
};

export default function ThemesPage() {
  const params = useParams();
  const slug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';
  const r = appRoutes(slug);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const { useThemeList, createTheme, isCreating } = useThemes();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useThemeList({});

  const allThemes: Theme[] = data?.pages?.flatMap((p: { data: Theme[] }) => p.data) ?? [];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const dto: CreateThemeDto = { title: newTitle.trim(), description: newDesc.trim() || undefined };
    createTheme(dto, {
      onSuccess: () => {
        setNewTitle('');
        setNewDesc('');
        setShowForm(false);
      },
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0A2540', marginBottom: '0.25rem' }}>Themes</h1>
          <p style={{ fontSize: '0.9rem', color: '#6C757D' }}>Cluster feedback into strategic themes.</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{ padding: '0.55rem 1.25rem', borderRadius: '0.6rem', border: 'none', background: '#FFC832', color: '#0A2540', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}
        >
          {showForm ? 'Cancel' : '+ New Theme'}
        </button>
      </div>

      {showForm && (
        <div style={{ ...CARD, borderLeft: '3px solid #20A4A4' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0A2540', marginBottom: '1rem' }}>Create Theme</h2>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#6C757D', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Title *</label>
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Onboarding Friction" required style={{ width: '100%', padding: '0.65rem 0.9rem', borderRadius: '0.5rem', border: '1px solid #dee2e6', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#6C757D', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</label>
              <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Optional description…" rows={3} style={{ width: '100%', padding: '0.65rem 0.9rem', borderRadius: '0.5rem', border: '1px solid #dee2e6', fontSize: '0.9rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            <button type="submit" disabled={isCreating} style={{ alignSelf: 'flex-start', padding: '0.55rem 1.5rem', borderRadius: '0.5rem', border: 'none', background: '#0A2540', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: isCreating ? 'not-allowed' : 'pointer' }}>
              {isCreating ? 'Creating…' : 'Create Theme'}
            </button>
          </form>
        </div>
      )}

      <div style={CARD}>
        {isLoading ? (
          <p style={{ color: '#6C757D' }}>Loading…</p>
        ) : allThemes.length === 0 ? (
          <p style={{ color: '#6C757D' }}>No themes yet. Create your first theme above.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {allThemes.map((theme) => {
              const sc = STATUS_COLORS[theme.status] ?? { bg: '#f0f4f8', color: '#6C757D' };
              return (
                <Link key={theme.id} href={r.themeItem(theme.id)} style={{ textDecoration: 'none', display: 'block', padding: '1.25rem', background: '#F8F9FA', borderRadius: '0.75rem', border: '1px solid #e9ecef' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0A2540' }}>{theme.title}</p>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', background: sc.bg, color: sc.color, flexShrink: 0, marginLeft: '0.5rem' }}>{theme.status}</span>
                  </div>
                  {theme.description && (
                    <p style={{ fontSize: '0.82rem', color: '#6C757D', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{theme.description}</p>
                  )}
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem' }}>
                    <span style={{ fontSize: '0.78rem', color: '#adb5bd' }}>{theme._count?.feedbacks ?? theme.feedbackCount ?? 0} feedback items</span>
                    {theme.pinned && <span style={{ fontSize: '0.78rem', color: '#FFC832', fontWeight: 600 }}>📌 Pinned</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {hasNextPage && (
          <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} style={{ marginTop: '1rem', width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #dee2e6', background: '#fff', color: '#20A4A4', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}
