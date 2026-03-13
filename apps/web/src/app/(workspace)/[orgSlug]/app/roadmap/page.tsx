'use client';

import { useState } from 'react';
import { useRoadmap } from '@/hooks/use-roadmap';
import { RoadmapItem, RoadmapStatus, CreateRoadmapItemDto } from '@/lib/api-types';

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.25rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

const COLUMNS: { status: RoadmapStatus; label: string; accent: string }[] = [
  { status: RoadmapStatus.BACKLOG, label: 'Backlog', accent: '#adb5bd' },
  { status: RoadmapStatus.EXPLORING, label: 'Exploring', accent: '#b8860b' },
  { status: RoadmapStatus.PLANNED, label: 'Planned', accent: '#1a56db' },
  { status: RoadmapStatus.COMMITTED, label: 'Committed', accent: '#7c3aed' },
  { status: RoadmapStatus.SHIPPED, label: 'Shipped', accent: '#20A4A4' },
];

export default function RoadmapPage() {
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formStatus, setFormStatus] = useState<RoadmapStatus>(RoadmapStatus.PLANNED);

  const { roadmap, isLoading, createRoadmapItem, isCreating } = useRoadmap();

 const roadmapItems = Array.isArray(roadmap) ? roadmap : [];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;
    const dto: CreateRoadmapItemDto = { title: formTitle.trim(), status: formStatus };
    createRoadmapItem(dto, {
      onSuccess: () => {
        setFormTitle('');
        setFormStatus(RoadmapStatus.PLANNED);
        setShowForm(false);
      },
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0A2540', marginBottom: '0.25rem' }}>Roadmap</h1>
          <p style={{ fontSize: '0.9rem', color: '#6C757D' }}>Plan, track, and ship product improvements.</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{ padding: '0.55rem 1.25rem', borderRadius: '0.6rem', border: 'none', background: '#FFC832', color: '#0A2540', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}
        >
          {showForm ? 'Cancel' : '+ Add Item'}
        </button>
      </div>

      {showForm && (
        <div style={{ ...CARD, borderLeft: '3px solid #20A4A4' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0A2540', marginBottom: '1rem' }}>New Roadmap Item</h2>
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 260px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#6C757D', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Title *</label>
              <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g. Bulk CSV import" required style={{ width: '100%', padding: '0.65rem 0.9rem', borderRadius: '0.5rem', border: '1px solid #dee2e6', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: '0 1 180px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#6C757D', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</label>
              <select value={formStatus} onChange={(e) => setFormStatus(e.target.value as RoadmapStatus)} style={{ width: '100%', padding: '0.65rem 0.9rem', borderRadius: '0.5rem', border: '1px solid #dee2e6', fontSize: '0.9rem', outline: 'none', background: '#fff', boxSizing: 'border-box' }}>
                {COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
              </select>
            </div>
            <button type="submit" disabled={isCreating} style={{ padding: '0.65rem 1.5rem', borderRadius: '0.5rem', border: 'none', background: '#0A2540', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: isCreating ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
              {isCreating ? 'Adding…' : 'Add'}
            </button>
          </form>
        </div>
      )}

      {isLoading ? (
        <p style={{ color: '#6C757D' }}>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'start' }}>
          {COLUMNS.map((col) => {
            const items = roadmapItems?.filter((r) => r.status === col.status);
            return (
              <div key={col.status} style={{ background: '#F8F9FA', borderRadius: '0.875rem', padding: '1rem', border: '1px solid #e9ecef' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: col.accent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{col.label}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#adb5bd', background: '#fff', border: '1px solid #e9ecef', borderRadius: '999px', padding: '0.1rem 0.5rem' }}>{items.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {items.length === 0 ? (
                    <p style={{ fontSize: '0.8rem', color: '#adb5bd', textAlign: 'center', padding: '1rem 0' }}>Empty</p>
                  ) : (
                    items.map((item) => (
                      <div key={item.id} style={{ background: '#fff', borderRadius: '0.6rem', padding: '0.875rem', border: '1px solid #e9ecef', boxShadow: '0 1px 3px rgba(10,37,64,0.04)' }}>
                        <p style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0A2540', marginBottom: item.description ? '0.25rem' : 0 }}>{item.title}</p>
                        {item.description && (
                          <p style={{ fontSize: '0.78rem', color: '#6C757D', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{item.description}</p>
                        )}
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                          {item.isPublic && <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#20A4A4', background: '#e8f7f7', padding: '0.1rem 0.45rem', borderRadius: '999px' }}>Public</span>}
                          {item.feedbackCount != null && item.feedbackCount > 0 && <span style={{ fontSize: '0.7rem', color: '#adb5bd' }}>{item.feedbackCount} feedback</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
