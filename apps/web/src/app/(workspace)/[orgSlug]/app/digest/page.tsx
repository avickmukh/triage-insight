'use client';
import { PlanGate } from '@/components/shared/plan-gate';

/**
 * Weekly AI Digest page — BUSINESS plan only.
 * FREE and PRO plan users see an upgrade prompt.
 */
export default function DigestPage() {
  return (
    <PlanGate feature="weeklyDigest" requiredPlan="Business">
      <div style={{ padding: '2rem 0' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0A2540', marginBottom: '0.5rem' }}>
          Weekly AI Digest
        </h1>
        <p style={{ color: '#6C757D', marginBottom: '2rem' }}>
          Receive a weekly AI-generated summary of your top feedback trends, emerging themes,
          and prioritization signals.
        </p>
        <div
          style={{
            border: '2px dashed #dee2e6',
            borderRadius: '0.75rem',
            padding: '3rem 2rem',
            textAlign: 'center',
            color: '#6C757D',
          }}
        >
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Weekly digest coming soon</p>
          <p style={{ fontSize: '0.875rem' }}>
            Your first digest will be delivered every Monday morning.
          </p>
        </div>
      </div>
    </PlanGate>
  );
}
