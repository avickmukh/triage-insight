'use client';
import { useFeedback } from '@/hooks/use-feedback';
import { useThemes } from '@/hooks/use-themes';
import { useRoadmap } from '@/hooks/use-roadmap';
import { FeedbackStatus, RoadmapStatus, ThemeStatus } from '@/lib/api-types';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { appRoutes } from '@/lib/routes';

const CARD: React.CSSProperties = {
  background: '#fff',
  borderRadius: '0.75rem',
  border: '1px solid #e9ecef',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
};

function StatCard({ label, value, sub, accent = '#0A2540' }: { label: string; value: string | number; sub: string; accent?: string }) {
  return (
    <div style={{ ...CARD, borderTop: `3px solid ${accent}` }}>
      <p style={{ fontSize: '0.8rem', color: '#6C757D', marginBottom: '0.4rem' }}>{label}</p>
      <p style={{ fontSize: '2rem', fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: '0.78rem', color: '#adb5bd', marginTop: '0.3rem' }}>{sub}</p>
    </div>
  );
}

export default function DashboardPage() {
  const params = useParams();
  const slug = (Array.isArray(params.orgSlug) ? params.orgSlug[0] : params.orgSlug) ?? '';
  const r = appRoutes(slug);

  const { useFeedbackList } = useFeedback();
  const feedbackQuery = useFeedbackList({});
  const allFeedback = feedbackQuery.data?.pages?.flatMap((p: { data: { id: string; title: string; description?: string; status: FeedbackStatus }[] }) => p.data) ?? [];
  const newFeedbackCount = allFeedback.filter((f) => f.status === FeedbackStatus.NEW).length;
  const recentFeedback = allFeedback.slice(0, 5);

  const { useThemeList } = useThemes();
  const themeQuery = useThemeList({ status: ThemeStatus.ACTIVE });
  const activeThemeCount = themeQuery.data?.pages?.flatMap((p: { data: unknown[] }) => p.data)?.length ?? 0;

  const { roadmap, isLoading: rmLoading } = useRoadmap();
  const roadmapItems = (roadmap as { id: string; status: RoadmapStatus }[] | undefined) ?? [];
  const committedCount = roadmapItems.filter((item) => item.status === RoadmapStatus.COMMITTED).length;
  const shippedCount = roadmapItems.filter((item) => item.status === RoadmapStatus.SHIPPED).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0A2540', marginBottom: '0.25rem' }}>Dashboard</h1>
        <p style={{ fontSize: '0.9rem', color: '#6C757D' }}>Overview of your workspace feedback and roadmap activity.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        <StatCard label="New Feedback" value={feedbackQuery.isLoading ? '…' : newFeedbackCount} sub="Awaiting triage" />
        <StatCard label="Active Themes" value={themeQuery.isLoading ? '…' : activeThemeCount} sub="Across all channels" accent="#20A4A4" />
        <StatCard label="Committed" value={rmLoading ? '…' : committedCount} sub="Roadmap items" />
        <StatCard label="Shipped" value={rmLoading ? '…' : shippedCount} sub="This quarter" accent="#20A4A4" />
      </div>
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0A2540' }}>Recent Feedback</h2>
          <Link href={r.inbox} style={{ fontSize: '0.82rem', color: '#20A4A4', textDecoration: 'none', fontWeight: 600 }}>View all →</Link>
        </div>
        {feedbackQuery.isLoading ? (
          <p style={{ color: '#6C757D', fontSize: '0.9rem' }}>Loading…</p>
        ) : recentFeedback.length === 0 ? (
          <p style={{ color: '#6C757D', fontSize: '0.9rem' }}>No feedback yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {recentFeedback.map((fb) => (
              <Link key={fb.id} href={r.inboxItem(fb.id)} style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.875rem 1rem', background: '#F8F9FA', borderRadius: '0.6rem', border: '1px solid #e9ecef' }}>
                <div>
                  <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0A2540', marginBottom: '0.2rem' }}>{fb.title}</p>
                  {fb.description && <p style={{ fontSize: '0.8rem', color: '#6C757D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>{fb.description}</p>}
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '999px', background: fb.status === FeedbackStatus.NEW ? '#e8f7f7' : '#f0f4f8', color: fb.status === FeedbackStatus.NEW ? '#20A4A4' : '#6C757D', whiteSpace: 'nowrap', marginLeft: '1rem', flexShrink: 0 }}>
                  {fb.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        {[
          { href: r.themes,  label: 'Manage Themes',  desc: 'Cluster and organise feedback' },
          { href: r.roadmap, label: 'View Roadmap',   desc: 'Track planned and shipped work' },
          { href: r.voice,   label: 'Voice Feedback', desc: 'Upload and triage call recordings' },
          { href: r.digest,  label: 'Weekly Digest',  desc: 'AI-generated feedback summary' },
        ].map((q) => (
          <Link key={q.href} href={q.href} style={{ ...CARD, textDecoration: 'none', display: 'block', borderLeft: '3px solid #20A4A4' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0A2540', marginBottom: '0.25rem' }}>{q.label}</p>
            <p style={{ fontSize: '0.8rem', color: '#6C757D' }}>{q.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
