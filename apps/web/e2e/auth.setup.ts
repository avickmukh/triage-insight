import { test as setup, expect } from '@playwright/test';
import path from 'path';

/**
 * Authentication setup for Playwright E2E tests.
 *
 * This setup file logs in once and saves the browser storage state to a file.
 * All subsequent tests can reuse this state, avoiding repeated logins.
 *
 * Usage: add `storageState: 'e2e/.auth/user.json'` to your test project config.
 *
 * Prerequisites:
 *   - The API must be running on http://localhost:3000
 *   - A test user must exist: E2E_USER_EMAIL / E2E_USER_PASSWORD env vars
 *     (defaults to test@example.com / password123)
 */

export const AUTH_FILE = path.join(__dirname, '.auth/user.json');

const EMAIL    = process.env.E2E_USER_EMAIL    ?? 'test@example.com';
const PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password123';
const ORG_SLUG = process.env.E2E_ORG_SLUG     ?? 'test-workspace';

setup('authenticate', async ({ page }) => {
  await page.goto('/');

  // Navigate to the login page
  await page.goto('/login');

  // Fill in credentials
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();

  // Wait for successful redirect to the workspace dashboard
  await page.waitForURL(`**/${ORG_SLUG}/app**`, { timeout: 15_000 });
  await expect(page).toHaveURL(new RegExp(`/${ORG_SLUG}/app`));

  // Save the authenticated state
  await page.context().storageState({ path: AUTH_FILE });
});
