'use client';
import React, { useState, forwardRef } from 'react';

/**
 * PasswordInput
 *
 * A secure password input component with:
 * - show/hide toggle (prevents shoulder-surfing mistakes)
 * - optional strength indicator (visual feedback for strong passwords)
 * - consistent styling matching the platform dark theme
 *
 * Usage:
 *   <PasswordInput
 *     id="password"
 *     placeholder="Min. 8 characters"
 *     hasError={!!errors.password}
 *     showStrength
 *     value={watch('password')}
 *     {...register('password')}
 *   />
 */

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
  showStrength?: boolean;
  value?: string;
  /** Use 'light' for white-background forms (e.g. profile page) */
  theme?: 'dark' | 'light';
}

export type PasswordStrength = 'weak' | 'fair' | 'strong' | 'very-strong';

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password || password.length < 6) return 'weak';
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return 'weak';
  if (score === 2) return 'fair';
  if (score === 3) return 'strong';
  return 'very-strong';
}

const strengthColors: Record<PasswordStrength, string> = {
  'weak': '#e74c3c',
  'fair': '#f39c12',
  'strong': '#27ae60',
  'very-strong': '#20A4A4',
};

const strengthLabels: Record<PasswordStrength, string> = {
  'weak': 'Weak',
  'fair': 'Fair',
  'strong': 'Strong',
  'very-strong': 'Very strong',
};

const strengthWidths: Record<PasswordStrength, string> = {
  'weak': '25%',
  'fair': '50%',
  'strong': '75%',
  'very-strong': '100%',
};

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ hasError, showStrength, value, style, theme = 'dark', ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    const strength = showStrength && value ? getPasswordStrength(value) : null;

    const isLight = theme === 'light';

    const inputStyle: React.CSSProperties = isLight
      ? {
          width: '100%',
          padding: '0.65rem 2.75rem 0.65rem 0.9rem',
          borderRadius: '0.5rem',
          border: hasError ? '1px solid #e74c3c' : '1px solid #dee2e6',
          background: '#fff',
          color: '#0A2540',
          fontSize: '0.9rem',
          outline: 'none',
          boxSizing: 'border-box',
          fontFamily: 'Inter, sans-serif',
          ...style,
        }
      : {
          width: '100%',
          padding: '0.7rem 2.75rem 0.7rem 1rem',
          borderRadius: '0.6rem',
          border: hasError ? '1px solid #e74c3c' : '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(255,255,255,0.06)',
          color: '#fff',
          fontSize: '0.95rem',
          outline: 'none',
          boxSizing: 'border-box',
          fontFamily: 'Inter, sans-serif',
          ...style,
        };

    const wrapperStyle: React.CSSProperties = {
      position: 'relative',
      width: '100%',
    };

    const toggleStyle: React.CSSProperties = {
      position: 'absolute',
      right: '0.75rem',
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: isLight ? 'rgba(10,37,64,0.4)' : 'rgba(255,255,255,0.45)',
      padding: '0.2rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      lineHeight: 1,
    };

    return (
      <div style={{ width: '100%' }}>
        <div style={wrapperStyle}>
          <input
            ref={ref}
            type={visible ? 'text' : 'password'}
            style={inputStyle}
            value={value}
            autoComplete={props.name === 'currentPassword' ? 'current-password' : 'new-password'}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            style={toggleStyle}
            aria-label={visible ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {visible ? (
              // Eye-off icon
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              // Eye icon
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>

        {showStrength && value && value.length > 0 && strength && (
          <div style={{ marginTop: '0.5rem' }}>
            <div style={{
              height: '3px',
              borderRadius: '2px',
              background: 'rgba(255,255,255,0.1)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: strengthWidths[strength],
                background: strengthColors[strength],
                borderRadius: '2px',
                transition: 'width 0.3s ease, background 0.3s ease',
              }} />
            </div>
            <p style={{
              fontSize: '0.72rem',
              color: strengthColors[strength],
              marginTop: '0.25rem',
              textAlign: 'right',
            }}>
              {strengthLabels[strength]}
            </p>
          </div>
        )}
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';

export default PasswordInput;
