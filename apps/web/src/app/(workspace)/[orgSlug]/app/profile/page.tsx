'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import PasswordInput from '@/components/shared/PasswordInput';
import { hashPasswordForTransmission } from '@/lib/password-hash';

/* ─── Design tokens (matches existing app) ─── */
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e9ecef',
  borderRadius: '0.875rem',
  padding: '1.75rem',
  maxWidth: 560,
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

const INPUT = (hasError: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '0.65rem 0.9rem',
  borderRadius: '0.5rem',
  border: hasError ? '1px solid #e74c3c' : '1px solid #dee2e6',
  fontSize: '0.9rem',
  color: '#0A2540',
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
});

const BTN_PRIMARY: React.CSSProperties = {
  padding: '0.65rem 1.5rem',
  borderRadius: '0.5rem',
  border: 'none',
  background: '#FFC832',
  color: '#0A2540',
  fontWeight: 700,
  fontSize: '0.88rem',
  cursor: 'pointer',
};

/* ─── Schemas ─── */
const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().optional(),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ProfileValues = z.infer<typeof profileSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

/* ─── Component ─── */
export default function ProfilePage() {
  const qc = useQueryClient();
  const [profileSuccess, setProfileSuccess] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const meQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => apiClient.auth.getMe(),
  });

  const user = meQuery.data;

  /* Profile form */
  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { firstName: '', lastName: '' },
  });

  useEffect(() => {
    if (user) {
      profileForm.reset({
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
      });
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateProfileMutation = useMutation({
    mutationFn: (data: ProfileValues) => apiClient.auth.updateProfile(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth-me'] });
      setProfileSuccess('Profile updated.');
      setTimeout(() => setProfileSuccess(''), 3000);
    },
  });

  /* Password form */
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      // Hash both passwords with SHA-256 before transmission
      const [hashedCurrent, hashedNew] = await Promise.all([
        hashPasswordForTransmission(data.currentPassword),
        hashPasswordForTransmission(data.newPassword),
      ]);
      return apiClient.auth.changePassword({ currentPassword: hashedCurrent, newPassword: hashedNew });
    },
    onSuccess: () => {
      passwordForm.reset();
      setPasswordError('');
      setPasswordSuccess('Password changed successfully.');
      setTimeout(() => setPasswordSuccess(''), 3000);
    },
    onError: (err: any) => {
      setPasswordError(err?.response?.data?.message ?? 'Failed to change password.');
    },
  });

  const onProfileSubmit = (data: ProfileValues) => {
    setProfileSuccess('');
    updateProfileMutation.mutate(data);
  };

  const onPasswordSubmit = (data: PasswordValues) => {
    setPasswordError('');
    setPasswordSuccess('');
    changePasswordMutation.mutate({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Page header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0A2540', marginBottom: '0.25rem' }}>
          My Profile
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#6C757D' }}>
          Manage your personal details and account security.
        </p>
      </div>

      {/* Profile card */}
      <div style={CARD}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0A2540', marginBottom: '1.25rem' }}>
          Personal information
        </h2>

        {meQuery.isLoading ? (
          <p style={{ color: '#6C757D', fontSize: '0.9rem' }}>Loading…</p>
        ) : (
          <form
            onSubmit={profileForm.handleSubmit(onProfileSubmit)}
            style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}
          >
            {/* Email (read-only) */}
            <div>
              <label style={LABEL}>Email</label>
              <input
                type="email"
                value={user?.email ?? ''}
                disabled
                style={{ ...INPUT(false), background: '#f8f9fa', color: '#6C757D', cursor: 'not-allowed' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 180px' }}>
                <label style={LABEL}>First name</label>
                <input
                  type="text"
                  {...profileForm.register('firstName')}
                  style={INPUT(!!profileForm.formState.errors.firstName)}
                />
                {profileForm.formState.errors.firstName && (
                  <p style={{ fontSize: '0.75rem', color: '#e74c3c', marginTop: '0.3rem' }}>
                    {profileForm.formState.errors.firstName.message}
                  </p>
                )}
              </div>
              <div style={{ flex: '1 1 180px' }}>
                <label style={LABEL}>Last name</label>
                <input
                  type="text"
                  {...profileForm.register('lastName')}
                  style={INPUT(false)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.25rem' }}>
              <button
                type="submit"
                disabled={updateProfileMutation.isPending}
                style={BTN_PRIMARY}
              >
                {updateProfileMutation.isPending ? 'Saving…' : 'Save changes'}
              </button>
              {profileSuccess && (
                <span style={{ fontSize: '0.82rem', color: '#20A4A4', fontWeight: 600 }}>
                  {profileSuccess}
                </span>
              )}
            </div>
          </form>
        )}
      </div>

      {/* Password card */}
      <div style={CARD}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0A2540', marginBottom: '1.25rem' }}>
          Change password
        </h2>

        <form
          onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
          style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}
        >
          <div>
            <label style={LABEL}>Current password</label>
            <PasswordInput
              theme="light"
              placeholder="••••••••"
              hasError={!!passwordForm.formState.errors.currentPassword}
              {...passwordForm.register('currentPassword')}
            />
            {passwordForm.formState.errors.currentPassword && (
              <p style={{ fontSize: '0.75rem', color: '#e74c3c', marginTop: '0.3rem' }}>
                {passwordForm.formState.errors.currentPassword.message}
              </p>
            )}
          </div>

          <div>
            <label style={LABEL}>New password</label>
            <PasswordInput
              theme="light"
              placeholder="At least 8 characters"
              hasError={!!passwordForm.formState.errors.newPassword}
              showStrength
              value={passwordForm.watch('newPassword')}
              {...passwordForm.register('newPassword')}
            />
            {passwordForm.formState.errors.newPassword && (
              <p style={{ fontSize: '0.75rem', color: '#e74c3c', marginTop: '0.3rem' }}>
                {passwordForm.formState.errors.newPassword.message}
              </p>
            )}
            {!passwordForm.formState.errors.newPassword && (
              <p style={{ fontSize: '0.72rem', color: '#adb5bd', marginTop: '0.35rem' }}>
                Min. 8 characters with uppercase, number, and special character.
              </p>
            )}
          </div>

          <div>
            <label style={LABEL}>Confirm new password</label>
            <PasswordInput
              theme="light"
              placeholder="Repeat new password"
              hasError={!!passwordForm.formState.errors.confirmPassword}
              {...passwordForm.register('confirmPassword')}
            />
            {passwordForm.formState.errors.confirmPassword && (
              <p style={{ fontSize: '0.75rem', color: '#e74c3c', marginTop: '0.3rem' }}>
                {passwordForm.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>

          {passwordError && (
            <p style={{ fontSize: '0.82rem', color: '#e74c3c' }}>{passwordError}</p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.25rem' }}>
            <button
              type="submit"
              disabled={changePasswordMutation.isPending}
              style={BTN_PRIMARY}
            >
              {changePasswordMutation.isPending ? 'Updating…' : 'Update password'}
            </button>
            {passwordSuccess && (
              <span style={{ fontSize: '0.82rem', color: '#20A4A4', fontWeight: 600 }}>
                {passwordSuccess}
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
