'use client';

/**
 * PageHeader — shared page header component
 *
 * Renders:
 *  1. Flow indicator bar: Signals → Themes → Prioritization → Decisions (current stage highlighted)
 *  2. Page title + one-line description
 *  3. Optional "next action" guidance text
 */

import React from 'react';

export type FlowStage = 'signals' | 'themes' | 'prioritization' | 'decisions';

const FLOW_STAGES: { id: FlowStage; label: string }[] = [
  { id: 'signals',        label: 'Signals' },
  { id: 'themes',         label: 'Themes' },
  { id: 'prioritization', label: 'Prioritization' },
  { id: 'decisions',      label: 'Decisions' },
];

interface PageHeaderProps {
  stage: FlowStage;
  title: string;
  description: string;
  nextAction?: string;
}

export function PageHeader({ stage, title, description, nextAction }: PageHeaderProps) {
  const activeIndex = FLOW_STAGES.findIndex((s) => s.id === stage);

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {/* Flow indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          marginBottom: '1rem',
          background: '#f8fafc',
          border: '1px solid #e9ecef',
          borderRadius: '0.5rem',
          padding: '0.375rem 0.75rem',
          width: 'fit-content',
        }}
      >
        {FLOW_STAGES.map((s, i) => {
          const isActive = s.id === stage;
          const isPast   = i < activeIndex;
          return (
            <React.Fragment key={s.id}>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#1a73e8' : isPast ? '#20A4A4' : '#adb5bd',
                  background: isActive ? '#e3f2fd' : 'transparent',
                  borderRadius: '0.25rem',
                  padding: isActive ? '0.1rem 0.5rem' : '0.1rem 0.25rem',
                  letterSpacing: isActive ? '0.02em' : undefined,
                  transition: 'all 0.2s',
                }}
              >
                {s.label}
              </span>
              {i < FLOW_STAGES.length - 1 && (
                <span
                  style={{
                    fontSize: '0.65rem',
                    color: i < activeIndex ? '#20A4A4' : '#dee2e6',
                    margin: '0 0.2rem',
                    fontWeight: 600,
                  }}
                >
                  →
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Title + description */}
      <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: '#0a2540', margin: '0 0 0.25rem' }}>
        {title}
      </h1>
      <p style={{ fontSize: '0.875rem', color: '#546e7a', margin: 0, lineHeight: 1.5 }}>
        {description}
      </p>
      {nextAction && (
        <p style={{
          fontSize: '0.8rem',
          color: '#1a73e8',
          margin: '0.5rem 0 0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
        }}>
          <span style={{ fontWeight: 600 }}>Next:</span> {nextAction}
        </p>
      )}
    </div>
  );
}
