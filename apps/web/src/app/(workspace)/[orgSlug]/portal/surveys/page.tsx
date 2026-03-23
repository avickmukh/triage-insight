'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { usePublicSurveyList } from '@/hooks/use-surveys';

export default function PortalSurveysPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { data: surveys, isLoading } = usePublicSurveyList(orgSlug);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0a2540', marginBottom: '0.5rem' }}>
        Surveys
      </h1>
      <p style={{ color: '#6C757D', fontSize: '0.9375rem', marginBottom: '2rem' }}>
        Share your thoughts and help shape the product roadmap.
      </p>

      {isLoading ? (
        <div style={{ color: '#6C757D', textAlign: 'center', padding: '3rem' }}>Loading surveys…</div>
      ) : !surveys?.length ? (
        <div style={{
          background: '#fff', border: '1px solid #e9ecef', borderRadius: '0.875rem',
          padding: '3rem', textAlign: 'center',
          boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', marginBottom: '0.5rem' }}>No active surveys</h3>
          <p style={{ color: '#6C757D', fontSize: '0.875rem' }}>Check back later for new surveys from this team.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {surveys.map((survey: any) => (
            <Link
              key={survey.id}
              href={`/${orgSlug}/portal/surveys/${survey.id}`}
              style={{ textDecoration: 'none' }}
            >
              <div style={{
                background: '#fff', border: '1px solid #e9ecef', borderRadius: '0.875rem',
                padding: '1.5rem', boxShadow: '0 1px 4px rgba(10,37,64,0.06)',
                transition: 'box-shadow 0.15s, transform 0.15s',
                cursor: 'pointer',
              }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(10,37,64,0.12)';
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(10,37,64,0.06)';
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540', margin: '0 0 0.375rem' }}>
                      {survey.title}
                    </h2>
                    {survey.description && (
                      <p style={{ color: '#6C757D', fontSize: '0.875rem', margin: 0, lineHeight: 1.5 }}>
                        {survey.description}
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#6C757D', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {survey._count?.questions ?? 0} questions
                  </span>
                </div>
                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '0.875rem', color: '#20A4A4', fontWeight: 600 }}>Take survey →</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
